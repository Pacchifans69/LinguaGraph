import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

async function createDocument(request: APIRequestContext, title: string) {
  const project = await (await request.post('/api/v1/projects', { data: { name: `${title} project` } })).json() as { id: string };
  return await (await request.post(`/api/v1/projects/${project.id}/documents`, { data: { title } })).json() as { id: string };
}

async function createVersion(request: APIRequestContext, documentId: string, label: string, language: string, content: string) {
  return await (await request.post(`/api/v1/documents/${documentId}/text-versions`, {
    data: { label, language_tag: language, content },
  })).json() as { id: string; content: string; content_hash: string };
}

async function openVersion(page: Page, label: string) {
  const button = page.getByRole('button', { name: `Open ${label}` });
  if (await button.isVisible()) await button.click();
  await expect(page.locator('.panel-slot', { hasText: label })).toBeVisible();
}

async function selectCanonical(page: Page, versionId: string, start: number, end: number) {
  await page.locator(`[data-text-content-root][data-text-version-id="${versionId}"]`).evaluate(
    (root, range) => {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let offset = 0;
      let startNode: Node | null = null;
      let endNode: Node | null = null;
      let startOffset = 0;
      let endOffset = 0;
      while (walker.nextNode()) {
        const node = walker.currentNode;
        const length = node.textContent?.length ?? 0;
        if (startNode === null && range.start <= offset + length) {
          startNode = node;
          startOffset = range.start - offset;
        }
        if (range.end <= offset + length) {
          endNode = node;
          endOffset = range.end - offset;
          break;
        }
        offset += length;
      }
      if (!startNode || !endNode) throw new Error('selection range did not resolve');
      const nativeRange = document.createRange();
      nativeRange.setStart(startNode, startOffset);
      nativeRange.setEnd(endNode, endOffset);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(nativeRange);
      root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    },
    { start, end },
  );
}

