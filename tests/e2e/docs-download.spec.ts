import { test, expect } from '@playwright/test';

test.describe('Documentation PDF Download', () => {
  test('Download PDF Guide triggers a PDF download', async ({ page }) => {
    // Navigate to Documentation and trigger the download
    await page.goto('/Documentation');

    const downloadPromise = page.waitForEvent('download', { timeout: 20000 });
    await page.getByRole('button', { name: 'Download PDF Guide' }).click();
    const download = await downloadPromise;

    const filename = download.suggestedFilename();
    expect(filename.toLowerCase()).toContain('.pdf');
  });
});
