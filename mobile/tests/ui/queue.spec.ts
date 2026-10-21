import { test, expect } from '@playwright/test';
const status = { signedIn: true, spotify: true, claude: true, model: 'claude-test-fixture', count: 15, mode: 'append', review: true, queueReview: false };
const track = (n: number) => ({ uri: 'spotify:track:' + String(n).padStart(22, '0'), title: 'Fixture song ' + n, artist: 'Fixture artist ' + n, image: '', url: 'https://open.spotify.com/track/' + String(n).padStart(22, '0') });

test('accepted-but-empty playback stays saved with a warning and explicit recovery survives reload', async ({ page }) => {
 let writes = 0, generations = 0, recovered = false;
 const selection = { id: 'empty-playback-selection', tracks: [track(5), track(6)], requested: 2, mode: 'replace' };
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/select') { generations++; return route.fulfill({ json: selection }); }
  if (path === '/api/selection') return route.fulfill({ json: selection });
  if (path === '/api/queue') { writes++; return route.fulfill({ json: { state: 'unconfirmed', accepted: 2, total: 2, mode: 'replace', playbackConfirmed: false, sequenceConfirmed: false, message: 'Spotify accepted the command but did not confirm playback. Your songs are saved.' } }); }
  if (path === '/api/queue/restart') { writes++; recovered = true; return route.fulfill({ json: { state: 'complete', accepted: 2, total: 2, mode: 'replace', selectionId: 'recovered-selection', recoveryAttempt: true, playbackConfirmed: true, sequenceConfirmed: true, deviceName: 'iPhone' } }); }
  const values: Record<string, unknown> = {
   '/api/status': { ...status, mode: 'replace', review: false },
   '/api/playback': { device: { id: 'phone', name: 'iPhone' }, playing: recovered ? track(5) : null, queue: recovered ? [track(6)] : [] },
   '/api/receipt': { receipt: writes ? { ...selection, state: recovered ? 'complete' : 'unconfirmed', accepted: 2, total: 2, mode: 'replace', message: recovered ? undefined : 'Spotify accepted the command but did not confirm playback. Your songs are saved.' } : null },
  };
  await route.fulfill({ json: values[path] ?? {} });
 });
 await page.goto('/'); await page.getByLabel('What do you want to hear?').fill('Soul music');
 await page.getByRole('button', { name: 'Generate & play', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('did not confirm playback');
 await expect(page.getByRole('status')).toHaveCount(0);
 const review = page.getByRole('region', { name: 'Review selection' });
 await expect(review).toContainText('Fixture song 5'); await expect(review).not.toContainText('Nothing sent yet');
 await expect(review.getByRole('link', { name: 'Open first song in Spotify', exact: true })).toHaveAttribute('href', track(5).uri);
 await page.reload(); await expect(review).toContainText('Fixture song 6');
 expect(writes).toBe(1); expect(generations).toBe(1);
 await review.getByRole('button', { name: 'Continue selection', exact: true }).click();
 await expect(page.getByRole('status')).toContainText('Playing your selection on iPhone');
 expect(writes).toBe(2); expect(generations).toBe(1);
 expect(await page.evaluate(() => sessionStorage.getItem('qc-pending-selection'))).toBeNull();
});

test('delayed playback is confirmed automatically using reads only and clears the old warning', async ({ page }) => {
 let writes = 0, receiptReads = 0;
 const selection = { id: 'delayed-selection', tracks: [track(5), track(6)], requested: 2, mode: 'replace' };
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/select') return route.fulfill({ json: selection });
  if (path === '/api/selection') return route.fulfill({ json: selection });
  if (path === '/api/queue' || path === '/api/queue/restart') { writes++; return route.fulfill({ json: { ...selection, id: 'job', state: 'unconfirmed', accepted: 2, total: 2, message: 'Playback has not been confirmed.' } }); }
  if (path === '/api/receipt') { receiptReads++; return route.fulfill({ json: { receipt: writes ? { ...selection, id: 'job', state: receiptReads > 1 ? 'complete' : 'unconfirmed', accepted: 2, total: 2, playbackConfirmed: receiptReads > 1, message: receiptReads > 1 ? undefined : 'Playback has not been confirmed.', deviceName: 'iPhone' } : null } }); }
  const values: Record<string, unknown> = { '/api/status': { ...status, mode: 'replace', review: false }, '/api/playback': { device: { id: 'phone', name: 'iPhone' }, playing: writes ? track(5) : null, queue: writes ? [track(6)] : [] } };
  return route.fulfill({ json: values[path] ?? {} });
 });
 await page.goto('/'); await page.getByLabel('What do you want to hear?').fill('Soul'); await page.getByRole('button', { name: 'Generate & play', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('not been confirmed');
 await expect(page.getByRole('status')).toContainText('Playing your selection on iPhone', { timeout: 6000 });
 await expect(page.getByRole('alert')).toHaveCount(0); await expect(page.getByRole('region', { name: 'Review selection' })).toHaveCount(0);
 expect(writes).toBe(1); expect(await page.evaluate(() => sessionStorage.getItem('qc-pending-selection'))).toBeNull();
});

