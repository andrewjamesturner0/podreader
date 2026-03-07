import { test, expect } from '@playwright/test';

const uniqueUser = () => `testuser_${Date.now()}`;

test.describe('Authentication', () => {
  test('register a new account', async ({ page }) => {
    const username = uniqueUser();
    await page.goto('/');
    await expect(page.getByText('Sign In')).toBeVisible();

    // Switch to register
    await page.getByText('Need an account? Register').click();
    await expect(page.getByText('Create Account')).toBeVisible();

    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Password').fill('testpass123');
    await page.getByRole('button', { name: 'Register' }).click();

    // Should land on the main app (feed manager visible)
    await expect(page.locator('.sidebar-header')).toBeVisible({ timeout: 5000 });
  });

  test('logout and login again', async ({ page }) => {
    const username = uniqueUser();
    await page.goto('/');

    // Register first
    await page.getByText('Need an account? Register').click();
    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Password').fill('testpass123');
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.locator('.sidebar-header')).toBeVisible({ timeout: 5000 });

    // Logout
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByText('Sign In')).toBeVisible({ timeout: 5000 });

    // Login with same credentials
    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Password').fill('testpass123');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.locator('.sidebar-header')).toBeVisible({ timeout: 5000 });
  });

  test('session persists across page reload', async ({ page }) => {
    const username = uniqueUser();
    await page.goto('/');

    // Register
    await page.getByText('Need an account? Register').click();
    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Password').fill('testpass123');
    await page.getByRole('button', { name: 'Register' }).click();
    await expect(page.locator('.sidebar-header')).toBeVisible({ timeout: 5000 });

    // Reload page
    await page.reload();
    // Should still be logged in
    await expect(page.locator('.sidebar-header')).toBeVisible({ timeout: 5000 });
  });

  test('rejects invalid login', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('Username').fill('nonexistent');
    await page.getByPlaceholder('Password').fill('wrongpassword');
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page.getByText('Invalid credentials')).toBeVisible({ timeout: 5000 });
  });
});
