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
  // Auto-wait for the workspace to expose either the reopen control or the
  // already-visible canonical slot. `isVisible()` alone does not wait, so the
  // previous helper could race the first SPA render.
  const openButton = page.getByRole('button', { name: `Open ${label}` });
  const slot = page.locator('.panel-slot', { hasText: label });
  await expect(openButton.or(slot).first()).toBeVisible();
  if (await openButton.isVisible()) {
    await openButton.click();
  }
  await expect(slot).toBeVisible();
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

/** One mounted linguistic editor session for an exact TextVersion + layer. */
function session(page: Page, versionId: string, mode: string) {
  return page.locator(`[data-session-key="${versionId}:${mode}"]`);
}

interface TokenRange {
  start: number;
  end: number;
  is_word_like: boolean;
  text: string;
}

/**
 * Tokenize canonical content with CODE-POINT offsets. Whitespace and word runs
 * stay together; each punctuation/symbol character is its own separator token.
 */
function codePointTokens(content: string): TokenRange[] {
  const chars = Array.from(content);
  const ranges: TokenRange[] = [];
  if (chars.length === 0) {
    return ranges;
  }
  const classOf = (character: string): 'space' | 'word' | 'separator' => {
    if (/\s/.test(character)) {
      return 'space';
    }
    return /[\p{L}\p{N}\p{M}]/u.test(character) ? 'word' : 'separator';
  };
  const push = (from: number, to: number, kind: 'space' | 'word' | 'separator') => {
    if (kind === 'separator') {
      for (let index = from; index < to; index += 1) {
        ranges.push({ start: index, end: index + 1, is_word_like: false, text: chars[index]! });
      }
      return;
    }
    ranges.push({ start: from, end: to, is_word_like: kind === 'word', text: chars.slice(from, to).join('') });
  };
  let start = 0;
  let current = classOf(chars[0]!);
  for (let index = 1; index < chars.length; index += 1) {
    const next = classOf(chars[index]!);
    if (next !== current) {
      push(start, index, current);
      start = index;
      current = next;
    }
  }
  push(start, chars.length, current);
  return ranges;
}

