import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  expect(serious, serious.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
}

test('landing page has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /study from any tab/i })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test('login form has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/#auth');
  await expect(page.getByRole('tab', { name: 'Sign in' })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});

test('signup form has no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/#auth');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await expect(page.getByLabel('Full name')).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});
