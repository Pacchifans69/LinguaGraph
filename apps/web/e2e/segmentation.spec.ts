import { expect, test } from '@playwright/test';

test('M2 sentence segmentation persists, reloads, replaces, and deletes', async ({
  page,
  request,
}) => {
  const projectResponse = await request.post('/api/v1/projects', {
    data: { name: 'M2 Segmentation E2E' },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const project = (await projectResponse.json()) as { id: string };

  const documentResponse = await request.post(
    `/api/v1/projects/${project.id}/documents`,
    { data: { title: 'M2 Sentence Review' } },
  );
  expect(documentResponse.ok()).toBeTruthy();
  const document = (await documentResponse.json()) as { id: string };

  const versionResponse = await request.post(
    `/api/v1/documents/${document.id}/text-versions`,
    {
      data: {
        language_tag: 'en',
        label: 'M2 English',
        content: 'Hello. Again 🙂!',
      },
    },
  );
  expect(versionResponse.ok()).toBeTruthy();
  const version = (await versionResponse.json()) as {
    id: string;
    content_hash: string;
  };

  await page.goto(`/documents/${document.id}/workspace`);
  await page.getByRole('button', { name: 'Open M2 English' }).click();

  const panel = page.locator('.panel-slot', { hasText: 'M2 English' });
  const canonicalRoot = panel.locator('[data-text-content-root]');
  await expect(canonicalRoot).toHaveText('Hello. Again 🙂!');
  await expect(canonicalRoot.locator('button, input, select, textarea')).toHaveCount(0);

  await panel.getByRole('button', { name: 'Start manual' }).click();
  await expect(panel.getByText('Unsaved preview')).toBeVisible();
  await panel.getByLabel('Split at').fill('7');
  await panel.getByRole('button', { name: 'Split' }).click();
  await expect(panel.locator('.segmentation-row')).toHaveCount(2);
  await panel.getByRole('button', { name: 'Save segmentation' }).click();
  await expect(panel.getByText('Saved')).toBeVisible();

  let snapshotResponse = await request.get(
    `/api/v1/documents/${document.id}/workspace`,
  );
  let snapshot = (await snapshotResponse.json()) as {
    segmentation_layers: Array<{
      text_version_id: string;
      content_hash: string;
    }>;
    segments: Array<{
      ordinal: number;
      start_offset: number;
      end_offset: number;
      exact_text: string;
    }>;
  };
  expect(snapshot.segmentation_layers).toHaveLength(1);
  expect(snapshot.segmentation_layers[0]).toMatchObject({
    text_version_id: version.id,
    content_hash: version.content_hash,
  });
  expect(snapshot.segments).toEqual([
    expect.objectContaining({
      ordinal: 0,
      start_offset: 0,
      end_offset: 7,
      exact_text: 'Hello. ',
    }),
    expect.objectContaining({
      ordinal: 1,
      start_offset: 7,
      end_offset: 15,
      exact_text: 'Again 🙂!',
    }),
  ]);

  await page.reload();
  const reloadedPanel = page.locator('.panel-slot', { hasText: 'M2 English' });
  await expect(reloadedPanel.locator('.segmentation-row')).toHaveCount(2);
  await reloadedPanel
    .getByRole('button', { name: 'Merge previous' })
    .click();
  await reloadedPanel
    .getByRole('button', { name: 'Save segmentation' })
    .click();
  await expect(reloadedPanel.getByText('Saved')).toBeVisible();

  snapshotResponse = await request.get(
    `/api/v1/documents/${document.id}/workspace`,
  );
  snapshot = await snapshotResponse.json();
  expect(snapshot.segments).toEqual([
    expect.objectContaining({
      ordinal: 0,
      start_offset: 0,
      end_offset: 15,
      exact_text: 'Hello. Again 🙂!',
    }),
  ]);

  await reloadedPanel
    .getByRole('button', { name: 'Delete segmentation' })
    .click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toContainText('Alignment spans and groups are preserved');
  await dialog
    .getByRole('button', { name: 'Delete segmentation' })
    .click();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await expect(
    page.locator('.panel-slot', { hasText: 'M2 English' }).getByText('Not saved'),
  ).toBeVisible();
  snapshotResponse = await request.get(
    `/api/v1/documents/${document.id}/workspace`,
  );
  snapshot = await snapshotResponse.json();
  expect(snapshot.segmentation_layers).toEqual([]);
  expect(snapshot.segments).toEqual([]);
});
