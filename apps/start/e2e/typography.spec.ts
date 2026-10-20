// The dashboard's type defaults: Inter, 13px body text with a readable line
// height. A custom scale once set every line-height equal to its font size,
// which is what this guards against.

import { expect, test } from './fixtures';

const BODY_FONT_SIZE = '13px';
const BODY_LINE_HEIGHT = '20px';
const CAPTION_FONT_SIZE = '12px';
const CAPTION_LINE_HEIGHT = '16px';

test('text renders in Inter at 13px with a 20px line height', async ({
  page,
  seed,
}) => {
  await page.goto(`/${seed.organizationId}/${seed.projects[0]?.id}/settings`);
  await expect(
    page.getByRole('heading', { name: 'Project settings' })
  ).toBeVisible();

  const body = await page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return {
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      interLoaded: document.fonts.check('14px "Inter Variable"'),
    };
  });
  expect(body.fontFamily).toContain('Inter Variable');
  expect(body.fontSize).toBe(BODY_FONT_SIZE);
  expect(body.lineHeight).toBe(BODY_LINE_HEIGHT);
  expect(body.interLoaded).toBe(true);

  const caption = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.className = 'text-xs';
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const result = { fontSize: style.fontSize, lineHeight: style.lineHeight };
    probe.remove();
    return result;
  });
  expect(caption.fontSize).toBe(CAPTION_FONT_SIZE);
  expect(caption.lineHeight).toBe(CAPTION_LINE_HEIGHT);
});
