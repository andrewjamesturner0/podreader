import { test, expect } from '@playwright/test';

const MOBILE = { width: 390, height: 844 };
const uniqueUser = () => `mobile_${Date.now()}`;

test.describe('Mobile layout', () => {
  test.use({ viewport: MOBILE });

  test('login page has no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Sign In')).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(MOBILE.width);
  });

  test('main app renders as single pane with drill-down', async ({ page }) => {
    const username = uniqueUser();
    await page.goto('/');
    await page.getByText('Need an account? Register').click();
    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Password').fill('testpass123');
    await page.getByRole('button', { name: 'Register' }).click();

    // At root (feeds view): sidebar visible, back button absent, no horizontal scroll.
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.back-btn')).toHaveCount(0);
    const rootScroll = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(rootScroll).toBeLessThanOrEqual(MOBILE.width);

    // app should have is-mobile class
    await expect(page.locator('.app.is-mobile')).toHaveCount(1);
  });
});
