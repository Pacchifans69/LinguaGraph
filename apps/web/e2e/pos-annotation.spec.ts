import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * M5 coarse POS annotation E2E (ADR-013).
 *
 * Primary path: create text -> save sentence segmentation -> save token
 * segmentation -> choose a saved eligible word-like token -> save coarse POS
 * -> reload -> verify the exact persisted value -> edit -> reload -> verify
 * -> delete -> verify it is gone -> verify sentence/token segmentation, the
 * sibling lemma panel and Alignment state are unchanged.
 *
 * Dependency path: a saved lemma + POS block token replacement with
 * SEGMENTATION_HAS_DEPENDENTS reporting BOTH dependency types; deleting one
 * sibling keeps the parent blocked; deleting the final sibling unblocks it.
 * Both sibling-deletion orders are covered.
 *
 * Unicode path: non-ASCII, combining-mark and astral content keep canonical
 * text and token identity intact while using the same closed fifteen-value
 * vocabulary (no language-specific tagsets).
 */

interface TokenRange {
  start: number;
  end: number;
  is_word_like: boolean;
  text: string;
}

const FROZEN_TAGS = [
  'ADJ',
  'ADP',
  'ADV',
  'AUX',
  'CCONJ',
  'DET',
  'INTJ',
  'NOUN',
  'NUM',
  'PART',
  'PRON',
  'PROPN',
  'SCONJ',
  'VERB',
  'X',
];

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

function posPanel(page: Page, label: string) {
  return panelSlot(page, label).locator('.pos-annotation-panel');
}

function lemmaPanel(page: Page, label: string) {
  return panelSlot(page, label).locator('.lemma-annotation-panel');
}

function posRow(page: Page, label: string, tokenSegmentId: string) {
  return posPanel(page, label).locator(
    `[data-token-segment-id="${tokenSegmentId}"]`,
  );
}

function lemmaRow(page: Page, label: string, tokenSegmentId: string) {
  return lemmaPanel(page, label).locator(
    `[data-token-segment-id="${tokenSegmentId}"]`,
  );
}

async function savePos(
  page: Page,
  label: string,
  tokenSegmentId: string,
  tag: string,
) {
  const row = posRow(page, label, tokenSegmentId);
  await row.getByLabel(/^Coarse POS for /).selectOption(tag);
  await row.getByRole('button', { name: 'Save POS' }).click();
  await expect(row.locator('.pos-saved-value')).toHaveText(tag);
}

async function saveLemma(
  page: Page,
  label: string,
  tokenSegmentId: string,
  lemma: string,
) {
  const row = lemmaRow(page, label, tokenSegmentId);
  await row.getByLabel(/^Lemma for /).fill(lemma);
  await row.getByRole('button', { name: 'Save lemma' }).click();
  await expect(row.locator('.lemma-saved-value')).toHaveText(lemma);
}

function tokenReplacement(
  version: { content_hash: string },
  sentenceLayerId: string,
  segments: Array<{ start: number; end: number; is_word_like: boolean }>,
) {
  return {
    content_hash: version.content_hash,
    basis_sentence_layer_id: sentenceLayerId,
    requested_locale: 'en',
    resolved_locale: 'en',
    origin: 'manual',
    segments,
  };
}

