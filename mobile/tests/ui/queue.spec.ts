import { test, expect } from '@playwright/test';
const status = { signedIn: true, spotify: true, claude: true, model: 'claude-test-fixture', count: 15, queueReview: false };
const track = (n: number) => ({ uri: 'spotify:track:' + String(n).padStart(22, '0'), title: 'Fixture song ' + n, artist: 'Fixture artist ' + n, image: '', url: 'https://open.spotify.com/track/' + String(n).padStart(22, '0') });
test('request adds one selection, reports acceptance and preserves native playback', async ({ page }) => {
 let writes = 0, selections = 0;
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const values: Record<string, unknown> = {
   '/api/status': status,
   '/api/playback': { device: { id: 'fixture-iphone', name: 'This iPhone', type: 'Smartphone', restricted: false }, playing: track(1), queue: [track(2), track(3)], isPlaying: true },
   '/api/models': { models: [{ id: 'claude-test-fixture', name: 'Test fixture' }] },
   '/api/select': { id: 'fixture-selection', tracks: [track(5), track(6)], requested: 15, unmatched: 1 },
   '/api/queue': { state: 'complete', accepted: 2, total: 2 }, '/api/settings': { saved: true },
  };
  if (path === '/api/select') selections++;
  if (path === '/api/queue') writes++;
  await route.fulfill({ json: values[path] ?? {} });
 });
 await page.goto('/'); await expect(page.getByText('Fixture song 1')).toBeVisible();
 await page.getByLabel('What do you want to hear?').fill('Classic rock hidden gems');
 await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
 await expect(page.getByRole('status')).toContainText('2 songs sent to Spotify of 15 requested');
 await expect(page.getByRole('status')).toContainText('You can close Queue Companion');
 expect(writes).toBe(1); expect(selections).toBe(1);
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.screenshot({ path: 'outputs/queue-' + test.info().project.name + '.png', fullPage: true });
});
test('uncertain write is not replayed and requires a queue review', async ({ page }) => {
 let writes = 0, locked = false;
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  let value: any = {};
  if (path === '/api/status') value = { ...status, queueReview: locked, queueBusy: false };
  if (path === '/api/playback') value = { device: { id: 'fixture', name: 'iPhone' }, playing: track(1), queue: [] };
  if (path === '/api/select') value = { id: 'uncertain-fixture', tracks: [track(2)], requested: 15 };
  if (path === '/api/queue') { writes++; locked = true; value = { state: 'uncertain', accepted: 0, total: 1, message: 'Check Spotify’s Queue before adding more songs.' }; }
  await route.fulfill({ json: value });
 });
 await page.goto('/'); await page.getByLabel('What do you want to hear?').fill('Soul music');
 await page.getByRole('button', { name: 'Add to queue', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('Check Spotify');
 await expect(page.getByRole('button', { name: 'Add to queue', exact: true })).toBeDisabled();
 await page.reload(); await expect(page.getByRole('button', { name: 'Add to queue', exact: true })).toBeDisabled(); expect(writes).toBe(1);
});
test('settings, install sheet and privacy sheet are accessible without saving keys in browser storage', async ({ page }) => {
 await page.route('**/api/**', route => route.fulfill({ json: { ...status, spotify: false, claude: false } }));
 await page.goto('/'); await page.getByRole('button', { name: 'Open account settings' }).click();
 await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
 await page.getByRole('button', { name: /Add to Home Screen/ }).click();
 await expect(page.getByRole('dialog')).toContainText('Open as Web App');
 await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button', { name: /Privacy and saved data/ }).click();
 await expect(page.getByRole('dialog')).toContainText('not sent to the model');
 await page.keyboard.press('Escape');
 await page.getByLabel('API key', { exact: true }).fill('FAKE_UI_KEY_DO_NOT_SEND');
 expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('FAKE_UI_KEY_DO_NOT_SEND');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.screenshot({ path: 'outputs/settings-' + test.info().project.name + '.png', fullPage: true });
});
