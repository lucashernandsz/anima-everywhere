import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

function wav(seconds: number) {
  const rate = 8000;
  const buffer = Buffer.alloc(44 + seconds * rate * 2);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(buffer.length - 8, 4); buffer.write('WAVE', 8);
  buffer.write('fmt ', 12); buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22); buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(buffer.length - 44, 40);
  for (let i = 0; i < seconds * rate; i++) buffer.writeInt16LE(Math.round(Math.sin(i / rate * Math.PI * 440) * 1000), 44 + i * 2);
  return { name: `audio-${seconds}s.wav`, mimeType: 'audio/wav', buffer };
}

async function openProjects(page: Page) {
  await page.getByRole('button', { name: /meus projetos/ }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'estúdio', exact: true }).click();
  await page.evaluate(() => document.fonts.ready);
});

test('initial studio, honest prototype boundaries, responsive layout', async ({ page }, testInfo) => {
  await expect(page.getByRole('heading', { name: 'seu som ganha movimento.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'preparar projeto' })).toBeDisabled();
  await expect(page.getByText('uma referência visual, não uma animação gerada a partir do seu áudio.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('studio.png'), fullPage: true });
});

test('local demo, real playback, trim controls and no audio uploads', async ({ page }) => {
  const outgoing: string[] = [];
  page.on('request', request => { if (request.method() !== 'GET') outgoing.push(request.url()); });
  await page.getByRole('button', { name: 'usar áudio de exemplo' }).click();
  await expect(page.getByRole('button', { name: 'preparar projeto' })).toBeEnabled();
  await expect(page.getByText('Pequenas ideias.wav', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'reproduzir trecho' }).click();
  await expect(page.getByRole('button', { name: 'pausar áudio' })).toBeVisible();
  await expect.poll(() => page.locator('audio').evaluate((element: HTMLAudioElement) => element.currentTime)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'pausar áudio' }).click();
  const start = page.getByRole('slider', { name: 'início do trecho' });
  await start.focus(); await start.press('End');
  await expect(start).toHaveValue('42');
  await expect(page.locator('.project-summary strong')).toHaveText('00:30');
  const end = page.getByRole('slider', { name: 'fim do trecho' });
  await end.focus(); await end.press('Home');
  await expect(start).toHaveValue('0'); await expect(end).toHaveValue('30');
  expect(outgoing).toEqual([]);
});

test('rejects unsupported and short audio without losing a valid selection', async ({ page }) => {
  const input = page.getByLabel('selecionar arquivo de áudio');
  await input.setInputFiles({ name: 'document.txt', mimeType: 'text/plain', buffer: Buffer.from('not audio') });
  await expect(page.getByRole('alert')).toContainText('escolha um arquivo de áudio');
  await input.setInputFiles(wav(10));
  await expect(page.getByRole('alert')).toContainText('menos de 30 segundos');
  await expect(page.getByRole('button', { name: 'preparar projeto' })).toBeDisabled();
  await input.setInputFiles(wav(45));
  await expect(page.getByRole('button', { name: 'preparar projeto' })).toBeEnabled();
  await input.setInputFiles({ name: 'invalid.wav', mimeType: 'audio/wav', buffer: Buffer.from('broken') });
  await expect(page.getByRole('alert')).toContainText('não foi possível ler este áudio');
  await expect(page.getByText('audio-45s.wav', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'preparar projeto' })).toBeEnabled();
});

test('enforces maximum 180 seconds and minimum 30 seconds', async ({ page }) => {
  await page.getByLabel('selecionar arquivo de áudio').setInputFiles(wav(240));
  const end = page.getByRole('slider', { name: 'fim do trecho' });
  const start = page.getByRole('slider', { name: 'início do trecho' });
  await expect(end).toBeVisible();
  await end.focus(); await end.press('End');
  await expect(end).toHaveValue('240'); await expect(start).toHaveValue('60');
  await expect(page.locator('.project-summary strong')).toHaveText('03:00');
  await start.focus(); await start.press('End');
  await expect(start).toHaveValue('210');
  await expect(page.locator('.project-summary strong')).toHaveText('00:30');
});

test('exploratory styles, aspect ratios and reduced motion', async ({ page }) => {
  await page.getByRole('button', { name: /traço livre/ }).click();
  await expect(page.getByRole('button', { name: /traço livre/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'vertical 9:16' }).click();
  await expect(page.locator('.preview-stage')).toHaveClass(/ratio-9-16/);
  await page.getByRole('button', { name: 'reproduzir prévia ilustrativa' }).click();
  await expect(page.getByRole('button', { name: 'pausar prévia ilustrativa' })).toBeVisible();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.preview-stage .draw-line').evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('saves and restores metadata only, never pretends audio was persisted', async ({ page }) => {
  await page.getByRole('button', { name: 'usar áudio de exemplo' }).click();
  await page.getByRole('button', { name: /formas em movimento/ }).click();
  await page.getByRole('button', { name: 'quadrado 1:1' }).click();
  await page.getByRole('button', { name: 'preparar projeto' }).click();
  await expect(page.getByRole('dialog')).toContainText('nenhum vídeo será gerado');
  await page.getByRole('button', { name: 'salvar rascunho' }).click();
  await page.getByLabel('nome do projeto').fill('Uma boa ideia');
  await page.getByRole('button', { name: 'salvar rascunho' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload(); await openProjects(page);
  await expect(page.getByRole('heading', { name: 'Uma boa ideia' })).toBeVisible();
  await page.getByRole('button', { name: 'continuar ideia' }).click();
  await expect(page.getByRole('button', { name: 'preparar projeto' })).toBeDisabled();
  await expect(page.getByRole('button', { name: /formas em movimento/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'quadrado 1:1' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('status')).toContainText('reimporte');
});

test('dialog traps keyboard focus and restores it after Escape', async ({ page }) => {
  await page.getByRole('button', { name: 'ajuda', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('exportação de vídeo ainda não estão disponíveis');
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('dialog')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'ajuda', exact: true })).toBeFocused();
});

test('handles corrupt local storage and opens picker from project navigation', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('anima-everywhere-drafts-v1', '{broken'));
  await page.reload(); await openProjects(page);
  await expect(page.getByRole('heading', { name: 'seu próximo projeto está por vir.' })).toBeVisible();
  const picker = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'novo projeto', exact: true }).click();
  await (await picker).setFiles(wav(30));
  await expect(page.getByRole('button', { name: 'preparar projeto' })).toBeEnabled();
  await expect(page.locator('.project-summary strong')).toHaveText('00:30');
});

test('WCAG automatic checks for studio and help', async ({ page }) => {
  const studio = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(studio.violations).toEqual([]);
  await page.getByRole('button', { name: 'ajuda', exact: true }).click();
  const help = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(help.violations).toEqual([]);
});

test('anywhere identity and layouts at four required widths', async ({ page }, testInfo) => {
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1050 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `no overflow at ${width}`).toBe(true);
    await expect(page.getByRole('link', { name: 'Anima Everywhere, início' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'seu som ganha movimento.' })).toHaveCSS('font-family', /Zilla Slab/);
    await expect(page.locator('body')).toHaveCSS('color', 'rgb(26, 26, 26)');
    await page.screenshot({ path: testInfo.outputPath(`studio-${width}.png`), fullPage: true });
  }
});
