import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * M4 lemma annotation E2E (ADR-012).
 *
 * Primary path: create text -> save sentence segmentation -> save token
 * segmentation -> annotate an eligible saved word-like token -> verify saved
 * state -> reload -> verify the exact lemma -> edit -> reload -> verify the
 * edit -> delete -> verify it is gone -> verify sentence/token segmentation
 * and Alignment state are preserved.
 *
 * Dependency path: a saved lemma blocks token replacement with
 * SEGMENTATION_HAS_DEPENDENTS; explicitly deleting the lemma unblocks it.
 *
 * Unicode path: non-ASCII, combining-mark and astral content keep canonical
 * text and token identity intact.
 */

interface TokenRange {
  start: number;
  end: number;
  is_word_like: boolean;
  text: string;
}

/**
 * Tokenize content with CODE-POINT offsets (never UTF-16 units, so astral
 * characters stay one unit). Whitespace runs and word runs stay together;
 * each punctuation/symbol character is its own separator token. A run is
 * word-like when it contains Unicode letters, numbers or combining marks.
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
        ranges.push({
          start: index,
          end: index + 1,
          is_word_like: false,
          text: chars[index]!,
        });
      }
      return;
    }
    ranges.push({
      start: from,
      end: to,
      is_word_like: kind === 'word',
      text: chars.slice(from, to).join(''),
    });
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

async function createDocument(request: APIRequestContext, title: string) {
  const project = await (
    await request.post('/api/v1/projects', { data: { name: title } })
  ).json() as { id: string };
  return await (
    await request.post(`/api/v1/projects/${project.id}/documents`, {
      data: { title },
    })
  ).json() as { id: string };
}

async function createVersion(
  request: APIRequestContext,
  documentId: string,
  data: { language_tag: string; label: string; content: string; sort_order: number },
) {
  const response = await request.post(
    `/api/v1/documents/${documentId}/text-versions`,
    { data },
  );
  expect(response.ok()).toBeTruthy();
  return await response.json() as {
    id: string;
    content_hash: string;
    content: string;
  };
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

/**
 * Ensure the panel is open. Panel visibility is a persisted per-document
 * preference, so after a reload the panel is usually already open and there is
 * no "Open …" button.
 */
async function openPanel(page: Page, label: string) {
  const openButton = page.getByRole('button', { name: `Open ${label}` });
  const slot = page.locator('.panel-slot', { hasText: label });
  await expect(openButton.or(slot).first()).toBeVisible();
  if (await openButton.isVisible()) {
    await openButton.click();
  }
  await expect(slot).toBeVisible();
}

function panelSlot(page: Page, label: string) {
  return page.locator('.panel-slot', { hasText: label });
}

function lemmaRow(page: Page, label: string, tokenSegmentId: string) {
  return panelSlot(page, label).locator(
    `.lemma-annotation-panel [data-token-segment-id="${tokenSegmentId}"]`,
  );
}

async function saveLemma(
  page: Page,
  label: string,
  tokenSegmentId: string,
  lemma: string,
  /** The authoritative value the server persists (NFC-normalized). */
  expected: string = lemma,
) {
  const row = lemmaRow(page, label, tokenSegmentId);
  await row.getByLabel(/^Lemma for /).fill(lemma);
  await row.getByRole('button', { name: 'Save lemma' }).click();
  await expect(row.locator('.lemma-saved-value')).toHaveText(expected);
}