async function saveSentenceLayer(
  request: APIRequestContext,
  version: { id: string; content_hash: string },
  segments: Array<{ start: number; end: number }>,
  languageTag = 'en',
) {
  const response = await request.put(
    `/api/v1/text-versions/${version.id}/segmentations/sentence`,
    {
      data: {
        content_hash: version.content_hash,
        requested_locale: languageTag,
        resolved_locale: languageTag,
        origin: 'manual',
        segments,
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  return await response.json() as { layer: { id: string } };
}

async function saveTokenLayer(
  request: APIRequestContext,
  version: { id: string; content_hash: string },
  basisSentenceLayerId: string,
  tokens: TokenRange[],
  languageTag = 'en',
) {
  const response = await request.put(
    `/api/v1/text-versions/${version.id}/segmentations/token`,
    {
      data: {
        content_hash: version.content_hash,
        basis_sentence_layer_id: basisSentenceLayerId,
        requested_locale: languageTag,
        resolved_locale: languageTag,
        origin: 'manual',
        segments: tokens.map((token) => ({
          start: token.start,
          end: token.end,
          is_word_like: token.is_word_like,
        })),
      },
    },
  );
  expect(response.ok()).toBeTruthy();
  return await response.json() as {
    layer: { id: string };
    segments: Array<{ id: string; exact_text: string; is_word_like: boolean }>;
  };
}

/** Save sentence + token layers and return the word-like token with `text`. */
async function saveWordLikeToken(
  request: APIRequestContext,
  version: { id: string; content_hash: string; content: string },
  text: string,
  languageTag = 'en',
) {
  const chars = Array.from(version.content);
  const sentence = await saveSentenceLayer(
    request,
    version,
    [{ start: 0, end: chars.length }],
    languageTag,
  );
  const token = await saveTokenLayer(
    request,
    version,
    sentence.layer.id,
    codePointTokens(version.content),
    languageTag,
  );
  const match = token.segments.find((segment) => segment.exact_text === text);
  expect(match, `word-like token ${text} must exist`).toBeTruthy();
  return match!;
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

// ---------------------------------------------------------------------------
// M6-G2-F05 Section 27 variants.
// ---------------------------------------------------------------------------

test('M6 keyboard-only task navigation drives mode, focus, panel and target selector', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 keyboard');
  const english = await createVersion(request, document.id, 'M6 K English', 'en', 'Hello world.');
  const german = await createVersion(request, document.id, 'M6 K German', 'de', 'Hallo Welt.');
  await saveSentenceLayer(request, english, [{ start: 0, end: 12 }]);
  await saveSentenceLayer(request, german, [{ start: 0, end: 11 }], 'de');

  const tab = (name: string) => page.getByRole('tab', { name });

  await page.goto(`/documents/${document.id}/workspace`);
  await openVersion(page, 'M6 K English');
  await openVersion(page, 'M6 K German');

  await tab('Alignment').focus();
  await expect(tab('Alignment')).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'Alignment task' })).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(tab('Sentence')).toBeFocused();
  await expect(tab('Sentence')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'sentence task' })).toBeVisible();

  await page.keyboard.press('End');
  await expect(tab('POS')).toBeFocused();
  await expect(page.getByRole('tabpanel', { name: 'POS task' })).toBeVisible();

  // Wrap-around in both directions, then Home.
  await page.keyboard.press('ArrowRight');
  await expect(tab('Alignment')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tab('POS')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(tab('Alignment')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(tab('POS')).toBeFocused();

  // The active-target selector is the next ordinary Tab stop, and it is
  // reachable and changeable without a pointer.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Tab');
  const selector = page.getByRole('combobox', { name: 'Active text version' });
  await expect(selector).toBeFocused();
  await expect(selector).toHaveValue(english.id);
  await page.keyboard.press('ArrowDown');
  await expect(selector).toHaveValue(german.id);
  await expect(session(page, german.id, 'sentence')).toBeVisible();

  // A session dialog locks the deck: no keyboard sequence bypasses it.
  await session(page, german.id, 'sentence').getByRole('button', { name: 'Delete segmentation' }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  for (const name of ['Alignment', 'Sentence', 'Token', 'Lemma', 'POS']) {
    await expect(tab(name)).toBeDisabled();
  }
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Home');
  await page.keyboard.press('End');
  await expect(tab('Sentence')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'sentence task' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('M6 preserves dirty sentence, token, lemma, POS and Alignment drafts across ordinary navigation', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 dirty continuity');
  const english = await createVersion(request, document.id, 'M6 Y English', 'en', 'Hello world.');
  const german = await createVersion(request, document.id, 'M6 Y German', 'de', 'Hallo Welt.');
  const hello = await saveWordLikeToken(request, english, 'Hello');
  await request.put(`/api/v1/token-segments/${hello.id}/lemma`, { data: { lemma: 'house' } });
  await request.put(`/api/v1/token-segments/${hello.id}/pos`, { data: { pos_tag: 'NOUN' } });
  await request.post(`/api/v1/documents/${document.id}/alignments`, {
    data: {
      note: 'authoritative note',
      members: [
        { text_version_id: english.id, start: 0, end: 5 },
        { text_version_id: german.id, start: 0, end: 5 },
      ],
    },
  });

  await page.goto(`/documents/${document.id}/workspace`);
  await openVersion(page, 'M6 Y English');
  await openVersion(page, 'M6 Y German');

  await page.getByRole('tab', { name: 'Sentence' }).click();
  const englishSentence = session(page, english.id, 'sentence');
  await englishSentence.getByRole('button', { name: 'Start manual' }).click();
  await expect(englishSentence.getByText('Unsaved preview')).toBeVisible();

  await page.getByRole('tab', { name: 'Token' }).click();
  const englishToken = session(page, english.id, 'token');
  await englishToken.getByRole('button', { name: 'Start manual' }).click();
  await expect(englishToken.getByText('Unsaved preview')).toBeVisible();

  await page.getByRole('tab', { name: 'Lemma' }).click();
  const englishLemma = session(page, english.id, 'lemma');
  await englishLemma.getByLabel('Lemma for Hello').fill('houses');

  await page.getByRole('tab', { name: 'POS' }).click();
  const englishPos = session(page, english.id, 'pos');
  await englishPos.getByLabel('Coarse POS for Hello').selectOption('VERB');

  await page.getByRole('tab', { name: 'Alignment' }).click();
  await page.getByRole('button', { name: /Activate alignment/ }).click();
  await page.getByLabel(/Note/).fill('alignment draft');
  await expect(page.getByLabel('Workbench session status')).toContainText('AlignmentUnsaved');

  // Ordinary target + mode switches preserve every mounted draft.
  await page.getByRole('tab', { name: 'Lemma' }).click();
  await page.getByRole('combobox', { name: 'Active text version' }).selectOption(german.id);
  await expect(englishLemma).toBeHidden();
  await page.getByRole('tab', { name: 'POS' }).click();
  await expect(englishPos).toBeHidden();
  await page.getByRole('tab', { name: 'Token' }).click();
  await expect(englishToken).toBeHidden();
  await page.getByRole('tab', { name: 'Alignment' }).click();
  await expect(page.getByLabel(/Note/)).toHaveValue('alignment draft');

  await page.getByRole('tab', { name: 'Sentence' }).click();
  await page.getByRole('combobox', { name: 'Active text version' }).selectOption(english.id);
  await expect(englishSentence.getByText('Unsaved preview')).toBeVisible();
  await page.getByRole('tab', { name: 'Token' }).click();
  await expect(englishToken.getByText('Unsaved preview')).toBeVisible();
  await page.getByRole('tab', { name: 'Lemma' }).click();
  await expect(englishLemma.getByLabel('Lemma for Hello')).toHaveValue('houses');
  await page.getByRole('tab', { name: 'POS' }).click();
  await expect(englishPos.getByLabel('Coarse POS for Hello')).toHaveValue('VERB');
  await page.getByRole('tab', { name: 'Alignment' }).click();
  await expect(page.getByLabel(/Note/)).toHaveValue('alignment draft');
});

test('M6 keeps inactive pending and failure state discoverable and recoverable', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 pending status');
  const version = await createVersion(request, document.id, 'M6 P English', 'en', 'Hello world.');

  await page.goto(`/documents/${document.id}/workspace`);
  await openVersion(page, 'M6 P English');
  await page.getByRole('tab', { name: 'Sentence' }).click();
  const sentence = session(page, version.id, 'sentence');
  const summary = page.getByLabel('Workbench session status');

  await sentence.getByRole('button', { name: 'Start manual' }).click();
  await expect(sentence.getByText('Unsaved preview')).toBeVisible();

  // Real browser-level control over the REAL authoritative PUT.
  let gate: 'pass' | 'hold' | 'fail' = 'pass';
  let releasePending: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    releasePending = resolve;
  });
  await page.route('**/segmentations/sentence', async (route) => {
    if (route.request().method() !== 'PUT' || gate === 'pass') {
      await route.continue();
      return;
    }
    if (gate === 'hold') {
      await held;
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'sentence save failed', details: {} }),
    });
  });

  gate = 'hold';
  await sentence.getByRole('button', { name: 'Save segmentation' }).click();
  await page.getByRole('tab', { name: 'POS' }).click();
  await expect(summary).toContainText('M6 P English · Sentence');
  await expect(summary).toContainText('Pending');
  gate = 'pass';
  releasePending?.();
  // Settled: the inactive sessions stop reporting Pending, so the bounded
  // session summary list is removed entirely.
  await expect(summary).toHaveCount(0, { timeout: 20_000 });

  // Stable API failure while the session is inactive.
  gate = 'fail';
  await page.getByRole('tab', { name: 'Sentence' }).click();
  await sentence.getByRole('button', { name: 'Start manual' }).click();
  await sentence.getByLabel('Split at').fill('6');
  await sentence.getByRole('button', { name: 'Split' }).click();
  await sentence.getByRole('button', { name: 'Save segmentation' }).click();
  await page.getByRole('tab', { name: 'POS' }).click();
  await expect(summary).toContainText('Error');

  // Returning to the session shows the full stable error and valid recovery.
  await page.getByRole('tab', { name: 'Sentence' }).click();
  await expect(sentence.getByRole('alert')).toContainText('sentence save failed');
  gate = 'pass';
  await sentence.getByRole('button', { name: 'Save segmentation' }).click();
  await expect(sentence.getByText('Saved', { exact: true })).toBeVisible();
  await expect(summary).toHaveCount(0);
});