test('a durable automatic queue attempt opens the native queue and cannot be resent after reload', async ({ page }) => {
 let writes = 0;
 const selection = { id: 'queue-fallback-selection', tracks: [track(5), track(6)], requested: 2, mode: 'replace' };
 const receipt = { ...selection, id: 'fallback-job', state: 'unconfirmed', accepted: 2, total: 2, queueFallback: true, recoveryAttempt: true, message: 'Queue playback has not been confirmed.' };
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/queue' || path === '/api/queue/restart') { writes++; return route.fulfill({ json: receipt }); }
  const values: Record<string, unknown> = { '/api/status': { ...status, mode: 'replace', review: false }, '/api/playback': { device: { id: 'phone', name: 'iPhone' }, playing: null, queue: [track(5), track(6)] }, '/api/select': selection, '/api/selection': selection, '/api/receipt': { receipt: writes ? receipt : null } };
  return route.fulfill({ json: values[path] ?? {} });
 });
 await page.goto('/'); await page.getByLabel('What do you want to hear?').fill('Soul'); await page.getByRole('button', { name: 'Generate & play', exact: true }).click();
 const review = page.getByRole('region', { name: 'Review selection' });
 await expect(review.getByRole('link', { name: 'Open Spotify', exact: true })).toHaveAttribute('href', 'spotify://');
 await expect(review.getByRole('button', { name: 'Continue selection', exact: true })).toBeDisabled();
 await page.reload(); await expect(review.getByRole('button', { name: 'Continue selection', exact: true })).toBeDisabled(); expect(writes).toBe(1);
});

test('an interrupted queue response resumes its saved receipt without a second POST', async ({ page }) => {
 let writes = 0, reads = 0;
 const selection = { id: 'interrupted-selection', tracks: [track(5), track(6)], requested: 2, mode: 'replace' };
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/queue' || path === '/api/queue/restart') { writes++; return route.abort('failed'); }
  if (path === '/api/receipt') { reads++; return route.fulfill({ json: { receipt: writes ? { ...selection, id: 'background-job', state: reads > 1 ? 'complete' : 'rebuilding', accepted: reads > 1 ? 2 : 1, total: 2, playbackConfirmed: reads > 1, sequenceConfirmed: reads > 1, deviceName: 'iPhone' } : null } }); }
  const values: Record<string, unknown> = { '/api/status': { ...status, mode: 'replace', review: false }, '/api/playback': { device: { id: 'phone', name: 'iPhone' }, playing: writes ? track(5) : null, queue: writes ? [track(6)] : [] }, '/api/select': selection, '/api/selection': selection };
  return route.fulfill({ json: values[path] ?? {} });
 });
 await page.goto('/'); await page.getByLabel('What do you want to hear?').fill('Soul'); await page.getByRole('button', { name: 'Generate & play', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('connection was interrupted'); await expect(page.getByRole('button', { name: 'Checking saved request…' })).toBeDisabled();
 await expect(page.getByRole('status')).toContainText('Playing your selection on iPhone', { timeout: 9000 });
 await expect(page.getByRole('alert')).toHaveCount(0); expect(writes).toBe(1); expect(await page.evaluate(() => sessionStorage.getItem('qc-pending-selection'))).toBeNull();
});

