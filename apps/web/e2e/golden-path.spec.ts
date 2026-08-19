/**
 * M0 golden path — M0.3 slice (this checkpoint stops AHEAD of selection).
 *
 * Executes ONLY the document-workspace portion of the golden path
 * (report section 51 / M0.3 execution contract):
 *
 *   1. create Project;
 *   2. create ParallelDocument;
 *   3. add EN / DE / FR / ES TextVersions (paste);
 *   4. open all four panels;
 *   5. verify hide/show/reorder and reload-preference behavior where
 *      practical;
 *   6. STOP.
 *
 * It deliberately does NOT select text, create an alignment, or touch any
 * M0.4/M0.5 surface.
 *
 * Assertions that look for version content are scoped to `.text-panel`:
 * `page.getByText()` also matches `<textarea>` values, which would otherwise
 * false-positive before the server round-trip settles.
 */

import { expect, test } from '@playwright/test';

const EN_TEXT = 'I look forward to seeing you tomorrow.';
const DE_TEXT = 'Ich freue mich darauf, dich morgen zu sehen.';
const FR_TEXT = 'J’ai hâte de te voir demain.';
const ES_TEXT = 'Tengo ganas de verte mañana.';

test.describe('M0 golden path (M0.3 slice)', () => {
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

    // 6. STOP — no text is selected and no alignment is created in M0.3.
    // Verify the workspace snapshot via the API is complete and consistent.
    const workspaceUrl = await page.evaluate(() => window.location.pathname);
    const match = /\/documents\/([^/]+)\/workspace/.exec(workspaceUrl);
    expect(match).not.toBeNull();
    const snapshot = await request.get(
      `/api/v1/documents/${match?.[1]}/workspace`,
    );
    expect(snapshot.ok()).toBeTruthy();
    const body = (await snapshot.json()) as {
      text_versions: Array<{ language_tag: string; label: string }>;
    };
    expect(body.text_versions.map((v) => v.language_tag).sort()).toEqual([
      'de',
      'en',
      'es',
      'fr',
    ]);
  });
});
