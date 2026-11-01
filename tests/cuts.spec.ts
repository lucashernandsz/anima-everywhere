import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const id = '12345678-1234-1234-1234-123456789abc';
const cuts = [{ corte: 1, titulo_hook: 'Uma história com precisão', segundos_inicio: 2.123, segundos_fim: 24.843, url_youtube: 'https://www.youtube.com/watch?v=ag5CYQu_Yo0&t=2s' }];
const initialJob = { id, status: 'downloading', message: 'baixando vídeo.', total: 1, completed: 0, clips: [] };

async function mockHealth(page: Page, ready = true) {
  await page.route('**/api/health', route => route.fulfill({ json: { ready, tools: { ffmpeg: ready, ffprobe: ready, ytdlp: ready }, ...(ready ? {} : { message: 'instale as ferramentas locais.' }) } }));
}

async function fillCuts(page: Page) {
  await page.getByLabel('lista de cortes em JSON', { exact: true }).fill(JSON.stringify(cuts));
  await page.getByRole('checkbox', { name: /tenho os direitos/ }).check();
}

test.beforeEach(async ({ page }) => { await mockHealth(page); await page.goto('/'); });

test('example validates all ten cuts, keeps decimal times and permits short cuts without downloads', async ({ page }) => {
  const mutations: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') mutations.push(request.url()); });
  await page.getByRole('button', { name: 'usar lista do exemplo com 10 cortes' }).click();
  await expect(page.locator('.cut-list>li')).toHaveCount(10);
  await expect(page.locator('.cut-list')).toContainText('24:33.840');
  await expect(page.locator('.cut-list')).toContainText('66:15.559');
  await expect(page.locator('.cut-list')).toContainText('24,72 s');
  await expect(page.getByRole('button', { name: 'baixar e gerar cortes' })).toBeDisabled();
  await page.getByRole('checkbox', { name: /tenho os direitos/ }).check();
  await expect(page.getByRole('button', { name: 'baixar e gerar cortes' })).toBeEnabled();
  expect(mutations).toEqual([]);
});

test('invalid JSON, unsafe links and fallback URL validation', async ({ page }) => {
  const field = page.getByLabel('lista de cortes em JSON', { exact: true });
  await field.fill('{broken');
  await expect(page.getByRole('alert')).toContainText('JSON valido');
  await field.fill(JSON.stringify([{ ...cuts[0], url_youtube: 'http://127.0.0.1/private' }]));
  await expect(page.getByRole('alert')).toBeVisible();
  await field.fill(JSON.stringify([{ corte: 2, titulo_hook: 'Curto', tempo_inicio: '66:15', tempo_fim: '66:30' }]));
  await page.getByLabel('link do vídeo').fill('https://youtu.be/ag5CYQu_Yo0');
  await expect(page.locator('.cut-list>li')).toHaveCount(1);
  await expect(page.locator('.cut-list')).toContainText('66:15.000');
});

