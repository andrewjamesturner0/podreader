import { test, expect } from '@playwright/test';

const uniqueUser = () => `pipeline_${Date.now()}`;

test.describe('Full Pipeline', () => {
  test('register -> subscribe -> select episode -> view summary pane', async ({ page }) => {
    const username = uniqueUser();

    // Register
    await page.goto('/');
    await page.getByText('Need an account? Register').click();
    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Password').fill('testpass123');
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.locator('.sidebar-header')).toBeVisible({ timeout: 5000 });

    // Subscribe to a feed
    const feedUrl = 'https://www.relay.fm/cortex/feed';
    await page.getByPlaceholder('Paste RSS feed URL...').fill(feedUrl);
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('.episode-card').first()).toBeVisible({ timeout: 30000 });

    // Select the first episode
    await page.locator('.episode-card').first().click();

    // Summary pane should show the episode title and action buttons
    await expect(page.locator('.summary-view-body h2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transcribe & Summarise' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Transcribe Only' })).toBeVisible();

    // We don't actually run transcription/summarisation in E2E tests
    // (would require API keys and take minutes) — just verify the UI is wired up
  });

  test('virtual feed "Most Recent" shows all episodes', async ({ page }) => {
    const username = uniqueUser();

    // Register
    await page.goto('/');
    await page.getByText('Need an account? Register').click();
    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Password').fill('testpass123');
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.locator('.sidebar-header')).toBeVisible({ timeout: 5000 });

    // Subscribe to a feed
    await page.getByPlaceholder('Paste RSS feed URL...').fill('https://www.relay.fm/cortex/feed');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('.episode-card').first()).toBeVisible({ timeout: 30000 });

    // Click "Most Recent" virtual feed
    await page.getByText('Most Recent').click();
    await expect(page.getByText('Most Recent Episodes')).toBeVisible();
    await expect(page.locator('.episode-card').first()).toBeVisible({ timeout: 5000 });
  });
});
