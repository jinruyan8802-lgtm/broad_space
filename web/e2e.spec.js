const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';

test.describe('BroadSpace Next.js End-to-End', () => {
  test('Feed page loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(BASE_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Verify page structure
    const heading = await page.locator('h1').first().textContent();
    expect(heading).toContain('Feed');

    // Verify NavBar is present
    const nav = await page.locator('nav').count();
    expect(nav).toBeGreaterThan(0);

    console.log('Feed page heading:', heading);
    console.log('Console errors:', errors.length === 0 ? 'NONE' : errors);
    expect(errors).toHaveLength(0);
  });

  test('Graph page loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(`${BASE_URL}/graph`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // Verify page structure
    const heading = await page.locator('h1').first().textContent();
    expect(heading).toContain('Knowledge Graph');

    // Verify search input exists
    const input = await page.locator('input[type="text"]').count();
    expect(input).toBeGreaterThan(0);

    // Verify NavBar is present
    const nav = await page.locator('nav').count();
    expect(nav).toBeGreaterThan(0);

    console.log('Graph page heading:', heading);
    console.log('Console errors:', errors.length === 0 ? 'NONE' : errors);
    expect(errors).toHaveLength(0);
  });

  test('Navigation between Feed and Graph works', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Click Graph link
    await page.locator('nav a[href="/graph"]').click();
    await page.waitForTimeout(2000);

    // Should be on graph page
    const graphHeading = await page.locator('h1').first().textContent();
    expect(graphHeading).toContain('Knowledge Graph');

    // Click Feed link
    await page.locator('nav a[href="/"]').click();
    await page.waitForTimeout(2000);

    // Should be back on feed page
    const feedHeading = await page.locator('h1').first().textContent();
    expect(feedHeading).toContain('Feed');
  });
});