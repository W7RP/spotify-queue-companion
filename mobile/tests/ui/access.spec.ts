import { test, expect } from '@playwright/test';

test('real server denies anonymous private APIs and cross-origin writes', async ({ request }) => {
  for (const path of ['status', 'playback', 'requests', 'models', 'receipt?selection=someone-elses-id', 'spotify/start']) {
    const result = await request.get('/api/' + path, { maxRedirects: 0 });
    expect(result.status()).toBe(401);
    expect(result.headers()['cache-control']).toContain('no-store');
    expect(await result.json()).toMatchObject({ code: 'sign_in' });
  }
  const denied = await request.post('/api/queue', { headers: { Origin: 'https://untrusted.example' }, data: { selection: 'unknown' } });
  expect(denied.status()).toBe(403);
});
