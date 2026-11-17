const { test, expect } = require('@playwright/test');
const key = 'gymtracker-v1';
async function approve(page, day) {
  const form = page.locator('#day');
  await form.locator('..').locator('summary').click();
  await form.locator('[name=date]').fill(`2026-11-${String(day).padStart(2, '0')}`);
  if (await form.locator('[name=iron]').count()) await form.locator('[name=iron]').check();
  await form.locator('[name=cardio]').check();
  await form.getByRole('button').click();
}
async function state(page) { return page.evaluate(k => JSON.parse(localStorage.getItem(k)), key); }
test.beforeEach(async ({ page }) => { await page.goto('/'); });
test('preserves artwork and fits the mobile viewport', async ({ page }) => {
  expect(await page.locator('header').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('data:image/jpeg;base64,');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#day').locator('..').locator('summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('validates days, saves extra cardio, locks history and opens successive weeks', async ({ page }) => {
  await page.locator('#day').locator('..').locator('summary').click();
  await page.locator('#day button').click();
  expect(await state(page)).toBeNull();
  await page.locator('#day').locator('..').locator('summary').click();
  await page.locator('#extra').locator('..').locator('summary').click();
  await page.locator('#extra [name=minutes]').fill('20');
  await page.locator('#extra button').click();
  expect((await state(page)).weeks[0].days.every(d => d === null)).toBe(true);
  for (let day = 1; day <= 14; day++) {
    await approve(page, day);
    if (day === 1) {
      await page.reload();
      expect((await state(page)).weeks[0].days[0].date).toBe('2026-11-01');
      const form = page.locator('#day');
      await form.locator('..').locator('summary').click();
      await form.locator('[name=date]').fill('2026-11-01');
      await form.locator('[name=iron]').check();
      await form.locator('[name=cardio]').check();
      page.once('dialog', d => d.accept());
      await form.getByRole('button').click();
      expect((await state(page)).weeks[0].days[1]).toBeNull();
      await form.locator('..').locator('summary').click();
    }
  }
  await page.reload();
  const saved = await state(page);
  expect(saved.weeks).toHaveLength(3);
  expect(saved.weeks[0].extra[0].minutes).toBe(20);
  for (const w of saved.weeks.slice(0, 2)) {
    expect(w.days.filter(d => d.iron)).toHaveLength(5);
    expect(w.days.every(Boolean)).toBe(true);
  }
  expect(saved.weeks[2].days.every(d => d === null)).toBe(true);
  await expect(page.getByRole('heading', { name: 'الأسبوع 3', exact: true })).toBeVisible();
  expect(await page.locator('form').count()).toBe(2);
});
test('failed storage keeps the form and does not approve the day', async ({ page }) => {
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Quota', 'QuotaExceededError'); }; });
  page.once('dialog', d => d.accept());
  await approve(page, 1);
  await expect(page.getByRole('status')).toContainText('تعذر');
  await expect(page.locator('#day [name=date]')).toHaveValue('2026-11-01');
  expect(await state(page)).toBeNull();
});
test('loads existing v1 records without migrating or losing them', async ({ page }) => {
  await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ weeks: [{ days: [{ date: '2026-10-01', type: 'المشي العادي', minutes: 30, iron: true }, null, null, null, null, null, null], extra: [] }] })), key);
  await page.reload();
  await expect(page.locator('progress')).toHaveAttribute('value', '1');
  await approve(page, 2);
  expect((await state(page)).weeks[0].days[0].minutes).toBe(30);
});
test('failed final-day save does not close the week and can be retried', async ({ page }) => {
  for (let day = 1; day <= 6; day++) await approve(page, day);
  await page.evaluate(() => { window.originalSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('full'); }; });
  page.once('dialog', d => d.accept());
  await approve(page, 7);
  expect((await state(page)).weeks).toHaveLength(1);
  expect((await state(page)).weeks[0].days[6]).toBeNull();
  await page.evaluate(() => { Storage.prototype.setItem = window.originalSetItem; });
  await page.locator('#day button').click();
  expect((await state(page)).weeks).toHaveLength(2);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'الأسبوع 2', exact: true })).toBeVisible();
});
