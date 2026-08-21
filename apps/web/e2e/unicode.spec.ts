/**
 * M0.7 Unicode full-stack E2E — RELEASE BLOCKER (M0_PREIMPLEMENTATION_SPEC
 * section 52; M0_PREIMPLEMENTATION_REPORT section 13 "Unicode E2E (emoji)").
 *
 * Proves the complete real-user chain for `Café 🙂 mañana für français`:
 *
 *   server canonical text
 *     → rendered canonical DOM
 *     → native browser Selection / Range
 *     → JS UTF-16 boundary
 *     → canonical Unicode code-point conversion (ADR-001)
 *     → alignment mutation request
 *     → backend validation
 *     → server-derived exact_text
 *     → PostgreSQL Span persistence
 *     → workspace reload
 *     → persisted rendering
 *     → persisted highlighting
 *
 * Directly verified:
 *
 *   1. canonical content (rendered DOM text === server canonical content;
 *      server content is NFC canonical);
 *   2. code-point start offset (status text + persisted span.start_offset);
 *   3. code-point end offset (status text + persisted span.end_offset);
 *   4. exact_text (server-derived, asserted verbatim);
 *   5. persisted Span/member/group state (workspace snapshot rows);
 *   6. reload persistence (UI + snapshot after page reload);
 *   7. rendered annotation state after reload ([data-run].run-aligned runs);
 *   8. highlight/counterpart behavior after reload (hover + activate →
 *      counterpart highlighting and connector visualization).
 *
 * Selections exercise positions BEFORE, AT and AFTER the surrogate-pair
 * emoji (`🙂` = U+1F642, one code point, TWO UTF-16 code units), so any
 * UTF-16/code-point mismatch in the conversion chain fails the test:
 *
 *   - `Café`        → [0, 4)    (before the emoji)
 *   - `Café 🙂`     → [0, 6)    (ends immediately AFTER the emoji: UTF-16
 *                                length would be 7, code-point length is 6)
 *   - `🙂`          → [5, 6)    (the emoji alone: UTF-16 length would be 2)
 *   - `🙂 mañana`   → [5, 13)   (starts AT the emoji: UTF-16 length would
 *                                be 9, code-point length is 8)
 *   - `mañana`      → [7, 13)   (ñ = U+00F1, one code point)
 *   - `für`         → [14, 17)  (ü = U+00FC, one code point)
 *   - `français`    → [18, 26)  (ç = U+00E7, one code point; ends at the
 *                                content end)
 *   - whole text    → [0, 26)   (the authoritative 26-code-point vector)
 *
 * CRITICAL PATH RULE (frozen M0.7 contract W2): the persisted alignment is
 * created ONLY through the real user path — native browser selection in the
 * rendered panels → Add to Alignment → pending tray → Create Alignment.
 * No persisted Span/AlignmentGroup/AlignmentMember is created through API
 * fixture setup. The `request` fixture is used strictly for READ-ONLY
 * verification of the workspace snapshot.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

const EN_TEXT = 'I look forward to seeing you tomorrow.';
const DE_TEXT = 'Ich freue mich darauf, dich morgen zu sehen.';
const UNI_TEXT = 'Café 🙂 mañana für français';

/** Canonical code-point length of UNI_TEXT (ADR-002 mandatory vector = 26). */
const UNI_CODE_POINTS = 26;

/**
 * Select `text` inside one panel's canonical content root using the REAL
 * browser Selection/Range APIs, then fire mouseup so the panel captures the
 * selection (exactly like a user drag). The selection engine — NOT this
 * helper — converts the native UTF-16 positions into canonical code-point
 * offsets; this helper only walks the rendered text nodes to position the
 * native Range.
 */
async function selectTextInPanel(
  page: Page,
  panel: Locator,
  text: string,
): Promise<void> {
  await panel.locator('[data-text-content-root]').evaluate((root, target) => {
    const textContent = root.textContent ?? '';
    const utf16Start = textContent.indexOf(target);
    if (utf16Start < 0) {
      throw new Error(`target text not found in panel: ${target}`);
    }
    const utf16End = utf16Start + target.length;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let accumulated = 0;
    let startNode: Node | null = null;
    let startOffset = 0;
    let endNode: Node | null = null;
    let endOffset = 0;
    let node: Node | null;
    while ((node = walker.nextNode()) !== null) {
      const length = node.textContent?.length ?? 0;
      if (startNode === null && accumulated + length > utf16Start) {
        startNode = node;
        startOffset = utf16Start - accumulated;
      }
      if (accumulated + length >= utf16End) {
        endNode = node;
        endOffset = utf16End - accumulated;
        break;
      }
      accumulated += length;
    }
    if (startNode === null || endNode === null) {
      throw new Error('could not locate the target text nodes');
    }

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const selection = window.getSelection();
    if (selection === null) {
      throw new Error('no window.getSelection');
    }
    selection.removeAllRanges();
    selection.addRange(range);
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  }, text);
}