test('imports JSON and rejects oversized input files', async ({ page }) => {
  const file = page.getByLabel('selecionar lista JSON');
  await file.setInputFiles({ name: 'cortes.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(cuts)) });
  await expect(page.locator('.cut-list>li')).toHaveCount(1);
  await file.setInputFiles({ name: 'grande.json', mimeType: 'application/json', buffer: Buffer.alloc(241 * 1024, ' ') });
  await expect(page.getByRole('alert')).toContainText('240 KB');
});

test('submits canonical precise cuts, format and rights; exposes real response filenames', async ({ page }) => {
  let status = initialJob;
  let requestBody: Record<string, unknown> = {};
  await page.route('**/api/jobs', async route => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({ status: 202, json: { id } });
  });
  await page.route(`**/api/jobs/${id}`, route => route.fulfill({ json: status }));
  await fillCuts(page);
  await page.getByRole('radio', { name: 'vertical 9:16', exact: true }).check();
  await page.getByRole('radio', { name: /preencher e recortar/ }).check();
  await page.getByRole('button', { name: 'baixar e gerar cortes' }).click();
  await expect(page.getByText('baixando vídeo.', { exact: true })).toBeVisible();
  expect(requestBody).toMatchObject({ ratio: '9:16', framing: 'cover', rightsConfirmed: true, cuts: [{ ...cuts[0], url_youtube: 'https://www.youtube.com/watch?v=ag5CYQu_Yo0' }] });
  status = { ...initialJob, status: 'completed', message: 'exportação concluída.', completed: 1, clips: [{ corte: 1, title: cuts[0].titulo_hook, filename: '01-uma-historia-com-precisao.mp4', url: `/api/jobs/${id}/files/01-uma-historia-com-precisao.mp4`, duration: 22.72 }] } as typeof initialJob;
  await expect(page.getByRole('link', { name: /baixar corte 01/ })).toHaveAttribute('download', '01-uma-historia-com-precisao.mp4');
  await expect(page.getByRole('button', { name: 'baixar e gerar cortes' })).toBeEnabled();
});

test('reload and navigation recover an active job without reposting', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/jobs', async route => { posts++; await route.fulfill({ status: 202, json: { id } }); });
  await page.route(`**/api/jobs/${id}`, route => route.fulfill({ json: initialJob }));
  await fillCuts(page);
  await page.getByRole('button', { name: 'baixar e gerar cortes' }).click();
  await expect(page.getByText('baixando vídeo.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'estúdio', exact: true }).click();
  await page.getByRole('button', { name: 'cortes de vídeo', exact: true }).click();
  await expect(page.getByText('baixando vídeo.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('baixando vídeo.', { exact: true })).toBeVisible();
  expect(posts).toBe(1);
});

test('lost POST response recovers existing job rather than retrying mutation', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/jobs', async route => {
    if (route.request().method() === 'POST') { posts++; await route.abort('failed'); }
    else await route.fulfill({ json: { job: initialJob } });
  });
  await page.route(`**/api/jobs/${id}`, route => route.fulfill({ json: initialJob }));
  await fillCuts(page);
  await page.getByRole('button', { name: 'baixar e gerar cortes' }).click();
  await expect(page.getByText('baixando vídeo.', { exact: true })).toBeVisible();
  expect(posts).toBe(1);
});

test('known server error remains visible, and cancellation preserves partial downloads', async ({ page }) => {
  await page.route('**/api/jobs', route => route.fulfill({ status: 503, json: { error: 'ferramentas indisponíveis.' } }));
  await fillCuts(page);
  await page.getByRole('button', { name: 'baixar e gerar cortes' }).click();
  await expect(page.getByRole('alert')).toContainText('ferramentas indisponíveis');
  await page.unroute('**/api/jobs');
  await page.route('**/api/jobs', route => route.fulfill({ status: 202, json: { id } }));
  let cancelled = false;
  const clip = { corte: 1, title: cuts[0].titulo_hook, filename: '01-corte.mp4', url: `/api/jobs/${id}/files/01-corte.mp4`, duration: 22.72 };
  await page.route(`**/api/jobs/${id}`, async route => {
    if (route.request().method() === 'DELETE') { cancelled = true; await route.fulfill({ status: 204 }); }
    else await route.fulfill({ json: { ...initialJob, status: cancelled ? 'cancelled' : 'processing', completed: 1, clips: [clip], message: cancelled ? 'cancelado.' : 'processando.' } });
  });
  await page.getByRole('button', { name: 'baixar e gerar cortes' }).click();
  await expect(page.getByText('processando.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'cancelar processamento' }).click();
  await expect(page.getByText('cancelado.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /baixar corte 01/ })).toBeVisible();
});

test('missing tools block download and provide local setup instructions', async ({ page }) => {
  await mockHealth(page, false); await page.reload();
  await fillCuts(page);
  await expect(page.getByText('npm run setup:tools', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'baixar e gerar cortes' })).toBeDisabled();
});

test('four widths, reduced motion and accessible controls', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'usar lista do exemplo com 10 cortes' }).click();
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1050 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no overflow at ${width}`).toBe(true);
    await expect(page.getByRole('button', { name: 'baixar e gerar cortes' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`cuts-${width}.png`), fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(result.violations).toEqual([]);
});