test('M5 POS annotation persists, edits, deletes, and preserves segmentation + lemma + Alignment', async ({ page, request }) => {
  const document = await createDocument(request, 'M5 POS E2E');
  const content = 'Hello world. Bye 🙂!';
  const version = await createVersion(request, document.id, {
    language_tag: 'en',
    label: 'M5 English',
    content,
    sort_order: 0,
  });
  const german = await createVersion(request, document.id, {
    language_tag: 'de',
    label: 'M5 German',
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
  // The astral emoji is a separator token: never a POS target.
  expect(emoji?.is_word_like).toBe(false);

  // A sibling lemma and existing Alignment state that POS must not disturb.
  await request.put(`/api/v1/token-segments/${hello!.id}/lemma`, {
    data: { lemma: 'house' },
  });
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
  await openPanel(page, 'M5 English');

  const panel = posPanel(page, 'M5 English');
  // Only saved word-like tokens are POS targets; separators are absent.
  await expect(panel.locator('.pos-row')).toHaveCount(3);
  await expect(panel).toContainText('0 annotated / 3 word-like');
  await expect(
    panel.locator('.pos-row', { hasText: JSON.stringify(' ') }),
  ).toHaveCount(0);
  await expect(
    panel.locator('.pos-row', { hasText: JSON.stringify('🙂') }),
  ).toHaveCount(0);

  // The controlled selector exposes exactly the fifteen frozen values.
  const selector = posRow(page, 'M5 English', hello!.id).getByLabel(
    /^Coarse POS for /,
  );
  const selectable = await selector
    .locator('option')
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter((value) => value !== ''),
    );
  expect(selectable).toEqual(FROZEN_TAGS);
  await expect(selector.locator('option[value="PUNCT"]')).toHaveCount(0);
  await expect(selector.locator('option[value="SYM"]')).toHaveCount(0);

  // Create (POS without lemma is also legal; here the sibling lemma already exists).
  await savePos(page, 'M5 English', hello!.id, 'NOUN');
  await expect(panel).toContainText('1 annotated / 3 word-like');

  // Reload -> exact persisted value in both the display and the control.
  await page.reload();
  await openPanel(page, 'M5 English');
  await expect(
    posRow(page, 'M5 English', hello!.id).locator('.pos-saved-value'),
  ).toHaveText('NOUN');
  await expect(
    posRow(page, 'M5 English', hello!.id).getByLabel(/^Coarse POS for /),
  ).toHaveValue('NOUN');

  // Edit.
  await savePos(page, 'M5 English', hello!.id, 'VERB');
  await page.reload();
  await openPanel(page, 'M5 English');
  await expect(
    posRow(page, 'M5 English', hello!.id).locator('.pos-saved-value'),
  ).toHaveText('VERB');

  // A second, independent occurrence keeps its own identity and value.
  await savePos(page, 'M5 English', bye!.id, 'INTJ');
  await page.reload();
  await openPanel(page, 'M5 English');
  const reloadedPanel = posPanel(page, 'M5 English');
  await expect(reloadedPanel).toContainText('2 annotated / 3 word-like');
  await expect(
    posRow(page, 'M5 English', bye!.id).locator('.pos-saved-value'),
  ).toHaveText('INTJ');

  // Delete both POS annotations explicitly.
  await posRow(page, 'M5 English', hello!.id)
    .getByRole('button', { name: 'Delete POS' })
    .click();
  await expect(
    posRow(page, 'M5 English', hello!.id).locator('.pos-empty'),
  ).toBeVisible();
  await posRow(page, 'M5 English', bye!.id)
    .getByRole('button', { name: 'Delete POS' })
    .click();
  await expect(reloadedPanel).toContainText('0 annotated / 3 word-like');
  await expect(reloadedPanel).not.toContainText('Saved POS');

  // The sibling lemma survived both POS writes and deletions.
  await expect(
    lemmaRow(page, 'M5 English', hello!.id).locator('.lemma-saved-value'),
  ).toHaveText('house');

  // Sentence and token segmentation are preserved.
  await page.reload();
  await openPanel(page, 'M5 English');
  const slot = panelSlot(page, 'M5 English');
  await expect(slot.locator('.token-segmentation-panel .segmentation-row')).toHaveCount(
    tokens.length,
  );
  await expect(
    slot.locator('.token-segmentation-panel').getByText('Saved'),
  ).toBeVisible();
  await expect(slot.locator('.pos-annotation-panel .pos-row')).toHaveCount(3);

  // Alignment state is preserved, and canonical text is unchanged.
  const snapshot = await (
    await request.get(`/api/v1/documents/${document.id}/workspace`)
  ).json() as {
    alignment_groups: Array<{ id: string }>;
    alignment_members: unknown[];
    text_versions: Array<{ id: string; content: string }>;
    token_lemma_annotations: Array<{ token_segment_id: string; lemma: string }>;
    token_pos_annotations: unknown[];
  };
  expect(snapshot.alignment_groups.map((group) => group.id)).toEqual([groupId]);
  expect(snapshot.alignment_members).toHaveLength(2);
  expect(snapshot.token_pos_annotations).toEqual([]);
  expect(snapshot.token_lemma_annotations).toEqual([
    expect.objectContaining({ token_segment_id: hello!.id, lemma: 'house' }),
  ]);
  expect(
    snapshot.text_versions.find((item) => item.id === version.id)?.content,
  ).toBe(content);
  const contentRoot = slot.locator('.text-panel [data-text-content-root]');
  await expect(contentRoot).toHaveText(content);
  await expect(contentRoot.locator('.pos-annotation-panel')).toHaveCount(0);
});

test('M5 multi-dependent block reports both types and unblocks only after both siblings are deleted (lemma first)', async ({ page, request }) => {
  const document = await createDocument(request, 'M5 Dependency A');
  const content = 'Alpha beta gamma.';
  const version = await createVersion(request, document.id, {
    language_tag: 'en',
    label: 'M5 Dependency A',
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
  await openPanel(page, 'M5 Dependency A');
  await saveLemma(page, 'M5 Dependency A', alpha.id, 'alpha');
  await savePos(page, 'M5 Dependency A', alpha.id, 'NOUN');

  // The backend reports BOTH dependency types in canonical order.
  const both = await request.put(
    `/api/v1/text-versions/${version.id}/segmentations/token`,
    {
      data: tokenReplacement(version, sentences.layer.id, [
        { start: 0, end: content.length, is_word_like: true },
      ]),
    },
  );
  expect(both.status()).toBe(409);
  const bothBody = await both.json();
  expect(bothBody.code).toBe('SEGMENTATION_HAS_DEPENDENTS');
  expect(bothBody.details.dependency_types).toEqual([
    'lemma_annotations',
    'pos_annotations',
  ]);
  // No artificial primary dependency is implied for the multi-dependent case.
  expect(bothBody.details.dependency_type).toBeUndefined();

  // The token panel surfaces the same stable conflict.
  const tokenPanel = panelSlot(page, 'M5 Dependency A').locator(
    '.token-segmentation-panel',
  );
  await tokenPanel.getByRole('button', { name: 'Start manual' }).click();
  await expect(tokenPanel.getByText('Unsaved preview')).toBeVisible();
  await tokenPanel.getByRole('button', { name: 'Save tokens' }).click();
  await expect(tokenPanel.getByRole('alert')).toHaveAttribute(
    'data-error-code',
    'SEGMENTATION_HAS_DEPENDENTS',
  );

  // Delete the LEMMA first: the POS dependent still blocks the parent.
  await lemmaRow(page, 'M5 Dependency A', alpha.id)
    .getByRole('button', { name: 'Delete lemma' })
    .click();
  await expect(
    lemmaRow(page, 'M5 Dependency A', alpha.id).locator('.lemma-empty'),
  ).toBeVisible();
  const posOnly = await request.put(
    `/api/v1/text-versions/${version.id}/segmentations/token`,
    {
      data: tokenReplacement(version, sentences.layer.id, [
        { start: 0, end: content.length, is_word_like: true },
      ]),
    },
  );
  expect(posOnly.status()).toBe(409);
  const posOnlyBody = await posOnly.json();
  expect(posOnlyBody.details.dependency_types).toEqual(['pos_annotations']);
  expect(posOnlyBody.details.dependency_type).toBe('pos_annotations');

  // Delete the remaining POS: token replacement now succeeds.
  await posRow(page, 'M5 Dependency A', alpha.id)
    .getByRole('button', { name: 'Delete POS' })
    .click();
  await expect(
    posRow(page, 'M5 Dependency A', alpha.id).locator('.pos-empty'),
  ).toBeVisible();
  await tokenPanel.getByRole('button', { name: 'Save tokens' }).click();
  await expect(tokenPanel.getByText('Saved')).toBeVisible();
  await expect(tokenPanel.locator('.segmentation-row')).toHaveCount(1);
  // No automatic re-anchoring: the new saved layer has no dependents.
  const refreshed = posPanel(page, 'M5 Dependency A');
  await expect(refreshed.locator('.pos-row')).toHaveCount(1);
  await expect(refreshed).toContainText('0 annotated / 1 word-like');
});

test('M5 multi-dependent block unblocks only after both siblings are deleted (POS first)', async ({ page, request }) => {
  const document = await createDocument(request, 'M5 Dependency B');
  const content = 'Alpha beta gamma.';
  const version = await createVersion(request, document.id, {
    language_tag: 'en',
    label: 'M5 Dependency B',
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
  await openPanel(page, 'M5 Dependency B');
  await savePos(page, 'M5 Dependency B', alpha.id, 'VERB');
  await saveLemma(page, 'M5 Dependency B', alpha.id, 'alpha');

  // Delete the POS first: the lemma dependent still blocks the parent.
  await posRow(page, 'M5 Dependency B', alpha.id)
    .getByRole('button', { name: 'Delete POS' })
    .click();
  await expect(
    posRow(page, 'M5 Dependency B', alpha.id).locator('.pos-empty'),
  ).toBeVisible();
  const lemmaOnly = await request.put(
    `/api/v1/text-versions/${version.id}/segmentations/token`,
    {
      data: tokenReplacement(version, sentences.layer.id, [
        { start: 0, end: content.length, is_word_like: true },
      ]),
    },
  );
  expect(lemmaOnly.status()).toBe(409);
  const lemmaOnlyBody = await lemmaOnly.json();
  expect(lemmaOnlyBody.details.dependency_types).toEqual(['lemma_annotations']);
  expect(lemmaOnlyBody.details.dependency_type).toBe('lemma_annotations');

  // Delete the remaining lemma: token replacement now succeeds.
  await lemmaRow(page, 'M5 Dependency B', alpha.id)
    .getByRole('button', { name: 'Delete lemma' })
    .click();
  const replaced = await request.put(
    `/api/v1/text-versions/${version.id}/segmentations/token`,
    {
      data: tokenReplacement(version, sentences.layer.id, [
        { start: 0, end: content.length, is_word_like: true },
      ]),
    },
  );
  expect(replaced.status()).toBe(200);
  const snapshot = await (
    await request.get(`/api/v1/documents/${document.id}/workspace`)
  ).json() as {
    token_pos_annotations: unknown[];
    token_lemma_annotations: unknown[];
  };
  expect(snapshot.token_pos_annotations).toEqual([]);
  expect(snapshot.token_lemma_annotations).toEqual([]);
});

test('M5 POS annotation keeps Unicode content and token identity intact', async ({ page, request }) => {
  const document = await createDocument(request, 'M5 Unicode E2E');
  // "Haus Häuser e" + combining acute + "tat 🙂 𠀀" — the server canonicalizes
  // this to NFC, so every offset below is computed from the CANONICAL content.
  const submitted = 'Haus Häuser e\u0301tat 🙂 𠀀';
  const version = await createVersion(request, document.id, {
    language_tag: 'de',
    label: 'M5 Unicode',
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
  // The emoji is a separator token, never a POS target.
  expect(byText('🙂').is_word_like).toBe(false);

  await page.goto(`/documents/${document.id}/workspace`);
  await openPanel(page, 'M5 Unicode');
  const panel = posPanel(page, 'M5 Unicode');
  await expect(panel.locator('.pos-row')).toHaveCount(4);

  // Exact backend-authoritative token previews (canonical NFC text).
  await expect(panel).toContainText(JSON.stringify('Haus'));
  await expect(panel).toContainText(JSON.stringify('Häuser'));
  await expect(panel).toContainText(JSON.stringify('état'));
  await expect(panel).toContainText(JSON.stringify('𠀀'));
  await expect(
    panel.locator('.pos-row', { hasText: JSON.stringify('🙂') }),
  ).toHaveCount(0);

  // The same closed vocabulary applies to German content: no language-specific
  // tagset is introduced and the selector values are unchanged.
  const selector = posRow(page, 'M5 Unicode', haus.id).getByLabel(/^Coarse POS for /);
  const selectable = await selector
    .locator('option')
    .evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .filter((value) => value !== ''),
    );
  expect(selectable).toEqual(FROZEN_TAGS);

  await savePos(page, 'M5 Unicode', haus.id, 'NOUN');
  await savePos(page, 'M5 Unicode', haeuser.id, 'NOUN');
  await savePos(page, 'M5 Unicode', etat.id, 'VERB');
  await savePos(page, 'M5 Unicode', astral.id, 'X');

  await page.reload();
  await openPanel(page, 'M5 Unicode');
  const reloaded = posPanel(page, 'M5 Unicode');
  await expect(reloaded).toContainText('4 annotated / 4 word-like');
  await expect(
    posRow(page, 'M5 Unicode', haus.id).locator('.pos-saved-value'),
  ).toHaveText('NOUN');
  await expect(
    posRow(page, 'M5 Unicode', etat.id).locator('.pos-saved-value'),
  ).toHaveText('VERB');
  await expect(
    posRow(page, 'M5 Unicode', astral.id).locator('.pos-saved-value'),
  ).toHaveText('X');

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
    token_pos_annotations: Array<{ token_segment_id: string; pos_tag: string }>;
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
  expect(snapshot.token_pos_annotations).toHaveLength(4);
  await expect(
    panelSlot(page, 'M5 Unicode').locator('.text-panel [data-text-content-root]'),
  ).toHaveText(content);
});