test('M4 lemma annotation persists, edits, deletes, and preserves segmentation + Alignment', async ({ page, request }) => {
  const document = await createDocument(request, 'M4 Lemma E2E');
  const content = 'Hello world. Bye 🙂!';
  const version = await createVersion(request, document.id, {
    language_tag: 'en',
    label: 'M4 English',
    content,
    sort_order: 0,
  });
  const german = await createVersion(request, document.id, {
    language_tag: 'de',
    label: 'M4 German',
    content: 'Hallo Welt.',
    sort_order: 1,
  });

  const sentences = await saveSentenceLayer(request, version, [
    { start: 0, end: 13 },
    { start: 13, end: 19 },
  ]);
  const tokens = codePointTokens(content);
  const tokenLayer = await saveTokenLayer(
    request,
    version,
    sentences.layer.id,
    tokens,
  );
  const hello = tokenLayer.segments.find((segment) => segment.exact_text === 'Hello');
  const bye = tokenLayer.segments.find((segment) => segment.exact_text === 'Bye');
  const emoji = tokenLayer.segments.find((segment) => segment.exact_text === '🙂');
  expect(hello?.is_word_like).toBe(true);
  expect(bye?.is_word_like).toBe(true);
  // The astral emoji is a separator token: never a lemma target.
  expect(emoji?.is_word_like).toBe(false);

  // Existing Alignment state that the lemma workflow must not disturb.
  const alignment = await request.post(
    `/api/v1/documents/${document.id}/alignments`,
    {
      data: {
        members: [
          { text_version_id: version.id, start: 0, end: 5 },
          { text_version_id: german.id, start: 0, end: 5 },
        ],
      },
    },
  );
  expect(alignment.status()).toBe(201);
  const groupId = (await alignment.json()).id as string;

  await page.goto(`/documents/${document.id}/workspace`);
  await openPanel(page, 'M4 English');

  const lemmaPanel = panelSlot(page, 'M4 English').locator('.lemma-annotation-panel');
  // Only saved word-like tokens are lemma targets; separators are absent.
  await expect(lemmaPanel.locator('.lemma-row')).toHaveCount(3);
  await expect(lemmaPanel).toContainText('0 annotated / 3 word-like');
  await expect(
    lemmaPanel.locator('.lemma-row', { hasText: JSON.stringify(' ') }),
  ).toHaveCount(0);
  await expect(
    lemmaPanel.locator('.lemma-row', { hasText: JSON.stringify('🙂') }),
  ).toHaveCount(0);

  // Create.
  await saveLemma(page, 'M4 English', hello!.id, 'house');
  await expect(lemmaPanel).toContainText('1 annotated / 3 word-like');
  await expect(lemmaPanel).toContainText(
    'Saved tokens with lemma annotations cannot be replaced or deleted until those annotations are removed.',
  );

  // Reload -> exact persisted lemma.
  await page.reload();
  await openPanel(page, 'M4 English');
  await expect(
    lemmaRow(page, 'M4 English', hello!.id).locator('.lemma-saved-value'),
  ).toHaveText('house');
  await expect(
    lemmaRow(page, 'M4 English', hello!.id).getByLabel(/^Lemma for /),
  ).toHaveValue('house');

  // Edit.
  await saveLemma(page, 'M4 English', hello!.id, 'houses');
  await page.reload();
  await openPanel(page, 'M4 English');
  await expect(
    lemmaRow(page, 'M4 English', hello!.id).locator('.lemma-saved-value'),
  ).toHaveText('houses');

  // A second, independent occurrence keeps its own identity.
  await saveLemma(page, 'M4 English', bye!.id, 'bye');
  await page.reload();
  await openPanel(page, 'M4 English');
  const reloadedPanel = panelSlot(page, 'M4 English').locator('.lemma-annotation-panel');
  await expect(reloadedPanel).toContainText('2 annotated / 3 word-like');
  await expect(
    lemmaRow(page, 'M4 English', bye!.id).locator('.lemma-saved-value'),
  ).toHaveText('bye');

  // Delete both lemmas explicitly.
  await lemmaRow(page, 'M4 English', hello!.id)
    .getByRole('button', { name: 'Delete lemma' })
    .click();
  await expect(
    lemmaRow(page, 'M4 English', hello!.id).locator('.lemma-empty'),
  ).toBeVisible();
  await lemmaRow(page, 'M4 English', bye!.id)
    .getByRole('button', { name: 'Delete lemma' })
    .click();
  await expect(reloadedPanel).toContainText('0 annotated / 3 word-like');
  await expect(reloadedPanel).not.toContainText('Saved lemma');

  // Sentence and token segmentation are preserved.
  await page.reload();
  await openPanel(page, 'M4 English');
  const slot = panelSlot(page, 'M4 English');
  await expect(slot.locator('.token-segmentation-panel .segmentation-row')).toHaveCount(
    tokens.length,
  );
  await expect(
    slot.locator('.token-segmentation-panel').getByText('Saved'),
  ).toBeVisible();
  await expect(slot.locator('.lemma-annotation-panel .lemma-row')).toHaveCount(3);

  // Alignment state is preserved, and canonical text is unchanged.
  const snapshot = await (
    await request.get(`/api/v1/documents/${document.id}/workspace`)
  ).json() as {
    alignment_groups: Array<{ id: string }>;
    alignment_members: unknown[];
    text_versions: Array<{ id: string; content: string }>;
    token_lemma_annotations: unknown[];
  };
  expect(snapshot.alignment_groups.map((group) => group.id)).toEqual([groupId]);
  expect(snapshot.alignment_members).toHaveLength(2);
  expect(snapshot.token_lemma_annotations).toEqual([]);
  expect(
    snapshot.text_versions.find((item) => item.id === version.id)?.content,
  ).toBe(content);
  const contentRoot = slot.locator('.text-panel [data-text-content-root]');
  await expect(contentRoot).toHaveText(content);
  await expect(contentRoot.locator('.lemma-annotation-panel')).toHaveCount(0);
});

