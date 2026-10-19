import { test, expect } from '@playwright/test';

test('a real anonymous visitor sees sign-in and an actionable Spotify connection', async ({ page }) => {
  await page.goto('/');
  const onboarding = page.getByRole('region', { name: 'Sign in to Queue Companion', exact: true });
  await expect(onboarding).toBeVisible();
  await expect(onboarding).toContainText('you can use Claude API');
  await expect(onboarding.getByRole('link')).toHaveAttribute('target', '_top');
  await page.getByRole('button', { name: 'Open account settings' }).click();
  const connect = page.getByRole('link', { name: 'Connect', exact: true });
  await expect(connect).not.toHaveClass(/disabled/);
  await expect(connect).toHaveAttribute('href', '/signin-with-chatgpt?return_to=%2Fapi%2Fspotify%2Fstart');
  await expect(connect).toHaveAttribute('target', '_top');
  await expect(page.getByLabel('Music source', { exact: true })).toBeEnabled();
  await page.getByLabel('Music source', { exact: true }).selectOption('claude');
  await expect(page.getByLabel('API key', { exact: true })).toBeDisabled();
  await expect(page.getByText('Sign in above to connect your key.', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'outputs/public-onboarding-' + test.info().project.name + '.png', fullPage: true });
});

test('a source chosen before sign-in survives reload and saves once authentication finishes', async ({ page }) => {
  let authenticated = false;
  const saved: any[] = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!authenticated) return route.fulfill({ status: 401, json: { code: 'sign_in', error: 'Sign in first.' } });
    if (path === '/api/settings') { saved.push(route.request().postDataJSON()); return route.fulfill({ json: { saved: true } }); }
    return route.fulfill({ json: path === '/api/status' ? { signedIn: true, spotify: false, claude: false, provider: 'chatgpt', count: 15, model: '', mode: 'replace', review: false } : { models: [] } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open account settings' }).click();
  await page.getByLabel('Music source', { exact: true }).selectOption('claude');
  await page.reload();
  await page.getByRole('button', { name: 'Open account settings' }).click();
  await expect(page.getByLabel('Music source', { exact: true })).toHaveValue('claude');
  expect(saved).toEqual([]);
  authenticated = true;
  await page.reload();
  await page.getByRole('button', { name: 'Open account settings' }).click();
  await expect(page.getByLabel('Music source', { exact: true })).toHaveValue('claude');
  await expect(page.getByLabel('API key', { exact: true })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Connect', exact: true })).toHaveAttribute('href', '/api/spotify/start');
  expect(saved).toEqual([{ count: 15, model: '', provider: 'claude', mode: 'replace', review: false }]);
  expect(await page.evaluate(() => sessionStorage.getItem('qc-source-draft'))).toBeNull();
  await expect(page.getByRole('region', { name: 'Sign in to Queue Companion', exact: true })).toHaveCount(0);
});
