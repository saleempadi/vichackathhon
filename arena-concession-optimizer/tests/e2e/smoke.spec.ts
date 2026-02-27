import { test, expect } from '@playwright/test';

const routes = [
  { path: '/', name: 'Overview' },
  { path: '/locations', name: 'Locations' },
  { path: '/gameday', name: 'Game Day' },
  { path: '/predictions', name: 'Predictions' },
  { path: '/insights', name: 'Insights' },
  { path: '/fan', name: 'Fan' },
];

for (const route of routes) {
  test(`${route.name} (${route.path}) loads without errors`, async ({ page }) => {
    const crashes: string[] = [];

    // Catch uncaught exceptions (actual crashes)
    page.on('pageerror', (err) => {
      crashes.push(err.message);
    });

    const response = await page.goto(route.path, { waitUntil: 'networkidle' });

    // HTTP status should be OK
    expect(response?.status()).toBeLessThan(400);

    // No uncaught JavaScript exceptions
    expect(crashes, `Page crashed on ${route.path}: ${crashes.join('; ')}`).toHaveLength(0);

    // Page has meaningful content (not a blank error page)
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.length).toBeGreaterThan(10);
  });
}