test('M4 lemma dependency blocks retokenization until the annotation is deleted', async ({ page, request }) => {
  const document = await createDocument(request, 'M4 Dependency E2E');
  const content = 'Alpha beta gamma.';
  const version = await createVersion(request, document.id, {
    language_tag: 'en',
    label: 'M4 Dependency',
    content,
    sort_order: 0,
  });
  const sentences = await saveSentenceLayer(request, version, [
    { start: 0, end: content.length },
  ]);
  const tokens = codePointTokens(content);
  const tokenLayer = await saveTokenLayer(
    request,
    version,
    sentences.layer.id,
    tokens,
  );
  const alpha = tokenLayer.segments.find((segment) => segment.exact_text === 'Alpha')!;

  await page.goto(`/documents/${document.id}/workspace`);
  await openPanel(page, 'M4 Dependency');
  await saveLemma(page, 'M4 Dependency', alpha.id, 'alpha');

  // Attempt a saved-token replacement from the token panel: the backend
  // dependency block must surface in the UI.
  const tokenPanel = panelSlot(page, 'M4 Dependency').locator('.token-segmentation-panel');
  await tokenPanel.getByRole('button', { name: 'Start manual' }).click();
  await expect(tokenPanel.getByText('Unsaved preview')).toBeVisible();
  await tokenPanel.getByRole('button', { name: 'Save tokens' }).click();
  const alert = tokenPanel.getByRole('alert');
  await expect(alert).toHaveAttribute(
    'data-error-code',
    'SEGMENTATION_HAS_DEPENDENTS',
  );

  // The API agrees, and the annotation still exists.
  const blocked = await request.put(
    `/api/v1/text-versions/${version.id}/segmentations/token`,
    {
      data: {
        content_hash: version.content_hash,
        basis_sentence_layer_id: sentences.layer.id,
        requested_locale: 'en',
        resolved_locale: 'en',
        origin: 'manual',
        segments: [{ start: 0, end: content.length, is_word_like: true }],
      },
    },
  );
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).code).toBe('SEGMENTATION_HAS_DEPENDENTS');

  // Explicit lemma deletion unblocks retokenization.
  await lemmaRow(page, 'M4 Dependency', alpha.id)
    .getByRole('button', { name: 'Delete lemma' })
    .click();
  await expect(
    lemmaRow(page, 'M4 Dependency', alpha.id).locator('.lemma-empty'),
  ).toBeVisible();

  await tokenPanel.getByRole('button', { name: 'Save tokens' }).click();
  await expect(tokenPanel.getByText('Saved')).toBeVisible();
  await expect(tokenPanel.locator('.segmentation-row')).toHaveCount(1);
  // The new saved token layer has no lemma dependents.
  const refreshedLemmaPanel = panelSlot(page, 'M4 Dependency').locator(
    '.lemma-annotation-panel',
  );
  await expect(refreshedLemmaPanel.locator('.lemma-row')).toHaveCount(1);
  await expect(refreshedLemmaPanel).toContainText('0 annotated / 1 word-like');
});