/** Select `text` in a panel and assert the exact canonical quote + offsets. */
async function selectAndVerify(
  page: Page,
  panel: Locator,
  text: string,
  start: number,
  end: number,
): Promise<void> {
  await selectTextInPanel(page, panel, text);
  await expect(
    panel.getByText(`Selected ${start}–${end}: “${text}”`),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Add to Alignment' }),
  ).toBeEnabled();
}

test.describe('M0.7 Unicode release blocker', () => {
  test('Café 🙂 mañana für français survives the full selection → persistence → reload → highlight chain', async ({
    page,
    request,
  }) => {
    // ===================================================================
    // Setup through the real UI (project / document / versions).
    // ===================================================================
    await page.goto('/');
    await expect(page).toHaveURL(/\/projects$/);

    const projectName = `M0.7 Unicode ${Date.now()}`;
    await page.getByLabel('Name').fill(projectName);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(
      page.getByRole('link', { name: new RegExp(projectName) }),
    ).toBeVisible();

    await page.getByRole('link', { name: projectName }).click();
    await expect(
      page.getByRole('heading', { name: 'Documents' }),
    ).toBeVisible();

    await page.getByLabel('Title').fill('Unicode chapter');
    await page.getByRole('button', { name: 'Create document' }).click();
    await expect(
      page.getByRole('link', { name: /Unicode chapter/ }),
    ).toBeVisible();

    await page.getByRole('link', { name: /Unicode chapter/ }).click();
    await expect(page).toHaveURL(/\/documents\/[^/]+\/workspace$/);

    const versions = [
      { tag: 'en', label: 'English', text: EN_TEXT },
      { tag: 'de', label: 'German', text: DE_TEXT },
      { tag: 'mix', label: 'Unicode', text: UNI_TEXT },
    ];
    for (const { tag, label, text } of versions) {
      await expect(page.getByLabel('Label')).toHaveValue('');
      await page.getByLabel('Language tag (BCP-47)').fill(tag);
      await page.getByLabel('Label').fill(label);
      await page.locator('.import-form').getByLabel('Text').fill(text);
      await page.getByRole('button', { name: 'Add version' }).click();
      await expect(
        page.locator('.text-panel', { hasText: text }).first(),
      ).toBeVisible();
    }
    await expect(page.locator('.text-panel')).toHaveCount(3);

    const enPanel = page.locator('.text-panel', { hasText: EN_TEXT }).first();
    const dePanel = page.locator('.text-panel', { hasText: DE_TEXT }).first();
    const uniPanel = page.locator('.text-panel', { hasText: UNI_TEXT }).first();

    // ===================================================================
    // 1. Canonical content: rendered DOM text is EXACTLY the canonical
    //    server content (26 code points), and the run elements tile it.
    // ===================================================================
    const contentRoot = uniPanel.locator('[data-text-content-root]');
    await expect(contentRoot).toHaveText(UNI_TEXT);
    const domText = await contentRoot.evaluate((root) => root.textContent);
    expect(domText).toBe(UNI_TEXT);
    // data-start/data-end run attributes are code-point offsets: the first
    // run starts at 0 and the last run ends at the 26-code-point length.
    const runBounds = await uniPanel
      .locator('[data-run]')
      .evaluateAll((runs) =>
        runs.map((run) => ({
          start: Number(run.getAttribute('data-start')),
          end: Number(run.getAttribute('data-end')),
        })),
      );
    expect(runBounds.length).toBeGreaterThan(0);
    expect(runBounds[0].start).toBe(0);
    expect(runBounds[runBounds.length - 1].end).toBe(UNI_CODE_POINTS);
    // No alignment yet: no aligned runs, no saved alignments.
    await expect(uniPanel.locator('[data-run].run-aligned')).toHaveCount(0);
    await expect(page.getByText('No saved alignments yet.')).toBeVisible();

    // ===================================================================
    // 2.–3. Native browser selections around/before/after the emoji →
    //       exact canonical code-point offsets (status text is produced by
    //       the frontend selection engine, i.e. the REAL conversion path).
    // ===================================================================
    await selectAndVerify(page, uniPanel, 'Café', 0, 4);
    await selectAndVerify(page, uniPanel, 'Café 🙂', 0, 6);
    await selectAndVerify(page, uniPanel, '🙂', 5, 6);
    await selectAndVerify(page, uniPanel, '🙂 mañana', 5, 13);
    await selectAndVerify(page, uniPanel, 'mañana', 7, 13);
    await selectAndVerify(page, uniPanel, 'für', 14, 17);
    await selectAndVerify(page, uniPanel, 'français', 18, 26);
    await selectAndVerify(page, uniPanel, UNI_TEXT, 0, 26);

    // ===================================================================
    // 4.–5. Build the persisted alignment through the REAL user path:
    //       select → Add to Alignment → tray → Create Alignment.
    // ===================================================================
    // Unicode member A: `Café 🙂` [0,6) — end boundary immediately after
    // the surrogate pair (a UTF-16 implementation would persist end=7).
    await selectAndVerify(page, uniPanel, 'Café 🙂', 0, 6);
    await uniPanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(1);
    await expect(
      page.locator('.tray-member', { hasText: 'Café 🙂' }),
    ).toBeVisible();

    // Unicode member B: `mañana` [7,13) — separated from member A, so the
    // same-version separation rule holds.
    await selectAndVerify(page, uniPanel, 'mañana', 7, 13);
    await uniPanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(2);

    // EN member: `look forward to` [2,17).
    await selectAndVerify(page, enPanel, 'look forward to', 2, 17);
    await enPanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(3);

    // DE member: `freue mich darauf` [4,21).
    await selectAndVerify(page, dePanel, 'freue mich darauf', 4, 21);
    await dePanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(4);
    await expect(
      page.getByRole('button', { name: 'Create Alignment' }),
    ).toBeEnabled();

    // One atomic POST through the UI: tray clears only after success.
    await page.getByRole('button', { name: 'Create Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(0);
    await expect(page.locator('.saved-alignment')).toHaveCount(1);
    await expect(
      page.locator('.saved-alignment-member', { hasText: 'Café 🙂' }),
    ).toBeVisible();
    await expect(
      page.locator('.saved-alignment-member', { hasText: 'mañana' }),
    ).toBeVisible();

    // ===================================================================
    // Backend + PostgreSQL verification (read-only workspace snapshot):
    // server canonical content, code-point offsets, server-derived
    // exact_text, persisted Span/member/group state.
    // ===================================================================
    const workspaceUrl = await page.evaluate(() => window.location.pathname);
    const match = /\/documents\/([^/]+)\/workspace/.exec(workspaceUrl);
    expect(match).not.toBeNull();
    const snapshot = await request.get(
      `/api/v1/documents/${match?.[1]}/workspace`,
    );
    expect(snapshot.ok()).toBeTruthy();
    const body = (await snapshot.json()) as {
      text_versions: Array<{
        id: string;
        language_tag: string;
        label: string;
        content: string;
      }>;
      spans: Array<{
        text_version_id: string;
        start_offset: number;
        end_offset: number;
        exact_text: string;
      }>;
      alignment_groups: Array<{ id: string }>;
      alignment_members: Array<unknown>;
    };

    const uniVersion = body.text_versions.find((v) => v.label === 'Unicode');
    expect(uniVersion).toBeDefined();
    // 1. canonical content is stored verbatim (NFC, LF; 26 code points).
    expect(uniVersion?.content).toBe(UNI_TEXT);
    expect(Array.from(uniVersion?.content ?? '').length).toBe(26);

    // 5. persisted Span/group/member state.
    expect(body.alignment_groups).toHaveLength(1);
    expect(body.alignment_members).toHaveLength(4);
    expect(body.spans).toHaveLength(4);

    // 2.–3. persisted code-point offsets + 4. server-derived exact_text.
    const spansByText = new Map(
      body.spans.map((span) => [span.exact_text, span]),
    );
    const cafeSpan = spansByText.get('Café 🙂');
    expect(cafeSpan).toBeDefined();
    // The emoji boundary proof: [0,6) — NOT the UTF-16 length 7.
    expect(cafeSpan?.start_offset).toBe(0);
    expect(cafeSpan?.end_offset).toBe(6);
    const mananaSpan = spansByText.get('mañana');
    expect(mananaSpan?.start_offset).toBe(7);
    expect(mananaSpan?.end_offset).toBe(13);
    const enSpan = spansByText.get('look forward to');
    expect(enSpan?.start_offset).toBe(2);
    expect(enSpan?.end_offset).toBe(17);
    const deSpan = spansByText.get('freue mich darauf');
    expect(deSpan?.start_offset).toBe(4);
    expect(deSpan?.end_offset).toBe(21);
    // Server-derived exact_text never equals a client-provided value here —
    // the API derives it from the canonical content slice.
    expect(cafeSpan?.exact_text).toBe('Café 🙂');
    expect(mananaSpan?.exact_text).toBe('mañana');

    // Explicit UTF-16 trap check: if the frontend had persisted UTF-16
    // offsets, `Café 🙂` would be [0,7) and `🙂 mañana` [6,15) — the exact
    // code-point coordinates above prove the ADR-001 conversion path.
    expect(cafeSpan?.end_offset).not.toBe(7);

    // ===================================================================
    // 6. Reload: persisted Span/member/group state + rendering survive.
    // ===================================================================
    await page.reload();
    await expect(page.locator('.text-panel')).toHaveCount(3);
    await expect(page.locator('.tray-member')).toHaveCount(0);
    await expect(page.locator('.saved-alignment')).toHaveCount(1);
    await expect(
      page.locator('.saved-alignment-member', { hasText: 'Café 🙂' }),
    ).toBeVisible();
    await expect(
      page.locator('.saved-alignment-member', { hasText: 'mañana' }),
    ).toBeVisible();

    // 7. Rendered annotation state after reload: the persisted Unicode
    //    spans render as aligned runs with EXACT code-point data attributes.
    const alignedUniRuns = uniPanel.locator('[data-run].run-aligned');
    await expect(alignedUniRuns).toHaveCount(2);
    const alignedBounds = await alignedUniRuns.evaluateAll((runs) =>
      runs.map((run) => ({
        start: Number(run.getAttribute('data-start')),
        end: Number(run.getAttribute('data-end')),
        text: run.textContent ?? '',
      })),
    );
    expect(alignedBounds).toEqual([
      { start: 0, end: 6, text: 'Café 🙂' },
      { start: 7, end: 13, text: 'mañana' },
    ]);

    const afterReload = await request.get(
      `/api/v1/documents/${match?.[1]}/workspace`,
    );
    expect(afterReload.ok()).toBeTruthy();
    const afterReloadBody = (await afterReload.json()) as {
      spans: Array<{ start_offset: number; end_offset: number; exact_text: string }>;
      alignment_groups: unknown[];
      alignment_members: unknown[];
    };
    expect(afterReloadBody.alignment_groups).toHaveLength(1);
    expect(afterReloadBody.alignment_members).toHaveLength(4);
    expect(afterReloadBody.spans).toHaveLength(4);
    const afterReloadCafe = afterReloadBody.spans.find(
      (span) => span.exact_text === 'Café 🙂',
    );
    expect(afterReloadCafe?.start_offset).toBe(0);
    expect(afterReloadCafe?.end_offset).toBe(6);

    // 8. Highlight/counterpart behavior after reload: hover the persisted
    //    Unicode member → every counterpart highlights; activate → the
    //    active state, connectors and Inspector persist.
    const uniAlignedRun = alignedUniRuns.first();
    const enAlignedRun = enPanel.locator('[data-run].run-aligned').first();
    const deAlignedRun = dePanel.locator('[data-run].run-aligned').first();
    const connectorLines = page.locator('.connector-overlay .connector-line');

    await uniAlignedRun.hover();
    await expect(uniAlignedRun).toHaveClass(/run-hovered/);
    await expect(enAlignedRun).toHaveClass(/run-hovered/);
    await expect(deAlignedRun).toHaveClass(/run-hovered/);
    await expect(connectorLines).toHaveCount(4);

    await uniAlignedRun.click();
    await page
      .getByRole('heading', { name: /Workspace — Unicode chapter/ })
      .hover();
    await expect(uniAlignedRun).toHaveClass(/run-active/);
    await expect(enAlignedRun).toHaveClass(/run-active/);
    await expect(deAlignedRun).toHaveClass(/run-active/);
    await expect(connectorLines).toHaveCount(4);
    const inspector = page.getByRole('region', {
      name: 'Alignment inspector',
    });
    await expect(inspector).toBeVisible();
    await expect(inspector.locator('.inspector-member')).toHaveCount(4);
    await expect(inspector).toContainText('Café 🙂');
    await expect(inspector).toContainText('mañana');
    await expect(inspector).toContainText('look forward to');
    await expect(inspector).toContainText('freue mich darauf');
    // The Inspector shows the persisted code-point offsets for the Unicode
    // members (rendered as [start, end)).
    await expect(inspector).toContainText('[0, 6)');
    await expect(inspector).toContainText('[7, 13)');
  });
});
