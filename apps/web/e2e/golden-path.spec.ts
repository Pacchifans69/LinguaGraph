/**
 * M0 golden path — M0.3 + M0.4 slices (this checkpoint stops AHEAD of
 * alignment persistence).
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
 *   8. native Range selection in the EN panel -> canonical quote/offsets;
 *   9. explicit Add to Alignment -> pending tray;
 *  10. stage members from DE and the Unicode version;
 *  11. verify both/three pending members; remove one; re-add it;
 *  12. duplicate + same-version overlap staging rejection;
 *  13. clear tray;
 *  14. reload: panel preferences persist, the pending tray does not;
 *  15. query the workspace snapshot: M0.4 staging persisted NOTHING
 *      (spans == [], alignment_groups == [], alignment_members == []);
 *  16. STOP before any alignment persistence.
 *
 * It deliberately does NOT create an alignment or touch any M0.5/M0.6
 * surface.
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

test.describe('M0 golden path (M0.3 + M0.4 slices)', () => {
  test('creates a project/document/versions and manages text panels', async ({
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

    // 18. STOP — the E2E flow ends before any alignment persistence.
  });
});