test('default flow generates and starts a full selection on a paused device without a review click', async ({ page }) => {
 let writes = 0, submitted: any;
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/queue') { writes++; submitted = route.request().postDataJSON(); }
  const values: Record<string, unknown> = {
   '/api/status': { ...status, mode: 'replace', review: false },
   '/api/playback': { device: { id: 'paused-phone', name: 'iPhone', type: 'Smartphone' }, devices: [{ id: 'paused-phone', name: 'iPhone', type: 'Smartphone' }], playing: writes ? track(5) : null, queue: writes ? [track(6), track(7)] : [], isPlaying: !!writes },
   '/api/select': { id: 'fixture-selection', tracks: [track(5), track(6), track(7)], requested: 15, mode: 'replace' },
   '/api/queue': { state: 'complete', accepted: 3, total: 3, mode: 'replace', playbackConfirmed: true, sequenceConfirmed: true, deviceName: 'iPhone' },
  };
  await route.fulfill({ json: values[path] ?? {} });
 });
 await page.goto('/'); await page.getByLabel('What do you want to hear?').fill('Classic rock hidden gems');
 await page.getByRole('button', { name: 'Generate & play', exact: true }).click();
 await expect(page.getByRole('status')).toContainText('Playing your selection on iPhone');
 expect(writes).toBe(1); expect(submitted).toMatchObject({ mode: 'replace', device: 'paused-phone', keepUris: [track(5).uri, track(6).uri, track(7).uri] });
 await expect(page.getByRole('region', { name: 'Review selection' })).toHaveCount(0);
 await expect(page.getByRole('region', { name: 'Your last request' })).toContainText('3 of 3 accepted');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.screenshot({ path: 'outputs/play-now-' + test.info().project.name + '.png', fullPage: true });
});

test('songs generate without a device and remain available for sending after Spotify opens', async ({ page }) => {
 let generations = 0;
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/select') { generations++; return route.fulfill({ json: { id: 'offline-selection', mode: 'replace', tracks: [track(5)], requested: 15 } }); }
  if (path === '/api/queue') return route.fulfill({ status: 409, json: { error: 'Open Spotify on your iPhone. You do not need to start a song.', code: 'spotify_device' } });
  await route.fulfill({ json: path === '/api/status' ? { ...status, mode: 'replace', review: false } : { device: null, devices: [], queue: [] } });
 });
 await page.goto('/'); await page.getByLabel('What do you want to hear?').fill('Soul music');
 await page.getByRole('button', { name: 'Generate & play', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('do not need to start a song');
 await expect(page.getByRole('region', { name: 'Review selection' })).toContainText('Fixture song 5'); expect(generations).toBe(1);
 await expect(page.getByRole('button', { name: 'Continue selection', exact: true })).toBeEnabled();
});

