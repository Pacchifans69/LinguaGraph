/**
 * M0 golden path — M0.3 + M0.4 + M0.5 + M0.6 slices.
 *
 * M0.3 portion (document workspace):
 *
 *   1. create Project;
 *   2. create ParallelDocument;
 *   3. add EN / DE / FR / ES TextVersions (paste);
 *   4. open all four panels;
 *   5. verify hide/show/reorder and reload-preference behavior;
 *   6. STOP.
 *
 * M0.4 portion (selection engine, continued from the M0.3 STOP point):
 *
 *   7. add a Unicode TextVersion with non-BMP content
 *      ('Café 🙂 mañana für français');
 *   8. native Range selections -> canonical quote/offsets (EN, DE, Unicode);
 *   9. explicit Add to Alignment -> pending tray; stage members;
 *  10. stage a DE member;
 *  11. Unicode browser-level scenario around a surrogate pair;
 *  12. reload: panel preferences persist, the pending tray does not;
 *  13. re-stage EN + DE, remove one pending member, re-add it;
 *  14. duplicate staging rejection (same version + start + end);
 *  15. same-version overlap staging rejection;
 *  16. clear tray;
 *  17. query the workspace snapshot: M0.4 staging persisted NOTHING
 *      (spans == [], alignment_groups == [], alignment_members == []);
 *  18. M0.4 STOP point; the M0.5 slice continues below.
 *
 * M0.5 portion (alignment persistence, continued from the M0.4 STOP
 * point) — the real user loop:
 *
 *  19. stage EN [2,17) + EN [18,28) (same-version multi-span) + DE [4,21)
 *      through the UI; Create Alignment disabled until >=2 members from
 *      >=2 distinct TextVersions are staged;
 *  20. Create Alignment through the UI: tray clears, saved alignment
 *      visibly appears, snapshot contains Span/Group/Member rows;
 *  21. workspace snapshot carries the persisted data with server-derived
 *      exact_text;
 *  22. reload: tray is empty, saved alignment still visible, persisted
 *      workspace data still present;
 *  23. STOP — M0.6 (hover/active visualization, connectors, Inspector).
 *
 * It deliberately does NOT touch any M0.6 surface (hover/active
 * visualization, connectors, Inspector).
 *
 * Assertions that look for version content are scoped to `.text-panel`:
 * `page.getByText()` also matches `<textarea>` values, which would otherwise
 * false-positive before the server round-trip settles.
 */

import { expect, test, type Locator, type Page } from '@playwright/test';

const EN_TEXT = 'I look forward to seeing you tomorrow.';
const DE_TEXT = 'Ich freue mich darauf, dich morgen zu sehen.';
const FR_TEXT = 'J’ai hâte de te voir demain.';
const ES_TEXT = 'Tengo ganas de verte mañana.';
const UNI_TEXT = 'Café 🙂 mañana für français';

/**
 * M0.6 fixture helper: locate the Unicode code-point index of `quote` in
 * `content` (ADR-001 — offsets are code points, never UTF-16 units).
 */
function codePointIndexOf(content: string, quote: string): number {
  const joined = Array.from(content).join('');
  const utf16Index = joined.indexOf(quote);
  if (utf16Index < 0) {
    throw new Error(`quote not found in content: ${quote}`);
  }
  return Array.from(joined.slice(0, utf16Index)).length;
}

