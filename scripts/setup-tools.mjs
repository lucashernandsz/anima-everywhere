import { mkdir, mkdtemp, chmod, rename, rm, writeFile, access } from 'node:fs/promises';
import { createReadStream, createWriteStream, constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../.tools/', import.meta.url));
const bin = path.join(root, 'bin');
const execute = promisify(execFile);
const headers = { 'User-Agent': 'Anima-Everywhere-local-setup', Accept: 'application/vnd.github+json' };

async function request(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(300_000) });
  if (!response.ok) throw new Error(`nao foi possivel baixar ${new URL(url).hostname}; tente novamente mais tarde.`);
  return response;
}

async function download(asset, destination) {
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest ?? '')) throw new Error('o fornecedor nao publicou SHA-256; instalacao interrompida.');
  console.log(`baixando ${asset.name} (${Math.ceil(asset.size / 1024 ** 2)} MB)...`);
  const response = await request(asset.browser_download_url);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(destination, { mode: 0o600 }));
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(destination)) hash.update(chunk);
  if (`sha256:${hash.digest('hex')}` !== asset.digest) throw new Error('SHA-256 divergente; arquivo nao sera instalado.');
}

async function main() {
  if (process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch)) {
    throw new Error('instalador automatico para Linux/WSL x64 e arm64. em outros sistemas, instale FFmpeg, ffprobe e yt-dlp no PATH; consulte README.md.');
  }
  await mkdir(bin, { recursive: true });
  const existing = await Promise.all(['ffmpeg', 'ffprobe', 'yt-dlp'].map(name => access(path.join(bin, name), constants.X_OK).then(() => true, () => false)));
  if (existing.every(Boolean)) { console.log('ferramentas locais ja instaladas.'); return; }
  const staging = await mkdtemp(path.join(root, 'setup-'));
  try {
    const ffmpeg = await (await request('https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest')).json();
    const ytdlp = await (await request('https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest')).json();
    const target = process.arch === 'x64' ? 'linux64' : 'linuxarm64';
    const ffmpegAsset = ffmpeg.assets.find(asset => asset.name === `ffmpeg-master-latest-${target}-gpl.tar.xz`);
    const ytAsset = ytdlp.assets.find(asset => asset.name === (process.arch === 'x64' ? 'yt-dlp_linux' : 'yt-dlp_linux_aarch64'));
    const archive = path.join(staging, 'ffmpeg.tar.xz');
    await download(ffmpegAsset, archive);
    const folder = ffmpegAsset.name.replace('.tar.xz', '');
    await execute('tar', ['-xJf', archive, '-C', staging, '--strip-components=2', '--no-same-owner', `${folder}/bin/ffmpeg`, `${folder}/bin/ffprobe`]);
    await download(ytAsset, path.join(staging, 'yt-dlp'));
    for (const name of ['ffmpeg', 'ffprobe', 'yt-dlp']) {
      await chmod(path.join(staging, name), 0o755);
      await execute(path.join(staging, name), [name === 'yt-dlp' ? '--version' : '-version'], { timeout: 15_000 });
    }
    await writeFile(path.join(root, 'provenance.json'), JSON.stringify({ installedAt: new Date().toISOString(), ffmpeg: ffmpegAsset, ytdlp: ytAsset }, null, 2), { mode: 0o600 });
    await writeFile(path.join(root, 'LICENSES.txt'), [
      'Ferramentas gratuitas, instaladas localmente; nao sao incorporadas ao build do site.',
      'FFmpeg GPL build (libx264): GPL v2 ou posterior conforme configuracao do binario; consulte ffmpeg -L.',
      'Licencas, fontes e scripts de compilacao: https://github.com/BtbN/FFmpeg-Builds e https://ffmpeg.org/legal.html',
      'yt-dlp standalone: GPLv3+, inclui componentes com outras licencas (fonte yt-dlp sob Unlicense).',
      `Release e licencas: ${ytdlp.html_url} e https://github.com/yt-dlp/yt-dlp#release-files`,
      'EJS incluido no standalone oficial; Node.js existente como runtime. Nenhum componente remoto e baixado durante o processamento.',
    ].join('\n'));
    for (const name of ['ffmpeg', 'ffprobe', 'yt-dlp']) await rename(path.join(staging, name), path.join(bin, name));
    console.log('ferramentas prontas em .tools/bin; sem sudo e sem configuracao no Google.');
  } finally { await rm(staging, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