test('a disconnected selection survives returning from Spotify without generating again', async ({ page }) => {
 let generations = 0, writes = 0, ready = false;
 const selection = { id: 'saved-selection', mode: 'replace', tracks: [track(5), track(6)], requested: 2 };
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/select') { generations++; return route.fulfill({ json: selection }); }
  if (path === '/api/selection') return route.fulfill({ json: selection });
  if (path === '/api/receipt') return route.fulfill({ json: { receipt: null } });
  if (path === '/api/queue') {
   if (!ready) return route.fulfill({ status: 404, json: { error: 'Spotify lost its connection.', code: 'spotify_device' } });
   writes++; expect(route.request().postDataJSON().keepUris).toEqual([track(5).uri]); return route.fulfill({ json: { state: 'complete', accepted: 1, total: 1, mode: 'replace', playbackConfirmed: true, sequenceConfirmed: true, deviceName: 'iPhone' } });
  }
  await route.fulfill({ json: path === '/api/status' ? { ...status, mode: 'replace', review: false } : { device: ready ? { id: 'fresh-phone', name: 'iPhone', type: 'Smartphone' } : null, devices: [], queue: [] } });
 });
 await page.goto('/'); await page.getByLabel('What do you want to hear?').fill('Soul music');
 await page.getByRole('button', { name: 'Generate & play', exact: true }).click();
 await expect(page.getByRole('link', { name: 'Open first song in Spotify', exact: true })).toHaveAttribute('href', track(5).uri);
 await page.getByRole('button', { name: 'Remove Fixture song 6 from selection', exact: true }).click();
 await page.reload();
 await expect(page.getByRole('region', { name: 'Review selection' })).not.toContainText('Fixture song 6');
 await expect(page.getByRole('region', { name: 'Review selection' })).toContainText('Fixture song 5');
 expect(generations).toBe(1); expect(writes).toBe(0);
 ready = true; await page.getByRole('button', { name: 'Continue selection', exact: true }).click();
 await expect(page.getByRole('status')).toContainText('Playing your selection on iPhone');
 expect(generations).toBe(1); expect(writes).toBe(1);
 expect(await page.evaluate(() => sessionStorage.getItem('qc-pending-selection'))).toBeNull();
});
test('request adds one selection, reports acceptance and preserves native playback', async ({ page }) => {
 let writes = 0, selections = 0, submitted: any;
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const values: Record<string, unknown> = {
   '/api/status': status,
   '/api/playback': { device: { id: 'fixture-iphone', name: 'This iPhone', type: 'Smartphone', restricted: false }, playing: track(1), queue: writes ? [track(2), track(3), track(5)] : [track(2), track(3)], isPlaying: true },
   '/api/models': { models: [{ id: 'claude-test-fixture', name: 'Test fixture' }] },
   '/api/select': { id: 'fixture-selection', tracks: [track(5), track(6), track(7)], requested: 15, unmatched: 1, deviceName: 'This iPhone' },
   '/api/queue': { state: 'complete', accepted: 2, total: 2 }, '/api/settings': { saved: true },
  };
  if (path === '/api/select') selections++;
  if (path === '/api/queue') { writes++; submitted = route.request().postDataJSON(); }
  await route.fulfill({ json: values[path] ?? {} });
 });
 await page.goto('/'); await expect(page.getByText('Fixture song 1')).toBeVisible();
 await page.getByLabel('What do you want to hear?').fill('Classic rock hidden gems');
 await page.getByRole('button', { name: 'Find songs', exact: true }).click();
 await expect(page.getByRole('region', { name: 'Review selection' })).toBeVisible(); expect(writes).toBe(0);
 await page.getByRole('button', { name: 'Remove Fixture song 6 from selection', exact: true }).click();
 await page.screenshot({ path: 'outputs/review-' + test.info().project.name + '.png', fullPage: true });
 await page.getByRole('button', { name: 'Append 2 songs to Spotify', exact: true }).click();
 await expect(page.getByRole('status')).toContainText('Spotify accepted 2 songs');
 await expect(page.getByRole('status')).toContainText('You can close Queue Companion');
 expect(writes).toBe(1); expect(selections).toBe(1);
 expect(submitted).toMatchObject({ mode: 'append', keepUris: [track(5).uri, track(7).uri] });
 await expect(page.getByRole('region', { name: 'Your last request' })).toContainText('Visible in queue');
 await expect(page.getByRole('region', { name: 'Your last request' }).getByText('Accepted', { exact: true })).toBeVisible();
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
 await page.getByRole('button', { name: 'Find songs', exact: true }).click();
 await page.getByRole('button', { name: 'Append 1 song to Spotify', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('Check Spotify');
 await expect(page.getByRole('button', { name: 'Find songs', exact: true })).toBeDisabled();
 await page.reload(); await expect(page.getByRole('button', { name: 'Find songs', exact: true })).toBeDisabled(); expect(writes).toBe(1);
});
test('settings, install sheet and privacy sheet are accessible without saving keys in browser storage', async ({ page }) => {
 await page.route('**/api/**', route => route.fulfill({ json: { ...status, spotify: false, claude: false } }));
 await page.goto('/'); await page.getByRole('button', { name: 'Open account settings' }).click();
 await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
 await expect(page.getByText('ChatGPT · PC not paired', { exact: true })).toBeVisible();
 await expect(page.getByLabel('API key', { exact: true })).toHaveCount(0);
 await expect(page.getByRole('link', { name: 'Connect', exact: true })).toHaveAttribute('target', '_top');
 await page.getByRole('button', { name: /Add to Home Screen/ }).click();
 await expect(page.getByRole('dialog')).toContainText('Open as Web App');
 await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button', { name: /Privacy and saved data/ }).click();
 await expect(page.getByRole('dialog')).toContainText('not sent to the model');
 await page.keyboard.press('Escape');
 await page.getByLabel('Music source', { exact: true }).selectOption('claude');
 await page.getByLabel('API key', { exact: true }).fill('FAKE_UI_KEY_DO_NOT_SEND');
 expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain('FAKE_UI_KEY_DO_NOT_SEND');
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.screenshot({ path: 'outputs/settings-' + test.info().project.name + '.png', fullPage: true });
});

test('clearing a reviewed selection and opening native queue help never writes to Spotify', async ({ page }) => {
 let writes = 0;
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/queue') writes++;
  const values: Record<string, unknown> = { '/api/status': status, '/api/playback': { device: { id: 'fixture', name: 'iPhone' }, playing: track(1), queue: [] }, '/api/select': { id: 'review-fixture', tracks: [track(2)], requested: 15 } };
  await route.fulfill({ json: values[path] ?? {} });
 });
 await page.goto('/'); await page.getByLabel('What do you want to hear?').fill('Soul music');
 await page.getByRole('button', { name: 'Find songs', exact: true }).click();
 await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
 await expect(page.getByRole('region', { name: 'Review selection' })).toHaveCount(0);
 await expect(page.getByRole('status')).toContainText('No songs were sent');
 await page.getByRole('button', { name: 'Queue controls', exact: true }).click();
 await expect(page.getByRole('dialog')).toContainText('Spotify’s public API does not provide'); expect(writes).toBe(0);
});

