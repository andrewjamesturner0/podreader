import { test, expect } from '@playwright/test';

const uniqueUser = () => `feedtest_${Date.now()}`;

async function registerAndLogin(page: import('@playwright/test').Page) {
  const username = uniqueUser();
  await page.goto('/');
  await page.getByText('Need an account? Register').click();
  await page.getByPlaceholder('Username').fill(username);
  await page.getByPlaceholder('Password').fill('testpass123');
  await page.getByRole('button', { name: 'Register' }).click();
  await expect(page.locator('.sidebar-header')).toBeVisible({ timeout: 5000 });
}

test.describe('Feed Management', () => {
  test('subscribe to a feed and see episodes', async ({ page }) => {
    await registerAndLogin(page);

    // Subscribe to a public test feed
    const feedUrl = 'https://www.relay.fm/cortex/feed'; // The Changelog
    await page.getByPlaceholder('Paste RSS feed URL...').fill(feedUrl);
    await page.getByRole('button', { name: 'Add' }).click();

    // Wait for feed to appear in sidebar (loading may take a moment)
    await expect(page.locator('.feed-item:not(.virtual-feed-item)').first()).toBeVisible({ timeout: 30000 });

    // Episodes should be visible
    await expect(page.locator('.episode-card').first()).toBeVisible({ timeout: 10000 });
  });

  test('unsubscribe from a feed', async ({ page }) => {
    await registerAndLogin(page);

    // Subscribe first
    const feedUrl = 'https://www.relay.fm/cortex/feed';
    await page.getByPlaceholder('Paste RSS feed URL...').fill(feedUrl);
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('.feed-item:not(.virtual-feed-item)').first()).toBeVisible({ timeout: 30000 });

    // Hover over the feed to reveal the remove button
    const feedItem = page.locator('.feed-item:not(.virtual-feed-item)').first();
    await feedItem.hover();
    await feedItem.locator('.remove-btn').click();

    // Feed should be removed (only virtual feeds remain)
    await expect(page.locator('.feed-item:not(.virtual-feed-item)')).toHaveCount(0, { timeout: 5000 });
  });

  test('episode search filters results', async ({ page }) => {
    await registerAndLogin(page);

    // Subscribe to a feed
    const feedUrl = 'https://www.relay.fm/cortex/feed';
    await page.getByPlaceholder('Paste RSS feed URL...').fill(feedUrl);
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('.episode-card').first()).toBeVisible({ timeout: 30000 });

    // Type in search
    const searchInput = page.getByPlaceholder('Search episodes...');
    await searchInput.fill('xyznonexistent');

    // Should show no matching episodes message
    await expect(page.getByText('No episodes match your search.')).toBeVisible();
  });
});