test('M6 fails a dirty lemma draft closed against an authoritative change and recovers by discard', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 conflict');
  const version = await createVersion(request, document.id, 'M6 C English', 'en', 'Hello world.');
  const hello = await saveWordLikeToken(request, version, 'Hello');
  await request.put(`/api/v1/token-segments/${hello.id}/lemma`, { data: { lemma: 'house' } });

  await page.goto(`/documents/${document.id}/workspace`);
  await openVersion(page, 'M6 C English');
  await page.getByRole('tab', { name: 'Lemma' }).click();
  const lemma = session(page, version.id, 'lemma');
  const input = lemma.getByLabel('Lemma for Hello');
  await expect(input).toHaveValue('house');
  await input.fill('houses');

  // A genuinely independent authoritative change through the real API.
  const changed = await request.put(`/api/v1/token-segments/${hello.id}/lemma`, {
    data: { lemma: 'home' },
  });
  expect(changed.ok()).toBeTruthy();

  // A real UI mutation refetches the authoritative workspace without
  // remounting the mounted lemma session.
  await page.getByRole('tab', { name: 'POS' }).click();
  const pos = session(page, version.id, 'pos');
  await pos.getByLabel('Coarse POS for Hello').selectOption('NOUN');
  await pos.getByRole('button', { name: 'Save POS' }).first().click();
  await expect(pos.locator('.pos-saved-value')).toHaveText('NOUN');

  await page.getByRole('tab', { name: 'Lemma' }).click();
  await expect(lemma.locator('.lemma-saved-value').first()).toHaveText('home');
  await expect(input).toHaveValue('houses');
  await expect(lemma.getByRole('alert')).toContainText('Discard the draft to load the current basis');
  await expect(lemma.getByRole('button', { name: 'Save lemma' }).first()).toBeDisabled();

  await lemma.getByRole('button', { name: 'Discard draft' }).first().click();
  await expect(input).toHaveValue('home');
  await expect(lemma.getByRole('alert')).toHaveCount(0);

  // The stale occurrence never received a mutation: exactly the current
  // authoritative annotation remains.
  const snapshot = await (await request.get(`/api/v1/documents/${document.id}/workspace`)).json() as {
    token_lemma_annotations: Array<{ token_segment_id: string; lemma: string }>;
  };
  expect(snapshot.token_lemma_annotations).toEqual([
    expect.objectContaining({ token_segment_id: hello.id, lemma: 'home' }),
  ]);
});

