import { expect, test } from '@playwright/test';

test('M3 token review binds to sentences, persists, blocks basis mutation, and deletes explicitly', async ({ page, request }) => {
  const project = await (await request.post('/api/v1/projects', { data: { name: 'M3 Token E2E' } })).json() as { id: string };
  const document = await (await request.post(`/api/v1/projects/${project.id}/documents`, { data: { title: 'M3 Token Review' } })).json() as { id: string };
  const version = await (await request.post(`/api/v1/documents/${document.id}/text-versions`, {
    data: { language_tag: 'en', label: 'M3 English', content: 'Hi 🙂. Bye!' },
  })).json() as { id: string; content_hash: string };
  const sentenceResponse = await request.put(`/api/v1/text-versions/${version.id}/segmentations/sentence`, {
    data: {
      content_hash: version.content_hash,
      requested_locale: 'en',
      resolved_locale: 'en',
      origin: 'manual',
      segments: [{ start: 0, end: 6 }, { start: 6, end: 10 }],
    },
  });
  expect(sentenceResponse.ok()).toBeTruthy();
  const sentence = await sentenceResponse.json() as { layer: { id: string } };

  await page.goto(`/documents/${document.id}/workspace`);
  await page.getByRole('button', { name: 'Open M3 English' }).click();
  await page.getByRole('tab', { name: 'Token' }).click();
  const tokens = page.getByRole('tabpanel', { name: 'token task' }).locator('.token-segmentation-panel');
  await expect(tokens).toContainText(sentence.layer.id.slice(0, 8));
  await tokens.getByRole('button', { name: 'Generate word suggestion' }).click();
  await expect(tokens.locator('.segmentation-row')).not.toHaveCount(0);
  await expect(tokens.locator('.token-preview', { hasText: '🙂' })).toBeVisible();

  await tokens.getByRole('button', { name: 'Start manual' }).click();
  await expect(tokens.locator('.segmentation-row')).toHaveCount(2);
  await tokens.getByLabel('Split at').first().fill('2');
  await tokens.getByRole('button', { name: 'Split' }).first().click();
  await expect(tokens.locator('.segmentation-row')).toHaveCount(3);
  await tokens.getByRole('button', { name: 'Merge previous' }).first().click();
  await expect(tokens.locator('.segmentation-row')).toHaveCount(2);
  await tokens.getByLabel('Word-like').first().uncheck();
  await tokens.getByRole('button', { name: 'Save tokens' }).click();
  await expect(tokens.getByText('Saved')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Token' }).click();
  const reloaded = page.getByRole('tabpanel', { name: 'token task' }).locator('.token-segmentation-panel');
  await expect(reloaded.locator('.segmentation-row')).toHaveCount(2);
  await expect(reloaded.getByLabel('Word-like').first()).not.toBeChecked();

  const blocked = await request.put(`/api/v1/text-versions/${version.id}/segmentations/sentence`, {
    data: {
      content_hash: version.content_hash,
      requested_locale: 'en',
      resolved_locale: 'en',
      origin: 'manual',
      segments: [{ start: 0, end: 10 }],
    },
  });
  expect(blocked.status()).toBe(409);
  expect((await blocked.json()).code).toBe('SEGMENTATION_HAS_DEPENDENTS');

  await reloaded.getByRole('button', { name: 'Delete tokens' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete tokens' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  const replaced = await request.put(`/api/v1/text-versions/${version.id}/segmentations/sentence`, {
    data: {
      content_hash: version.content_hash,
      requested_locale: 'en',
      resolved_locale: 'en',
      origin: 'manual',
      segments: [{ start: 0, end: 10 }],
    },
  });
  expect(replaced.ok()).toBeTruthy();
});