test('M4 lemma annotation keeps Unicode content and token identity intact', async ({ page, request }) => {
  const document = await createDocument(request, 'M4 Unicode E2E');
  // "Haus Häuser e" + combining acute + "tat 🙂 𠀀" — the server canonicalizes
  // this to NFC, so every offset below is computed from the CANONICAL content.
  const submitted = 'Haus Häuser e\u0301tat 🙂 𠀀';
  const version = await createVersion(request, document.id, {
    language_tag: 'de',
    label: 'M4 Unicode',
    content: submitted,
    sort_order: 0,
  });
  const content = version.content;
  expect(content).not.toBe(submitted);
  const sentences = await saveSentenceLayer(
    request,
    version,
    [{ start: 0, end: Array.from(content).length }],
    'de',
  );
  const tokens = codePointTokens(content);
  const tokenLayer = await saveTokenLayer(
    request,
    version,
    sentences.layer.id,
    tokens,
    'de',
  );
  const byText = (text: string) =>
    tokenLayer.segments.find((segment) => segment.exact_text === text)!;
  const haus = byText('Haus');
  const haeuser = byText('Häuser');
  const etat = byText('état');
  const astral = byText('𠀀');
  // The emoji is a separator token, never a lemma target.
  expect(byText('🙂').is_word_like).toBe(false);

  await page.goto(`/documents/${document.id}/workspace`);
  await openPanel(page, 'M4 Unicode');
  const panel = panelSlot(page, 'M4 Unicode').locator('.lemma-annotation-panel');
  await expect(panel.locator('.lemma-row')).toHaveCount(4);

  // Exact backend-authoritative token previews (canonical NFC text).
  await expect(panel).toContainText(JSON.stringify('Haus'));
  await expect(panel).toContainText(JSON.stringify('Häuser'));
  await expect(panel).toContainText(JSON.stringify('état'));
  await expect(panel).toContainText(JSON.stringify('𠀀'));
  await expect(
    panel.locator('.lemma-row', { hasText: JSON.stringify('🙂') }),
  ).toHaveCount(0);

  await saveLemma(page, 'M4 Unicode', haus.id, 'Haus');
  await saveLemma(page, 'M4 Unicode', haeuser.id, 'Haus');
  // Decomposed combining-mark input is stored NFC-normalized.
  await saveLemma(page, 'M4 Unicode', etat.id, 'e\u0301tat', 'état');
  await saveLemma(page, 'M4 Unicode', astral.id, '𠀀');

  await page.reload();
  await openPanel(page, 'M4 Unicode');
  const reloaded = panelSlot(page, 'M4 Unicode').locator('.lemma-annotation-panel');
  await expect(reloaded).toContainText('4 annotated / 4 word-like');
  await expect(
    lemmaRow(page, 'M4 Unicode', haus.id).locator('.lemma-saved-value'),
  ).toHaveText('Haus');
  await expect(
    lemmaRow(page, 'M4 Unicode', haeuser.id).locator('.lemma-saved-value'),
  ).toHaveText('Haus');
  await expect(
    lemmaRow(page, 'M4 Unicode', etat.id).locator('.lemma-saved-value'),
  ).toHaveText('état');
  await expect(
    lemmaRow(page, 'M4 Unicode', astral.id).locator('.lemma-saved-value'),
  ).toHaveText('𠀀');

  // Canonical text is byte-for-byte the server content; token identity stable.
  const snapshot = await (
    await request.get(`/api/v1/documents/${document.id}/workspace`)
  ).json() as {
    text_versions: Array<{ id: string; content: string }>;
    segments: Array<{
      id: string;
      segmentation_layer_id: string;
      ordinal: number;
      exact_text: string;
      start_offset: number;
      end_offset: number;
    }>;
    token_lemma_annotations: Array<{ token_segment_id: string; lemma: string }>;
  };
  expect(snapshot.text_versions.find((item) => item.id === version.id)?.content).toBe(
    content,
  );
  const storedTokens = snapshot.segments
    .filter((segment) => segment.segmentation_layer_id === tokenLayer.layer.id)
    .sort((left, right) => left.ordinal - right.ordinal);
  expect(storedTokens.map((segment) => segment.exact_text)).toEqual(
    tokens.map((token) => token.text),
  );
  expect(storedTokens.map((segment) => segment.start_offset)).toEqual(
    tokens.map((token) => token.start),
  );
  expect(storedTokens.map((segment) => segment.end_offset)).toEqual(
    tokens.map((token) => token.end),
  );
  expect(snapshot.token_lemma_annotations).toHaveLength(4);
  await expect(
    panelSlot(page, 'M4 Unicode').locator('.text-panel [data-text-content-root]'),
  ).toHaveText(content);
});
