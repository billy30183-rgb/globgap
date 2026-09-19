import { test, expect } from '@playwright/test';
import { analyze } from '../../src/compare.js';
import { report } from '../../src/report.js';

test('real Worker, all demos, editing, private paths, report and offline analysis', async ({ page, context }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('./'); await expect(page.locator('#copy')).toBeEnabled();
  await expect(page.locator('#removed li')).not.toHaveCount(0);
  await expect(page.locator('#engine')).toContainText('Picomatch 4.0.7');
  // Start capturing only after initial app + Worker resources have loaded.
  const external = []; page.on('request', req => { if (new URL(req.url()).origin !== new URL(page.url()).origin) external.push(req.url()); });
  await context.setOffline(true);
  for (const [key, list] of [['typescript', 'added'], ['docs', 'removed'], ['tests', 'added'], ['nested', 'removed']]) {
    await page.locator(`[data-demo=${key}]`).click(); await expect(page.locator('#copy')).toBeEnabled();
    await expect(page.locator(`#${list} li`)).not.toHaveCount(0);
  }
  await page.locator('#before').fill('orchard/**/*.svelte'); await page.locator('#after').fill('orchard/*.svelte');
  await expect(page.locator('#copy')).toBeDisabled();
  await page.locator('#provided-details summary').click();
  const provided = 'orchard/lib/測 試.svelte\norchard/`|<img src=x onerror=alert>.svelte';
  await page.locator('#provided').fill(provided); await page.locator('#find').click();
  await expect(page.locator('#copy')).toBeEnabled(); await expect(page.locator('#removed')).toContainText('orchard/lib/測 試.svelte');
  await expect(page.locator('img')).toHaveCount(0);
  await page.locator('#copy').click();
  const expected = analyze({ before: 'orchard/**/*.svelte', after: 'orchard/*.svelte', provided });
  await expect(page.locator('#report-text')).toHaveValue(report(expected));
  await expect(page.locator('#added-count')).toHaveText(String(expected.counts.ADDED));
  await expect(page.locator('#removed-count')).toHaveText(String(expected.counts.REMOVED));
  await page.locator('#after').fill('orchard/**/*.svelte'); await page.locator('#find').click();
  await expect(page.locator('#copy')).toBeEnabled(); await expect(page.locator('#no-differences')).toBeVisible();
  await expect(page.locator('#results')).toContainText('This is a bounded search, not a proof of equivalence.');
  expect(external).toEqual([]); expect(errors).toEqual([]);
});

test('errors, input cancellation and stale result prevention in the browser', async ({ page }) => {
  await page.goto('./'); await expect(page.locator('#copy')).toBeEnabled();
  await page.locator('#before').fill('a/[a-z]'); await page.locator('#find').click();
  await expect(page.locator('#status')).toContainText('not supported'); await expect(page.locator('#copy')).toBeDisabled();
  await page.locator('#before').fill('**/*'); await page.locator('#after').fill('a/*');
  await page.evaluate(() => { document.getElementById('find').click(); document.getElementById('cancel').click(); });
  await expect(page.locator('#status')).toContainText('Cancelled'); await expect(page.locator('#copy')).toBeDisabled();
  await page.evaluate(() => { document.getElementById('find').click(); const input = document.getElementById('after'); input.value = 'edited/*'; input.dispatchEvent(new Event('input')); });
  await expect(page.locator('#status')).toContainText('Inputs changed'); await expect(page.locator('#copy')).toBeDisabled();
  await expect(page.locator('#added li')).toHaveCount(0);
});

test('Worker timeout protection in a real browser', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor() { super(URL.createObjectURL(new Blob(['self.onmessage = () => { while (true) {} };'], { type: 'text/javascript' }))); }
    };
  });
  await page.goto('./'); await expect(page.locator('#status')).toContainText('Timed out', { timeout: 8000 });
  await expect(page.locator('#status')).toContainText('incomplete'); await expect(page.locator('#copy')).toBeDisabled();
});

test('subpath, clipboard, screenshot and mobile layout', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./#demo=typescript'); await expect(page.locator('#copy')).toBeEnabled();
  await page.locator('#copy').click(); await expect(page.locator('#status')).toContainText('copied');
  // Windows text clipboard normalizes LF to CRLF; compare content losslessly.
  expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n')).toBe(await page.locator('#report-text').inputValue());
  await page.goto('./#demo=nested'); await expect(page.locator('#copy')).toBeEnabled();
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.screenshot({ path: 'docs/screenshot.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('[data-demo=typescript]').click(); await expect(page.locator('#copy')).toBeEnabled();
  await expect(page.locator('#added li')).not.toHaveCount(0);
});

test('dotfile and case options, provided source labels and exact report snapshot', async ({ page }) => {
  await page.goto('./'); await expect(page.locator('#copy')).toBeEnabled();
  await page.locator('#before').fill('src/*.ts');
  await page.locator('#after').fill('src/*.TS');
  await page.locator('#provided-details summary').click();
  const provided = 'src/main.ts\nsrc/.hidden.TS';
  await page.locator('#provided').fill(provided);
  const check = async (options) => {
    await page.locator('#find').click(); await expect(page.locator('#copy')).toBeEnabled();
    const expected = analyze({ before: 'src/*.ts', after: 'src/*.TS', provided, options });
    await expect(page.locator('#added-count')).toHaveText(String(expected.counts.ADDED));
    await expect(page.locator('#removed-count')).toHaveText(String(expected.counts.REMOVED));
    await page.locator('#copy').click(); await expect(page.locator('#report-text')).toHaveValue(report(expected));
  };
  await check({});
  await expect(page.locator('#removed li').filter({ hasText: 'Provided path' })).toContainText('src/main.ts');
  await expect(page.locator('#removed li').filter({ hasText: 'Generated example' }).first()).toBeVisible();
  await page.locator('#dot').check(); await check({ dot: true });
  await expect(page.locator('#added li').filter({ hasText: 'Provided path' })).toContainText('src/.hidden.TS');
  await page.locator('#nocase').check(); await check({ dot: true, nocase: true });
  await expect(page.locator('#no-differences')).toBeVisible();
});

test('oversized inputs are rejected and bounded generation is labelled incomplete', async ({ page }) => {
  await page.goto('./'); await expect(page.locator('#copy')).toBeEnabled();
  await page.locator('#before').fill('a'.repeat(257)); await page.locator('#find').click();
  await expect(page.locator('#status')).toContainText('256'); await expect(page.locator('#copy')).toBeDisabled();
  await page.locator('#before').fill('**/*');
  await page.locator('#provided-details summary').click();
  await page.locator('#provided').fill(Array(2001).fill('a').join('\n')); await page.locator('#find').click();
  await expect(page.locator('#status')).toContainText('2000'); await expect(page.locator('#copy')).toBeDisabled();
  await page.locator('#provided').fill('');
  await page.locator('#before').fill(`root/{aa,bb}{cc,dd}{ee,ff}{gg,hh}{ii,jj}{kk,ll}/${'*?'.repeat(8)}.ext`);
  await page.locator('#after').fill('other/**/*.{a,b,c,d,e,f,g,h}'); await page.locator('#find').click();
  await expect(page.locator('#copy')).toBeEnabled(); await expect(page.locator('#status')).toContainText('Incomplete');
  await expect(page.locator('#status')).toContainText('Candidate limit');
  await expect(page.locator('#summary')).toContainText('3000 generated examples');
  await page.locator('#copy').click();
  expect(await page.locator('#report-text').inputValue()).toContain('Status: Incomplete');
});
