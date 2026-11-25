import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { languageDirection, languages } from '../src/i18n/languages';
import { readSeedManifest } from './seed-manifest';

const manifest = readSeedManifest();
const catalogDirectory = resolve(import.meta.dirname, '../src/i18n/locales');
const screenshots = process.env.I18N_SCREENSHOT_DIR;
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    { name: 'supporter-prompt-closed', value: 'true', url: baseURL! },
  ]);
});
function messages(code: string): Record<string, string> {
  return JSON.parse(
    readFileSync(resolve(catalogDirectory, `${code}.json`), 'utf8')
  );
}
for (const language of languages) {
  test(`interface language ${language.code} persists across navigation and reload`, async ({
    page,
  }) => {
    const dictionary = messages(language.code);
    await page.goto(`/${manifest.organizationId}/account`);
    await expect(page.getByRole('tab').first()).toBeVisible();
    const select = page
      .locator('select')
      .filter({ has: page.locator('option[value="zh-CN"]') });
    await expect(select.locator('option')).toHaveCount(30);
    await select.selectOption(language.code);
    await expect(page.locator('html')).toHaveAttribute('lang', language.code);
    await expect(page.locator('html')).toHaveAttribute(
      'dir',
      languageDirection(language.code)
    );
    await expect(
      page.getByRole('heading', {
        name: dictionary['Your account'],
        exact: true,
      })
    ).toBeVisible();
    await expect(select).toHaveValue(language.code);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', language.code);
    await expect(select).toHaveValue(language.code);
    await page
      .getByRole('tab', { name: dictionary['Email preferences'], exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('lang', language.code);
    await page
      .getByRole('tab', { name: dictionary.Profile, exact: true })
      .click();
    await expect(select).toHaveValue(language.code);
    if (
      screenshots &&
      ['en', 'ru', 'ar', 'hi', 'zh-CN'].includes(language.code)
    ) {
      mkdirSync(screenshots, { recursive: true });
      await select.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: resolve(screenshots, `language-${language.code}.png`),
        fullPage: false,
        animations: 'disabled',
        mask: [page.locator('input')],
        maskColor: '#dbe4ef',
      });
    }
  });
}
test('an invalid language cookie falls back to English without importing an arbitrary path', async ({
  page,
  context,
  baseURL,
}) => {
  await context.addCookies([
    { name: 'ui-language', value: '../../unknown', url: baseURL! },
  ]);
  await page.goto(`/${manifest.organizationId}/account`);
  await expect(page.getByRole('tab').first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { name: 'Your account', exact: true })
  ).toBeVisible();
});
test('a failed catalog request leaves the previous language selected', async ({
  page,
}) => {
  await page.goto(`/${manifest.organizationId}/account`);
  await expect(page.getByRole('tab').first()).toBeVisible();
  await page.route('**/assets/ru-*.js', (route) => route.abort());
  const select = page
    .locator('select')
    .filter({ has: page.locator('option[value="zh-CN"]') });
  await select.selectOption('ru');
  await expect(page.getByRole('alert')).toHaveText(
    'Could not load this language. Try again.'
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