test('an offline PC is shown as a selection failure with no append or Claude fallback', async ({ page }) => {
 let writes = 0;
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/queue') writes++;
  if (path === '/api/select') return route.fulfill({ status: 409, json: { error: 'Your PC is offline. Nothing was sent to Spotify.', code: 'pc_offline' } });
  await route.fulfill({ json: path === '/api/status' ? { ...status, chatgpt: false, provider: 'chatgpt', pc: { paired: true, online: false, connected: false } } : { device: { id: 'fixture', name: 'iPhone' }, queue: [] } });
 });
 await page.goto('/'); await page.getByLabel('What do you want to hear?').fill('Soul music');
 await page.getByRole('button', { name: 'Find songs', exact: true }).click();
 await expect(page.getByRole('alert')).toContainText('Nothing was sent to Spotify'); expect(writes).toBe(0);
});

test('a connected PC exposes ChatGPT models and keeps the Claude key form hidden', async ({ page }) => {
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  const value = path === '/api/status' ? { ...status, chatgpt: true, provider: 'chatgpt', pc: { paired: true, online: true, connected: true } } : path === '/api/models' ? { models: [{ id: 'fixture-luna', name: 'Fixture ChatGPT model' }] } : { device: null, queue: [] };
  await route.fulfill({ json: value });
 });
 await page.goto('/'); await page.getByRole('button', { name: 'Open account settings' }).click();
 await expect(page.getByRole('heading', { name: 'ChatGPT · Connected through your PC', exact: true })).toBeVisible();
 await expect(page.getByLabel('API key', { exact: true })).toHaveCount(0);
 await expect(page.getByRole('option', { name: 'Fixture ChatGPT model', exact: true })).toBeAttached();
 await expect(page.getByText('Once songs are added, Spotify keeps playing on your phone. You can close this page.')).toBeVisible();
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
 await page.screenshot({ path: 'outputs/pc-settings-' + test.info().project.name + '.png', fullPage: true });
});

test('callback errors explain browser-session loss without displaying URL data', async ({ page }) => {
 await page.route('**/api/**', route => route.fulfill({ json: { ...status, spotify: false, claude: false } }));
 await page.goto('/?connection=failed&reason=browser_session&code=FAKE_CALLBACK_SECRET');
 await expect(page.getByRole('alert')).toContainText('directly in Safari');
 await expect(page).toHaveURL('http://127.0.0.1:5173/');
 await expect(page.locator('body')).not.toContainText('FAKE_CALLBACK_SECRET');
});

test('reopening restores a receipt without replaying writes, and erasure removes local receipt state', async ({ page }) => {
 let writes = 0, erased = false;
 await page.addInitScript(() => { if (!sessionStorage.getItem('fixture-initialized')) { sessionStorage.setItem('qc-last-selection', 'receipt-fixture'); sessionStorage.setItem('fixture-initialized', 'yes'); } });
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname;
  if (path === '/api/queue') writes++;
  if (path === '/api/erase') erased = true;
  const values: Record<string, unknown> = {
   '/api/status': { ...status, spotify: !erased, claude: !erased },
   '/api/playback': { device: { id: 'fixture', name: 'iPhone' }, playing: track(1), queue: [track(2)] },
   '/api/receipt': { receipt: { state: 'complete', accepted: 1, total: 1, tracks: [track(2)], deviceName: 'iPhone' } },
   '/api/models': { models: [] },
  };
  await route.fulfill({ json: values[path] ?? {} });
 });
 await page.goto('/'); await expect(page.getByRole('region', { name: 'Your last request' })).toContainText('Visible in queue');
 await page.reload(); await expect(page.getByRole('region', { name: 'Your last request' })).toBeVisible(); expect(writes).toBe(0);
 await page.getByRole('button', { name: 'Open account settings' }).click();
 await page.getByRole('button', { name: /Privacy and saved data/ }).click();
 page.once('dialog', dialog => dialog.accept()); await page.getByRole('button', { name: 'Remove my saved data' }).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 expect(await page.evaluate(() => sessionStorage.getItem('qc-last-selection'))).toBeNull();
 await page.getByRole('button', { name: 'Queue', exact: true }).click();
 await expect(page.getByRole('region', { name: 'Your last request' })).toHaveCount(0); expect(writes).toBe(0);
});
