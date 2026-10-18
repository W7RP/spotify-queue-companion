import { defineConfig, devices } from '@playwright/test';
export default defineConfig({ testDir: './tests/ui', timeout: 20_000, use: { baseURL: 'http://127.0.0.1:5173', channel: 'msedge', headless: true }, projects: [
 { name: 'phone', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
 { name: 'small-phone', use: { viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true } },
 { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } }
] });