test('M6 task deck preserves canonical selection, mounted sessions and mode-independent connectors', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 IA');
  const english = await createVersion(request, document.id, 'M6 English', 'en', 'Hello world.');
  const german = await createVersion(request, document.id, 'M6 German', 'de', 'Hallo 🙂 Welt.');

  const sentence = await (await request.put(`/api/v1/text-versions/${english.id}/segmentations/sentence`, {
    data: {
      content_hash: english.content_hash, requested_locale: 'en', resolved_locale: 'en', origin: 'manual',
      segments: [{ start: 0, end: 12 }],
    },
  })).json() as { layer: { id: string } };
  const token = await (await request.put(`/api/v1/text-versions/${english.id}/segmentations/token`, {
    data: {
      content_hash: english.content_hash, basis_sentence_layer_id: sentence.layer.id,
      requested_locale: 'en', resolved_locale: 'en', origin: 'manual',
      segments: [
        { start: 0, end: 5, is_word_like: true },
        { start: 5, end: 6, is_word_like: false },
        { start: 6, end: 11, is_word_like: true },
        { start: 11, end: 12, is_word_like: false },
      ],
    },
  })).json() as { segments: Array<{ id: string; exact_text: string }> };
  const hello = token.segments.find((segment) => segment.exact_text === 'Hello')!;
  await request.put(`/api/v1/token-segments/${hello.id}/lemma`, { data: { lemma: 'hello' } });
  await request.put(`/api/v1/token-segments/${hello.id}/pos`, { data: { pos_tag: 'INTJ' } });

  await page.goto(`/documents/${document.id}/workspace`);
  await openVersion(page, 'M6 English');
  await openVersion(page, 'M6 German');

  await expect(page.getByRole('tab')).toHaveCount(5);
  await expect(page.getByRole('tab', { name: 'Alignment' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.panel-slot .segmentation-panel')).toHaveCount(0);
  await expect(page.locator('[data-text-content-root]')).toHaveCount(2);

  await selectCanonical(page, english.id, 0, 5);
  await page.locator(`.text-panel[data-text-version-id="${english.id}"]`).getByRole('button', { name: 'Add to Alignment' }).click();
  await page.getByRole('tab', { name: 'Lemma' }).click();
  await expect(page.getByLabel('Pending alignment status')).toContainText('1 pending selection');
  await expect(page.locator('.lemma-annotation-panel', { hasText: 'M6 English' })).toContainText('hello');
  await page.getByRole('button', { name: 'Open Alignment' }).click();

  // DOM Range offsets are UTF-16. Selecting [6, 8) captures one astral emoji;
  // the persisted Alignment span must use Unicode code-point offsets [6, 7).
  await selectCanonical(page, german.id, 6, 8);
  await page.locator(`.text-panel[data-text-version-id="${german.id}"]`).getByRole('button', { name: 'Add to Alignment' }).click();
  await expect(page.getByLabel('Pending alignment status')).toContainText('ready to create');
  await page.getByRole('button', { name: 'Create Alignment' }).click();
  const activate = page.getByRole('button', { name: /Activate alignment/ });
  await expect(activate).toBeVisible();
  await activate.click();
  await expect(page.getByTestId('connector-overlay')).toBeVisible();

  const persisted = await (await request.get(`/api/v1/documents/${document.id}/workspace`)).json() as {
    spans: Array<{ text_version_id: string; start_offset: number; end_offset: number; exact_text: string }>;
  };
  expect(persisted.spans).toContainEqual(expect.objectContaining({
    text_version_id: german.id,
    start_offset: 6,
    end_offset: 7,
    exact_text: '🙂',
  }));

  // Reload proves that Alignment plus the inherited M1–M5 persisted data are
  // all reachable through the bounded task deck, rather than only surviving
  // in mounted client drafts.
  await page.reload();
  await expect(page.locator('[data-text-content-root]')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Sentence' }).click();
  await expect(page.locator(`[data-session-key="${english.id}:sentence"]`)).toContainText('Saved');
  await page.getByRole('tab', { name: 'Token' }).click();
  await expect(page.locator(`[data-session-key="${english.id}:token"]`)).toContainText('Hello');
  await page.getByRole('tab', { name: 'Lemma' }).click();
  await expect(page.locator(`[data-session-key="${english.id}:lemma"]`)).toContainText('hello');
  await page.getByRole('tab', { name: 'POS' }).click();
  await expect(page.locator(`[data-session-key="${english.id}:pos"]`)).toContainText('INTJ');
  await page.getByRole('tab', { name: 'Alignment' }).click();
  const reloadedActivate = page.getByRole('button', { name: /Activate alignment/ });
  await expect(reloadedActivate).toBeVisible();
  await reloadedActivate.click();
  await expect(page.getByTestId('connector-overlay')).toBeVisible();

  await page.getByRole('tab', { name: 'Sentence' }).click();
  await expect(page.getByTestId('connector-overlay')).toBeVisible();
  const englishSession = page.locator(`[data-session-key="${english.id}:sentence"]`);
  await englishSession.getByRole('button', { name: 'Start manual' }).click();
  await expect(englishSession.getByText('Unsaved preview')).toBeVisible();
  await page.getByRole('tab', { name: 'Token' }).click();
  await expect(englishSession).toBeHidden();
  await page.getByRole('tab', { name: 'Sentence' }).click();
  await expect(englishSession.getByText('Unsaved preview')).toBeVisible();

  await page.getByRole('combobox', { name: 'Active text version' }).selectOption(german.id);
  await page.getByRole('button', { name: 'Hide M6 English panel' }).click();
  await expect(page.getByLabel('Workbench session status')).toContainText('M6 English · Sentence');
  await page.getByRole('button', { name: 'Open M6 English' }).click();
  await expect(page.getByRole('combobox', { name: 'Active text version' })).toHaveValue(german.id);
});

test('M6 bounds four long-text panels and keeps tools reachable at 1440×900', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const document = await createDocument(request, 'M6 density');
  const content = `${'Long canonical sentence with Unicode 🙂. '.repeat(40)}End.`;
  for (const [index, language] of ['en', 'de', 'fr', 'es'].entries()) {
    await createVersion(request, document.id, `M6 Long ${index + 1}`, language, content);
  }

  await page.goto(`/documents/${document.id}/workspace`);
  for (let index = 1; index <= 4; index += 1) await openVersion(page, `M6 Long ${index}`);

  await expect(page.locator('.panel-slot')).toHaveCount(4);
  await expect(page.locator('.panel-slot .segmentation-panel')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Workbench tools' })).toBeVisible();
  await page.getByRole('tab', { name: 'POS' }).click();
  await expect(page.getByRole('combobox', { name: 'Active text version' })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'POS task' })).toBeVisible();
  await expect(page.locator('.workbench-task-session:not([hidden]) .linguistic-editor-session:not([hidden])')).toHaveCount(1);
  await expect(page.getByLabel('Pending alignment status')).toBeVisible();
});