/**
 * Select `text` inside one panel's canonical content root using the REAL
 * browser Selection/Range APIs, then fire mouseup so the panel captures the
 * selection (exactly like a user drag).
 *
 * The panel's `data-run` text nodes tile the canonical content exactly, so a
 * text-node walk maps the target's UTF-16 position to node + local offset.
 * The selection engine (not this helper) converts those UTF-16 positions
 * into canonical code-point offsets.
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
  expectedStatus: string,
): Promise<void> {
  await selectTextInPanel(page, panel, text);
  await expect(panel.getByText(expectedStatus)).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Add to Alignment' }),
  ).toBeEnabled();
}

test.describe('M0 golden path (M0.3 + M0.4 + M0.5 + M0.6 slices)', () => {
  test('creates a project/document/versions, manages text panels, persists alignments and completes the M0.6 visualization loop', async ({
    page,
    request,
  }) => {
    // The backend runs against a dedicated disposable PostgreSQL database
    // (see playwright.config.ts / app.e2e.server): no clean-slate deletion
    // of pre-existing data is performed, and the test only creates data of
    // its own, which disappears when the disposable database is dropped.

    // 1. Create a Project.
    await page.goto('/');
    // The index route redirects to /projects.
    await expect(page).toHaveURL(/\/projects$/);
    await expect(
      page.getByRole('heading', { name: 'Projects' }),
    ).toBeVisible();

    const projectName = `M0 Golden ${Date.now()}`;
    await page.getByLabel('Name').fill(projectName);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(
      page.getByRole('link', { name: new RegExp(projectName) }),
    ).toBeVisible();

    // 2. Create a ParallelDocument.
    await page.getByRole('link', { name: projectName }).click();
    await expect(page).toHaveURL(/\/projects\/[^/]+\/documents$/);
    await expect(
      page.getByRole('heading', { name: 'Documents' }),
    ).toBeVisible();

    await page.getByLabel('Title').fill('Chapter 1');
    await page.getByRole('button', { name: 'Create document' }).click();
    await expect(
      page.getByRole('link', { name: /Chapter 1/ }),
    ).toBeVisible();

    // 3. Add EN / DE / FR / ES TextVersions by pasting plain text.
    await page.getByRole('link', { name: /Chapter 1/ }).click();
    await expect(page).toHaveURL(/\/documents\/[^/]+\/workspace$/);
    await expect(
      page.getByRole('heading', { name: /Workspace — Chapter 1/ }),
    ).toBeVisible();

    const versions = [
      { tag: 'en', label: 'English', text: EN_TEXT },
      { tag: 'de', label: 'German', text: DE_TEXT },
      { tag: 'fr', label: 'French', text: FR_TEXT },
      { tag: 'es', label: 'Spanish', text: ES_TEXT },
    ];
    for (let index = 0; index < versions.length; index += 1) {
      const { tag, label, text } = versions[index];
      // Wait for the previous mutation's reset to settle before typing.
      await expect(page.getByLabel('Label')).toHaveValue('');
      await page.getByLabel('Language tag (BCP-47)').fill(tag);
      await page.getByLabel('Label').fill(label);
      await page.locator('.import-form').getByLabel('Text').fill(text);
      await page.getByRole('button', { name: 'Add version' }).click();
      // The new version panel opens with the canonical server content
      // (scoped to the panel — getByText would also match the textarea).
      await expect(
        page
          .locator('.text-panel', { hasText: text })
          .first(),
      ).toBeVisible();
      await expect(page.locator('.text-panel')).toHaveCount(index + 1);
    }

    // 4. All four panels are open side by side.
    await expect(page.locator('.text-panel')).toHaveCount(4);
    for (const text of [EN_TEXT, DE_TEXT, FR_TEXT, ES_TEXT]) {
      await expect(
        page.locator('.text-panel', { hasText: text }).first(),
      ).toBeVisible();
    }

    // 5a. Hide a panel (Spanish) and reopen it from the hidden list.
    await page.getByRole('button', { name: 'Hide Spanish panel' }).click();
    await expect(page.locator('.text-panel')).toHaveCount(3);
    await expect(
      page.locator('.text-panel', { hasText: ES_TEXT }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Open Spanish/ }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Open Spanish/ }).click();
    await expect(page.locator('.text-panel')).toHaveCount(4);

    // 5b. Reorder: move the English panel right, then back (local preference,
    // not a server PATCH). Controls live in the panel-slot (not the text
    // panel element itself).
    await page
      .locator('.panel-slot', { hasText: EN_TEXT })
      .getByRole('button', { name: 'Move English right' })
      .click();
    await expect(
      page.locator('.text-panel').first(),
    ).not.toContainText(EN_TEXT);
    await page
      .locator('.panel-slot', { hasText: EN_TEXT })
      .getByRole('button', { name: 'Move English left' })
      .click();

    // 5c. Reload: panel preference persists (per-document), panels reopen.
    await page.reload();
    await expect(page.locator('.text-panel')).toHaveCount(4);
    for (const text of [EN_TEXT, DE_TEXT, FR_TEXT, ES_TEXT]) {
      await expect(
        page.locator('.text-panel', { hasText: text }).first(),
      ).toBeVisible();
    }

    // 6. M0.3 STOP point reached. The M0.4 slice continues below.

    // ===================================================================
    // M0.4 — Selection Engine slice
    // ===================================================================

    // 7. Add a Unicode TextVersion with non-BMP content.
    await expect(page.getByLabel('Label')).toHaveValue('');
    await page.getByLabel('Language tag (BCP-47)').fill('mix');
    await page.getByLabel('Label').fill('Unicode');
    await page.locator('.import-form').getByLabel('Text').fill(UNI_TEXT);
    await page.getByRole('button', { name: 'Add version' }).click();
    await expect(page.locator('.text-panel')).toHaveCount(5);

    const enPanel = page.locator('.text-panel', { hasText: EN_TEXT }).first();
    const dePanel = page.locator('.text-panel', { hasText: DE_TEXT }).first();
    const uniPanel = page.locator('.text-panel', { hasText: UNI_TEXT }).first();

    // No selection yet: every panel's Add to Alignment is disabled and the
    // tray is empty.
    await expect(page.getByRole('button', { name: 'Add to Alignment' }).first()).toBeDisabled();
    await expect(page.getByText('No pending selections.')).toBeVisible();

    // 8. Native Range selection in the EN panel -> canonical quote/offsets.
    await selectAndVerify(page, enPanel, 'look forward to', 'Selected 2–17: “look forward to”');

    // 9. Explicit Add to Alignment -> one pending member; current selection
    //    is consumed (status disappears, button disabled again).
    await enPanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(1);
    await expect(page.locator('.tray-member', { hasText: 'look forward to' })).toBeVisible();
    await expect(enPanel.getByText('Selected 2–17: “look forward to”')).toHaveCount(0);
    await expect(enPanel.getByRole('button', { name: 'Add to Alignment' })).toBeDisabled();

    // 10. Stage a DE member (exact code-point offsets across a panel).
    await selectAndVerify(page, dePanel, 'freue mich darauf', 'Selected 4–21: “freue mich darauf”');
    await dePanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(2);

    // 11. Unicode browser-level scenario: native selection around a
    //     surrogate pair ('🙂') produces exact code-point coordinates.
    //     'Café 🙂 mañana für français' -> '🙂 mañana' = canonical [5,13).
    await selectAndVerify(page, uniPanel, '🙂 mañana', 'Selected 5–13: “🙂 mañana”');
    await uniPanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(3);
    await expect(
      page.locator('.tray-member', { hasText: '🙂 mañana' }),
    ).toBeVisible();

    // Also prove a pure non-BMP selection: the whole 'A🙂B'-style emoji
    // boundary inside the mixed vector (select just the emoji: [5,6)).
    await selectAndVerify(page, uniPanel, '🙂', 'Selected 5–6: “🙂”');

    // 12. Reload: panel preferences persist; the pending tray does not.
    await page.reload();
    await expect(page.locator('.text-panel')).toHaveCount(5);
    await expect(page.locator('.tray-member')).toHaveCount(0);
    await expect(page.getByText('No pending selections.')).toBeVisible();

    // 13. Re-stage EN + DE, remove one pending member, re-add it.
    await selectAndVerify(page, enPanel, 'look forward to', 'Selected 2–17: “look forward to”');
    await enPanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(1);
    await selectAndVerify(page, dePanel, 'freue mich darauf', 'Selected 4–21: “freue mich darauf”');
    await dePanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(2);

    await page
      .getByRole('button', { name: 'Remove “freue mich darauf” from tray' })
      .click();
    await expect(page.locator('.tray-member')).toHaveCount(1);
    await expect(
      page.locator('.tray-member', { hasText: 'freue mich darauf' }),
    ).toHaveCount(0);

    await selectAndVerify(page, dePanel, 'freue mich darauf', 'Selected 4–21: “freue mich darauf”');
    await dePanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(2);

    // 14. Duplicate staging rejection (same version + start + end).
    await selectAndVerify(page, enPanel, 'look forward to', 'Selected 2–17: “look forward to”');
    await enPanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(
      enPanel.getByRole('alert'),
    ).toHaveText(/already in the tray/);
    await expect(page.locator('.tray-member')).toHaveCount(2);

    // 15. Same-version overlap staging rejection ([2,15) overlaps [2,17)).
    await selectAndVerify(page, enPanel, 'look forward', 'Selected 2–14: “look forward”');
    await enPanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(enPanel.getByRole('alert')).toHaveText(/overlaps/);
    await expect(page.locator('.tray-member')).toHaveCount(2);

    // 16. Clear the tray explicitly.
    await page.getByRole('button', { name: 'Clear tray' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(0);
    await expect(page.getByText('No pending selections.')).toBeVisible();

    // 17. M0.4 staging persisted NOTHING: the workspace snapshot still has
    //     no spans / alignment groups / alignment members.
    const workspaceUrl = await page.evaluate(() => window.location.pathname);
    const match = /\/documents\/([^/]+)\/workspace/.exec(workspaceUrl);
    expect(match).not.toBeNull();
    const snapshot = await request.get(
      `/api/v1/documents/${match?.[1]}/workspace`,
    );
    expect(snapshot.ok()).toBeTruthy();
    const body = (await snapshot.json()) as {
      text_versions: Array<{ language_tag: string; label: string }>;
      spans: unknown[];
      alignment_groups: unknown[];
      alignment_members: unknown[];
    };
    expect(body.text_versions.map((v) => v.language_tag).sort()).toEqual([
      'de',
      'en',
      'es',
      'fr',
      'mix',
    ]);
    expect(body.spans).toEqual([]);
    expect(body.alignment_groups).toEqual([]);
    expect(body.alignment_members).toEqual([]);

    // 18. M0.4 STOP point. The M0.5 slice continues below.

    // ===================================================================
    // M0.5 — Alignment Persistence slice
    // ===================================================================

    // 19. Stage a real alignment through the UI: two separated EN spans
    //     (same-version multi-span) plus one DE span (>=2 distinct
    //     TextVersions). The Create Alignment button becomes enabled only
    //     when both conditions hold.
    await selectAndVerify(page, enPanel, 'look forward to', 'Selected 2–17: “look forward to”');
    await enPanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(1);

    await selectAndVerify(page, enPanel, 'seeing you', 'Selected 18–28: “seeing you”');
    await enPanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(2);
    // Two members but only ONE distinct TextVersion: still disabled.
    await expect(page.getByRole('button', { name: 'Create Alignment' })).toBeDisabled();

    await selectAndVerify(page, dePanel, 'freue mich darauf', 'Selected 4–21: “freue mich darauf”');
    await dePanel.getByRole('button', { name: 'Add to Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Create Alignment' })).toBeEnabled();

    // 20. Create Alignment through the UI: one atomic POST, tray cleared
    //     only after success, saved alignment appears from server state.
    await page.getByRole('button', { name: 'Create Alignment' }).click();
    await expect(page.locator('.tray-member')).toHaveCount(0);
    await expect(page.getByText('No pending selections.')).toBeVisible();
    await expect(page.locator('.saved-alignment')).toHaveCount(1);
    await expect(
      page.locator('.saved-alignment-member', { hasText: 'look forward to' }),
    ).toBeVisible();
    await expect(
      page.locator('.saved-alignment-member', { hasText: 'seeing you' }),
    ).toBeVisible();
    await expect(
      page.locator('.saved-alignment-member', { hasText: 'freue mich darauf' }),
    ).toBeVisible();

    // 21. The workspace snapshot now contains the persisted Span/Group/
    //     Member rows (server-derived exact_text included).
    const persisted = await request.get(
      `/api/v1/documents/${match?.[1]}/workspace`,
    );
    expect(persisted.ok()).toBeTruthy();
    const persistedBody = (await persisted.json()) as {
      spans: Array<{ start_offset: number; end_offset: number; exact_text: string }>;
      alignment_groups: unknown[];
      alignment_members: unknown[];
    };
    expect(persistedBody.spans).toHaveLength(3);
    expect(
      persistedBody.spans.map((s) => s.exact_text).sort(),
    ).toEqual(['freue mich darauf', 'look forward to', 'seeing you']);
    expect(persistedBody.spans.every((s) => s.start_offset < s.end_offset)).toBe(true);
    expect(persistedBody.alignment_groups).toHaveLength(1);
    expect(persistedBody.alignment_members).toHaveLength(3);

    // 22. Reload: the pending tray is empty (ephemeral), the saved
    //     alignment remains visibly present, and the persisted workspace
    //     data remains present — the M0 persistence loop closes.
    await page.reload();
    await expect(page.locator('.text-panel')).toHaveCount(5);
    await expect(page.getByText('No pending selections.')).toBeVisible();
    await expect(page.locator('.tray-member')).toHaveCount(0);
    await expect(page.locator('.saved-alignment')).toHaveCount(1);
    await expect(
      page.locator('.saved-alignment-member', { hasText: 'look forward to' }),
    ).toBeVisible();
    await expect(
      page.locator('.saved-alignment-member', { hasText: 'freue mich darauf' }),
    ).toBeVisible();

    const afterReload = await request.get(
      `/api/v1/documents/${match?.[1]}/workspace`,
    );
    expect(afterReload.ok()).toBeTruthy();
    const afterReloadBody = (await afterReload.json()) as {
      spans: unknown[];
      alignment_groups: unknown[];
      alignment_members: unknown[];
    };
    expect(afterReloadBody.spans).toHaveLength(3);
    expect(afterReloadBody.alignment_groups).toHaveLength(1);
    expect(afterReloadBody.alignment_members).toHaveLength(3);

    // 23. M0.6 STOP boundary reached (historical M0.5 proof above is
    //     complete and unchanged). The M0.6 slice continues below.

    // ===================================================================
    // M0.6 — Alignment Visualization slice
    // ===================================================================

    // 24. Shape the persisted group into the canonical four-language
    //     visualization fixture (EN / DE / FR / ES) using the backend PATCH
    //     capability directly. This is TEST SETUP ONLY — it does not imply
    //     an add-member UI exists.
    const fixtureWorkspace = await request.get(
      `/api/v1/documents/${match?.[1]}/workspace`,
    );
    const fixtureBody = (await fixtureWorkspace.json()) as {
      text_versions: Array<{ id: string; label: string }>;
      alignment_groups: Array<{ id: string }>;
    };
    const versionIdByLabel = new Map(
      fixtureBody.text_versions.map((v) => [v.label, v.id]),
    );
    const groupId = fixtureBody.alignment_groups[0].id;
    // Offsets are Unicode code points (ADR-001); compute them from the
    // canonical content so the fixture stays exact.
    const frQuote = 'ai hâte de';
    const esQuote = 'Tengo ganas de';
    const frStart = codePointIndexOf(FR_TEXT, frQuote);
    const esStart = codePointIndexOf(ES_TEXT, esQuote);
    const fixturePatch = await request.patch(
      `/api/v1/alignments/${groupId}`,
      {
        data: {
          members: [
            { text_version_id: versionIdByLabel.get('English'), start: 2, end: 17 },
            { text_version_id: versionIdByLabel.get('German'), start: 4, end: 21 },
            { text_version_id: versionIdByLabel.get('French'), start: frStart, end: frStart + Array.from(frQuote).length },
            { text_version_id: versionIdByLabel.get('Spanish'), start: esStart, end: esStart + Array.from(esQuote).length },
          ],
        },
      },
    );
    expect(fixturePatch.ok()).toBeTruthy();
    const fixtureVerified = await request.get(
      `/api/v1/documents/${match?.[1]}/workspace`,
    );
    const fixtureVerifiedBody = (await fixtureVerified.json()) as {
      spans: Array<{ exact_text: string }>;
      alignment_groups: unknown[];
      alignment_members: unknown[];
    };
    expect(fixtureVerifiedBody.alignment_groups).toHaveLength(1);
    expect(fixtureVerifiedBody.alignment_members).toHaveLength(4);
    expect(
      fixtureVerifiedBody.spans.map((s) => s.exact_text).sort(),
    ).toEqual([
      'Tengo ganas de',
      'ai hâte de',
      'freue mich darauf',
      'look forward to',
    ]);

    // Reload: the four-language persisted group drives the visualization.
    await page.reload();
    await expect(page.locator('.text-panel')).toHaveCount(5);

    // enPanel/dePanel were declared in the M0.4 slice and stay valid; the
    // FR/ES panels get their locators here.
    const frPanel = page.locator('.text-panel', { hasText: FR_TEXT }).first();
    const esPanel = page.locator('.text-panel', { hasText: ES_TEXT }).first();
    const enAlignedRun = enPanel.locator('[data-run].run-aligned').first();
    const deAlignedRun = dePanel.locator('[data-run].run-aligned').first();
    const frAlignedRun = frPanel.locator('[data-run].run-aligned').first();
    const esAlignedRun = esPanel.locator('[data-run].run-aligned').first();
    const connectorLines = page.locator('.connector-overlay .connector-line');

    // 25. Idle visualization: persisted annotation indicators exist, no
    //     active connectors, Inspector closed.
    await expect(enAlignedRun).toBeVisible();
    await expect(deAlignedRun).toBeVisible();
    await expect(frAlignedRun).toBeVisible();
    await expect(esAlignedRun).toBeVisible();
    await expect(page.locator('.saved-alignment-member')).toHaveCount(4);
    await expect(connectorLines).toHaveCount(0);
    await expect(
      page.getByRole('region', { name: 'Alignment inspector' }),
    ).toHaveCount(0);

    // 26. Hover the EN member: all four counterparts highlight and the
    //     connector set appears.
    await enAlignedRun.hover();
    await expect(enAlignedRun).toHaveClass(/run-hovered/);
    await expect(deAlignedRun).toHaveClass(/run-hovered/);
    await expect(frAlignedRun).toHaveClass(/run-hovered/);
    await expect(esAlignedRun).toHaveClass(/run-hovered/);
    await expect(connectorLines).toHaveCount(4);

    // 27. Hover ends: temporary styling clears and the connectors disappear
    //     (no active alignment).
    await page
      .getByRole('heading', { name: /Workspace — Chapter 1/ })
      .hover();
    await expect(enAlignedRun).not.toHaveClass(/run-hovered/);
    await expect(deAlignedRun).not.toHaveClass(/run-hovered/);
    await expect(frAlignedRun).not.toHaveClass(/run-hovered/);
    await expect(esAlignedRun).not.toHaveClass(/run-hovered/);
    await expect(connectorLines).toHaveCount(0);

    // 28. Activate: click the EN member. Active styling persists after
    //     pointer leave, connectors persist, and the Inspector opens with
    //     exactly the four current members.
    await enAlignedRun.click();
    await page
      .getByRole('heading', { name: /Workspace — Chapter 1/ })
      .hover();
    await expect(enAlignedRun).toHaveClass(/run-active/);
    await expect(deAlignedRun).toHaveClass(/run-active/);
    await expect(frAlignedRun).toHaveClass(/run-active/);
    await expect(esAlignedRun).toHaveClass(/run-active/);
    await expect(connectorLines).toHaveCount(4);
    const inspector = page.getByRole('region', {
      name: 'Alignment inspector',
    });
    await expect(inspector).toBeVisible();
    await expect(inspector.locator('.inspector-member')).toHaveCount(4);
    await expect(inspector).toContainText('look forward to');
    await expect(inspector).toContainText('freue mich darauf');
    await expect(inspector).toContainText('ai hâte de');
    await expect(inspector).toContainText('Tengo ganas de');

    // 29. Edit the note: type + explicit Save, then verify the
    //     authoritative refresh surfaces it in the Inspector and the saved
    //     alignment list.
    const noteInput = page.getByLabel(/Note/);
    await noteInput.fill('Phrase-level correspondence');
    await page.getByRole('button', { name: 'Save note' }).click();
    await expect(noteInput).toHaveValue('Phrase-level correspondence');
    await expect(page.locator('.saved-alignment-note')).toContainText(
      'Phrase-level correspondence',
    );
    const notedSnapshot = await request.get(
      `/api/v1/documents/${match?.[1]}/workspace`,
    );
    const notedBody = (await notedSnapshot.json()) as {
      alignment_groups: Array<{ note: string | null }>;
    };
    expect(notedBody.alignment_groups[0].note).toBe('Phrase-level correspondence');

    // 30. Geometry invalidation via a real layout action: reorder the
    //     French panel. The active connectors must remain and re-anchor.
    await page
      .locator('.panel-slot', { hasText: FR_TEXT })
      .getByRole('button', { name: 'Move French right' })
      .click();
    await expect(connectorLines).toHaveCount(4);
    await expect(inspector).toBeVisible();

    // 31. Hide the French panel (member hidden): its connector disappears,
    //     the group stays active and the Inspector still lists ALL members.
    await page.getByRole('button', { name: 'Hide French panel' }).click();
    await expect(connectorLines).toHaveCount(3);
    await expect(inspector.locator('.inspector-member')).toHaveCount(4);
    await page.getByRole('button', { name: /Open French/ }).click();
    await expect(connectorLines).toHaveCount(4);

    // 32. Remove the FR member through the Inspector (explicit
    //     confirmation), then verify the authoritative refresh.
    await page
      .getByRole('button', { name: 'Remove member “ai hâte de”' })
      .click();
    await page.getByRole('button', { name: 'Confirm remove' }).click();
    await expect(inspector.locator('.inspector-member')).toHaveCount(3);
    await expect(inspector).not.toContainText('ai hâte de');
    await expect(frPanel.locator('[data-run].run-aligned')).toHaveCount(0);
    await expect(enAlignedRun).toHaveClass(/run-active/);
    await expect(deAlignedRun).toHaveClass(/run-active/);
    await expect(esAlignedRun).toHaveClass(/run-active/);
    const reducedSnapshot = await request.get(
      `/api/v1/documents/${match?.[1]}/workspace`,
    );
    const reducedBody = (await reducedSnapshot.json()) as {
      spans: Array<{ exact_text: string }>;
      alignment_groups: unknown[];
      alignment_members: unknown[];
    };
    expect(reducedBody.alignment_groups).toHaveLength(1);
    expect(reducedBody.alignment_members).toHaveLength(3);
    // The FR span is orphaned and cleaned up by the backend.
    expect(
      reducedBody.spans.map((s) => s.exact_text).sort(),
    ).toEqual(['Tengo ganas de', 'freue mich darauf', 'look forward to']);

    // 33. Reload: active state clears, Inspector closes, but the persisted
    //     domain changes (note, FR removal) survive and indicators remain.
    await page.reload();
    await expect(page.locator('.text-panel')).toHaveCount(5);
    await expect(
      page.getByRole('region', { name: 'Alignment inspector' }),
    ).toHaveCount(0);
    await expect(connectorLines).toHaveCount(0);
    await expect(page.locator('.saved-alignment-member')).toHaveCount(3);
    await expect(
      page.locator('.saved-alignment-note'),
    ).toContainText('Phrase-level correspondence');
    // The removed FR member is gone from the persisted representation.
    await expect(
      page.locator('.saved-alignment-member', { hasText: 'ai hâte de' }),
    ).toHaveCount(0);
    await expect(
      page.locator('.text-panel', { hasText: EN_TEXT }).first().locator('[data-run].run-aligned'),
    ).toBeVisible();

    // 34. Reactivate and delete the alignment with confirmation. After the
    //     authoritative refresh the group is gone: Inspector closed,
    //     connectors absent, active/hover cleared, indicators gone.
    await enAlignedRun.click();
    await expect(inspector).toBeVisible();
    await page.getByRole('button', { name: 'Delete Alignment' }).click();
    await page.getByRole('button', { name: 'Confirm delete' }).click();
    await expect(inspector).toHaveCount(0);
    await expect(connectorLines).toHaveCount(0);
    await expect(page.getByText('No saved alignments yet.')).toBeVisible();
    await expect(
      page.locator('.text-panel', { hasText: EN_TEXT }).first().locator('[data-run].run-aligned'),
    ).toHaveCount(0);
    await expect(
      page.locator('.text-panel', { hasText: DE_TEXT }).first().locator('[data-run].run-aligned'),
    ).toHaveCount(0);
    await expect(
      page.locator('.text-panel', { hasText: ES_TEXT }).first().locator('[data-run].run-aligned'),
    ).toHaveCount(0);

    const finalSnapshot = await request.get(
      `/api/v1/documents/${match?.[1]}/workspace`,
    );
    expect(finalSnapshot.ok()).toBeTruthy();
    const finalBody = (await finalSnapshot.json()) as {
      spans: unknown[];
      alignment_groups: unknown[];
      alignment_members: unknown[];
    };
    expect(finalBody.alignment_groups).toHaveLength(0);
    expect(finalBody.alignment_members).toHaveLength(0);
    // Orphan Span cleanup: every span of the deleted group is removed.
    expect(finalBody.spans).toHaveLength(0);
  });
});