test('M6 pins the canonical canvas while a linguistic dialog is open', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 dialog');
  const version = await createVersion(request, document.id, 'M6 D English', 'en', 'Hello world.');
  await saveSentenceLayer(request, version, [{ start: 0, end: 12 }]);

  await page.goto(`/documents/${document.id}/workspace`);
  await openVersion(page, 'M6 D English');
  await page.getByRole('tab', { name: 'Sentence' }).click();
  const opener = session(page, version.id, 'sentence').getByRole('button', { name: 'Delete segmentation' });
  await opener.focus();
  await opener.click();

  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide M6 D English panel' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete M6 D English' })).toBeDisabled();
  for (const name of ['Alignment', 'Sentence', 'Token', 'Lemma', 'POS']) {
    await expect(page.getByRole('tab', { name })).toBeDisabled();
  }
  await expect(page.getByRole('tabpanel', { name: 'sentence task' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(page.getByRole('button', { name: 'Hide M6 D English panel' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Delete M6 D English' })).toBeEnabled();
});

test('M6 warns on dirty deletion and removes a version only after authoritative force deletion', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 delete');
  const english = await createVersion(request, document.id, 'M6 Del English', 'en', 'Hello world.');
  const german = await createVersion(request, document.id, 'M6 Del German', 'de', 'Hallo Welt.');
  // English carries a persisted annotation, so the ordinary delete is refused.
  const hello = await saveWordLikeToken(request, english, 'Hello');
  await request.put(`/api/v1/token-segments/${hello.id}/lemma`, { data: { lemma: 'house' } });

  await page.goto(`/documents/${document.id}/workspace`);
  await openVersion(page, 'M6 Del English');
  await openVersion(page, 'M6 Del German');
  await page.getByRole('tab', { name: 'Sentence' }).click();
  await page.getByRole('combobox', { name: 'Active text version' }).selectOption(german.id);
  const germanSession = session(page, german.id, 'sentence');
  await germanSession.getByRole('button', { name: 'Start manual' }).click();
  await expect(germanSession.getByText('Unsaved preview')).toBeVisible();

  await page.getByRole('button', { name: 'Delete M6 Del German' }).click();
  const dirtyDialog = page.getByRole('alertdialog');
  await expect(dirtyDialog).toContainText('unsaved work: Sentence');
  await dirtyDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dirtyDialog).toHaveCount(0);
  await expect(germanSession.getByText('Unsaved preview')).toBeVisible();

  // Ordinary DELETE -> TEXT_HAS_ANNOTATIONS -> explicit forced confirmation.
  await page.getByRole('button', { name: 'Delete M6 Del English' }).click();
  const forceDialog = page.getByRole('alertdialog');
  await expect(forceDialog).toContainText('persisted annotations');
  await forceDialog.getByRole('button', { name: 'Delete permanently' }).click();
  await expect(page.getByRole('button', { name: 'Open M6 Del English' })).toHaveCount(0);
  await expect(page.locator('.panel-slot', { hasText: 'M6 Del English' })).toHaveCount(0);

  // The unrelated mounted German draft survives the authoritative deletion.
  await expect(germanSession.getByText('Unsaved preview')).toBeVisible();
});

test('M6 imports a text version on demand without adding a sixth task destination', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 import');
  await createVersion(request, document.id, 'M6 I English', 'en', 'Hello world.');

  await page.goto(`/documents/${document.id}/workspace`);
  await openVersion(page, 'M6 I English');
  await expect(page.getByRole('tab')).toHaveCount(5);

  const form = page.getByRole('region', { name: 'Add text version' });
  await page.getByRole('button', { name: 'Add text version' }).click();
  await form.getByLabel('Label').fill('M6 I Italian');
  await form.getByLabel('Language tag (BCP-47)').fill('it');
  await form.getByLabel('Text').fill('Ciao mondo.');

  // An unrelated task-mode switch does not clear the import draft.
  await page.getByRole('tab', { name: 'POS' }).click();
  await page.getByRole('button', { name: 'Close add text version' }).click();
  await expect(form).toBeHidden();
  await page.getByRole('button', { name: 'Add text version' }).click();
  await expect(form.getByLabel('Label')).toHaveValue('M6 I Italian');
  await expect(form.getByLabel('Text')).toHaveValue('Ciao mondo.');

  await form.getByRole('button', { name: 'Add version' }).click();

  // Authoritative workspace exposes the new canonical panel, and Import is
  // still not a sixth task destination.
  await expect(page.locator('.panel-slot', { hasText: 'M6 I Italian' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(5);
  await page.getByRole('tab', { name: 'Lemma' }).click();
  await expect(page.getByRole('option', { name: /M6 I Italian/ })).toHaveCount(1);
});

test('M6 keeps connectors bound across mode, reorder and hide/reopen', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const document = await createDocument(request, 'M6 connectors');
  const english = await createVersion(request, document.id, 'M6 G English', 'en', 'Hello world.');
  const german = await createVersion(request, document.id, 'M6 G German', 'de', 'Hallo Welt.');
  await saveWordLikeToken(request, english, 'Hello');
  await saveWordLikeToken(request, german, 'Hallo', 'de');
  const created = await request.post(`/api/v1/documents/${document.id}/alignments`, {
    data: {
      members: [
        { text_version_id: english.id, start: 0, end: 5 },
        { text_version_id: german.id, start: 0, end: 5 },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto(`/documents/${document.id}/workspace`);
  await openVersion(page, 'M6 G English');
  await openVersion(page, 'M6 G German');
  await page.getByRole('button', { name: /Activate alignment/ }).click();
  await expect(page.getByTestId('connector-overlay')).toBeVisible();

  // Linguistic modes keep the mode-independent connector visualization.
  await page.getByRole('tab', { name: 'Lemma' }).click();
  await expect(page.getByTestId('connector-overlay')).toBeVisible();
  const englishLemma = session(page, english.id, 'lemma');
  await expect(englishLemma).toContainText('Hello');

  // Reorder keeps the active target, the mounted session and the connectors.
  await page.getByRole('button', { name: 'Move M6 G German left' }).click();
  await expect(page.getByTestId('connector-overlay')).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Active text version' })).toHaveValue(english.id);
  await expect(session(page, english.id, 'lemma')).toContainText('Hello');

  // Hide/reopen restores the canonical panel and the connector geometry.
  await page.getByRole('button', { name: 'Hide M6 G English panel' }).click();
  await expect(page.getByRole('button', { name: 'Open M6 G English' })).toBeVisible();
  await page.getByRole('button', { name: 'Open M6 G English' }).click();
  await expect(page.locator('.panel-slot', { hasText: 'M6 G English' })).toBeVisible();
  await expect(page.getByTestId('connector-overlay')).toBeVisible();
  await expect(session(page, english.id, 'lemma')).toContainText('Hello');
});

test('M6 keeps a dirty downstream draft explicitly discardable after its upstream layer is deleted', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 F09');
  const version = await createVersion(request, document.id, 'M6 F09 English', 'en', 'Hello world.');
  await saveWordLikeToken(request, version, 'Hello');

  await page.goto(`/documents/${document.id}/workspace`);
  await openVersion(page, 'M6 F09 English');
  const lemma = session(page, version.id, 'lemma');
  const token = session(page, version.id, 'token');

  // A lemma draft against the saved token layer, deliberately never saved.
  await page.getByRole('tab', { name: 'Lemma' }).click();
  await lemma.getByLabel('Lemma for Hello').fill('house');
  await expect(page.getByLabel('Workbench session status')).toContainText('Unsaved');

  // Delete the saved token layer through the real confirmed UI flow. The
  // backend only guards PERSISTED occurrence annotations, so this succeeds.
  await page.getByRole('tab', { name: 'Token' }).click();
  await token.getByRole('button', { name: 'Delete tokens' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete tokens' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);

  // The authoritative refetch removed the prerequisite. The draft stays
  // visible and conflicted, cannot be submitted, and can be explicitly
  // discarded — it is no longer hidden behind the prerequisite notice.
  await page.getByRole('tab', { name: 'Lemma' }).click();
  await expect(lemma.getByText('Save token segmentation before adding lemma annotations.')).toBeVisible();
  await expect(lemma.getByLabel('Lemma for Hello')).toHaveValue('house');
  await expect(lemma.getByRole('button', { name: 'Save lemma' })).toBeDisabled();
  await expect(lemma.getByRole('alert')).toContainText('stale targets cannot be submitted');
  await expect(page.getByLabel('Workbench session status')).toContainText('Conflict');

  await lemma.getByRole('button', { name: 'Discard draft' }).click();
  await expect(lemma.getByLabel('Lemma for Hello')).toHaveCount(0);
  await expect(lemma.getByText('Save token segmentation before adding lemma annotations.')).toBeVisible();

  // No stale token occurrence reached the API as a mutation target.
  const snapshot = await (await request.get(`/api/v1/documents/${document.id}/workspace`)).json() as {
    segmentation_layers: Array<{ granularity: string }>;
    token_lemma_annotations: unknown[];
  };
  expect(snapshot.segmentation_layers.map((layer) => layer.granularity)).toEqual(['sentence']);
  expect(snapshot.token_lemma_annotations).toEqual([]);
});

test('M6 blocks dirty browser Back/Forward with exactly one in-app confirmation', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 F10');
  const version = await createVersion(request, document.id, 'M6 F10 English', 'en', 'Hello world.');

  // Build a real IN-APP history stack (/projects -> documents -> workspace)
  // through SPA links, so Back/Forward are client-side route transitions
  // handled by the router rather than full document unloads.
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/projects$/);
  await page.getByRole('link', { name: /M6 F10 project/ }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/documents$/);
  await page.getByRole('link', { name: /^M6 F10\b/ }).click();
  await expect(page).toHaveURL(new RegExp(`/documents/${document.id}/workspace$`));
  await openVersion(page, 'M6 F10 English');
  await page.getByRole('tab', { name: 'Sentence' }).click();
  const sentence = session(page, version.id, 'sentence');
  await sentence.getByRole('button', { name: 'Start manual' }).click();
  await expect(page.getByLabel('Workbench session status')).toContainText('Unsaved');

  const workspaceUrl = new RegExp(`/documents/${document.id}/workspace$`);

  // Back is blocked by exactly one in-app confirmation; staying keeps the
  // route, the mounted session and the draft.
  await page.goBack();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toContainText('Leave this document workspace?');
  await expect(page).toHaveURL(workspaceUrl);
  await dialog.getByRole('button', { name: 'Stay' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page).toHaveURL(workspaceUrl);
  await expect(sentence.getByText('Unsaved preview')).toBeVisible();

  // Confirming performs that one pending history navigation.
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/documents$/);

  // Forward returns to a freshly mounted (clean) workspace with no prompt.
  await page.goForward();
  await expect(page).toHaveURL(workspaceUrl);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByLabel('Workbench session status')).toHaveCount(0);
});

test('M6 keeps one modal and a stable route when a leave is attempted with an open dialog', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 F11');
  const version = await createVersion(request, document.id, 'M6 F11 English', 'en', 'Hello world.');
  await saveSentenceLayer(request, version, [{ start: 0, end: 12 }]);

  // Real in-app history stack so Back is a client-side route transition.
  await page.goto('/projects');
  await page.getByRole('link', { name: /M6 F11 project/ }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/documents$/);
  await page.getByRole('link', { name: /^M6 F11\b/ }).click();
  const workspaceUrl = new RegExp(`/documents/${document.id}/workspace$`);
  await expect(page).toHaveURL(workspaceUrl);
  await openVersion(page, 'M6 F11 English');
  await page.getByRole('tab', { name: 'Sentence' }).click();
  const sentence = session(page, version.id, 'sentence');
  await sentence.getByRole('button', { name: 'Start manual' }).click();
  await expect(page.getByLabel('Workbench session status')).toContainText('Unsaved');

  // The session's destructive confirmation owns the workspace.
  await sentence.getByRole('button', { name: 'Delete segmentation' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(1);

  // Back must not bypass it, must not stack a second modal, and must leave the
  // route, the dialog and the draft untouched.
  await page.goBack();
  await expect(page.getByRole('alertdialog')).toHaveCount(1);
  await expect(page.getByRole('alertdialog')).toContainText('Delete saved sentence segmentation?');
  await expect(page).toHaveURL(workspaceUrl);
  await expect(sentence.getByText('Unsaved preview')).toBeVisible();

  // Once the dialog is disposed of, Back yields exactly one Leave confirmation.
  await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.goBack();
  const leave = page.getByRole('alertdialog');
  await expect(leave).toHaveCount(1);
  await expect(leave).toContainText('Leave this document workspace?');
  await leave.getByRole('button', { name: 'Stay' }).click();
  await expect(page).toHaveURL(workspaceUrl);
  await expect(sentence.getByText('Unsaved preview')).toBeVisible();

  await page.goBack();
  await expect(page.getByRole('alertdialog')).toHaveCount(1);
  await page.getByRole('alertdialog').getByRole('button', { name: 'Leave' }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/documents$/);
});

test('M6 reports Pending only for the session that is actually saving', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const document = await createDocument(request, 'M6 F12');
  const english = await createVersion(request, document.id, 'M6 F12 English', 'en', 'Hello world.');
  const german = await createVersion(request, document.id, 'M6 F12 German', 'de', 'Hallo Welt.');
  // Sentence layers only: a saved TOKEN layer would (correctly) block the
  // ordinary sentence replacement with SEGMENTATION_HAS_DEPENDENTS.
  await saveSentenceLayer(request, english, [{ start: 0, end: 12 }]);
  await saveSentenceLayer(request, german, [{ start: 0, end: 11 }], 'de');

  // Browser-level latency on the REAL sentence PUT.
  let gate: 'hold' | 'pass' = 'hold';
  let releaseSentence: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    releaseSentence = resolve;
  });
  await page.route('**/segmentations/sentence', async (route) => {
    if (route.request().method() === 'PUT' && gate === 'hold') {
      await held;
    }
    await route.continue();
  });

  await page.goto(`/documents/${document.id}/workspace`);
  await openVersion(page, 'M6 F12 English');
  await openVersion(page, 'M6 F12 German');
  await page.getByRole('tab', { name: 'Sentence' }).click();
  const englishSentence = session(page, english.id, 'sentence');
  await englishSentence.getByRole('button', { name: 'Start manual' }).click();
  await englishSentence.getByRole('button', { name: 'Save segmentation' }).click();

  // Only the submitting session reports Pending; the same-version token
  // session and both German sessions stay out of the summary.
  await page.getByRole('tab', { name: 'POS' }).click();
  const summary = page.getByLabel('Workbench session status');
  await expect(summary).toContainText('M6 F12 English · SentencePending');
  await expect(summary).not.toContainText('M6 F12 English · Token');
  await expect(summary).not.toContainText('M6 F12 German · Sentence');
  await expect(summary).not.toContainText('M6 F12 German · Token');

  // The document-wide exclusion still locks the other segmentation controls
  // while this save is in flight.
  await page.getByRole('tab', { name: 'Token' }).click();
  await page.getByRole('combobox', { name: 'Active text version' }).selectOption(german.id);
  await expect(
    session(page, german.id, 'token').getByRole('button', { name: 'Start manual' }),
  ).toBeDisabled();

  gate = 'pass';
  releaseSentence?.();
  await expect(summary).toHaveCount(0);
});
