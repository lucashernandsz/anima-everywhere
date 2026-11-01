import { spawn } from 'node:child_process';
import { access, readdir, stat, lstat, realpath, rename } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filenameForCut } from '../shared/cuts.mjs';

export const PROJECT_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SOURCE_LIMIT = 4 * 1024 ** 3;
export const DISK_LIMIT = 8 * 1024 ** 3;
export const DIMENSIONS = { '1:1': [720, 720], '16:9': [1280, 720], '9:16': [720, 1280] };

export async function directoryBytes(directory) {
  let total = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(target);
    else if (entry.isFile()) total += (await stat(target)).size;
  }
  return total;
}

export async function resolveTools(overrides = {}) {
  const resolved = {};
  for (const [name, binary, env] of [['ffmpeg', 'ffmpeg', 'FFMPEG_PATH'], ['ffprobe', 'ffprobe', 'FFPROBE_PATH'], ['ytdlp', 'yt-dlp', 'YTDLP_PATH']]) {
    const explicit = overrides[name] ?? process.env[env];
    const candidates = explicit ? [explicit] : [path.join(PROJECT_ROOT, '.tools/bin', binary), ...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, binary))];
    resolved[name] = null;
    for (const candidate of candidates) {
      try { await access(candidate, constants.X_OK); resolved[name] = path.resolve(candidate); break; } catch { /* Try the next configured location. */ }
    }
  }
  return resolved;
}

export function runProcess(command, args, { signal, timeout = 15 * 60_000, label = 'processamento' } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('operacao cancelada.'));
    const child = spawn(command, args, { shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let failure;
    let killTimer;
    const kill = (message) => {
      if (failure) return;
      failure = new Error(message);
      const terminate = (sig) => {
        try { process.platform === 'win32' ? child.kill(sig) : process.kill(-child.pid, sig); } catch { /* The process already exited. */ }
      };
      terminate('SIGTERM');
      killTimer = setTimeout(() => terminate('SIGKILL'), 1500);
      killTimer.unref();
    };
    const abort = () => kill('operacao cancelada.');
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    const timer = setTimeout(() => kill(`tempo limite de ${label} excedido.`), timeout);
    timer.unref();
    child.stdout.on('data', (chunk) => {
      if (stdout.length + chunk.length > 1024 * 1024) kill('a ferramenta retornou dados demais.');
      else stdout += chunk.toString();
    });
    // Drain stderr without retaining URLs, credentials, or unbounded diagnostics.
    child.stderr.on('data', () => {});
    child.on('error', () => { failure = new Error(`nao foi possivel iniciar ${label}; verifique a instalacao local.`); });
    child.on('close', (code) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) {
        const action = label === 'download'
          ? 'confira se o video e publico e esta disponivel sem login. nao sao contornados bloqueios, DRM ou verificacoes anti-bot.'
          : 'confira a integridade do arquivo e o suporte local do FFmpeg a libx264 e AAC.';
        reject(new Error(`falha no ${label}. ${action}`));
      }
      else resolve(stdout.trim());
    });
  });
}

export async function toolHealth(tools) {
  const entries = await Promise.all(Object.entries(tools).map(async ([name, command]) => {
    if (!command) return [name, false];
    try { await runProcess(command, name === 'ytdlp' ? ['--ignore-config', '--no-plugin-dirs', '--version'] : ['-version'], { timeout: 10_000, label: name }); return [name, true]; } catch { return [name, false]; }
  }));
  const status = Object.fromEntries(entries);
  const ready = Object.values(status).every(Boolean);
  return { ready, tools: status, ...(!ready && { message: 'instale as ferramentas locais ffmpeg, ffprobe e yt-dlp antes de exportar.' }) };
}

async function requireLocalFile(filename) {
  if (!(await lstat(filename)).isFile() || await realpath(filename) !== path.resolve(filename)) throw new Error('o arquivo local nao pode ser um link simbolico.');
}

export async function probeMedia(filename, tools, signal) {
  await requireLocalFile(filename);
  const output = await runProcess(tools.ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries', 'format=duration:stream=codec_type,width,height,duration', '-of', 'json', filename], { signal, timeout: 30_000, label: 'analise de video' });
  let data;
  try { data = JSON.parse(output); } catch { throw new Error('nao foi possivel analisar o video local.'); }
  const video = data.streams?.find((stream) => stream.codec_type === 'video');
  const duration = Number(data.format?.duration);
  if (!video || !Number.isFinite(duration) || duration <= 0 || !(video.width > 0 && video.height > 0)) throw new Error('o arquivo precisa conter video com duracao finita. transmissoes ao vivo nao sao aceitas.');
  const videoDuration = Number(video.duration);
  return { duration: Number.isFinite(videoDuration) && videoDuration > 0 ? Math.min(duration, videoDuration) : duration, width: video.width, height: video.height };
}

export async function encodeCut({ source, output, cut, ratio, framing, tools, signal }) {
  await requireLocalFile(source);
  const duration = cut.segundos_fim - cut.segundos_inicio;
  const [width, height] = DIMENSIONS[ratio];
  const scale = framing === 'cover'
    ? `scale=${width}:${height}:force_original_aspect_ratio=increase:force_divisible_by=2,crop=${width}:${height}`
    : `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`;
  // Normalize display aspect before fitting; reset_sar is unavailable in FFmpeg 7.
  const filter = `scale=iw*sar:ih,setsar=1,${scale},setsar=1`;
  const temporary = `${output}.partial.mp4`;
  await runProcess(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-ss', String(cut.segundos_inicio), '-threads', '2', '-i', source, '-t', String(duration), '-map', '0:v:0', '-map', '0:a:0?', '-vf', filter, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-threads', '2', '-filter_threads', '2', '-c:a', 'aac', '-b:a', '128k', '-r', '30', '-pix_fmt', 'yuv420p', '-map_metadata', '-1', '-map_chapters', '-1', '-movflags', '+faststart', '-fs', String(SOURCE_LIMIT), temporary], { signal, label: 'recorte de video' });
  const result = await probeMedia(temporary, tools, signal);
  if (Math.abs(result.duration - duration) > 0.09 || result.width !== width || result.height !== height) throw new Error('o recorte nao corresponde ao intervalo ou formato solicitado.');
  if (signal?.aborted) throw new Error('operacao cancelada.');
  await rename(temporary, output);
  return result;
}

export async function mediaWorker({ cuts, ratio, framing, directory, tools, signal, update, addClip, checkBudget }) {
  const sources = new Map();
  for (const cut of cuts) {
    if (sources.has(cut.url_youtube)) continue;
    update('downloading', `baixando video ${sources.size + 1} de ${new Set(cuts.map((item) => item.url_youtube)).size}.`);
    const id = new URL(cut.url_youtube).searchParams.get('v');
    const stdout = await runProcess(tools.ytdlp, [
      '--ignore-config', '--no-plugin-dirs', '--no-cache-dir', '--no-playlist', '--no-warnings', '--no-progress',
      '--js-runtimes', `node:${process.execPath}`, '--no-remote-components', '--match-filter', '!is_live & duration <= 43200',
      '--socket-timeout', '30', '--retries', '3', '--fragment-retries', '3', '--concurrent-fragments', '1',
      '--max-filesize', '4G', '-f', 'bv*[height<=720]+ba/b[height<=720]', '--merge-output-format', 'mkv',
      '--ffmpeg-location', tools.ffmpeg, '--output', path.join(directory, `source-${id}.%(ext)s`),
      '--print', 'after_move:filepath', '--', cut.url_youtube,
    ], { signal, timeout: 60 * 60_000, label: 'download' });
    const source = stdout.split(/\r?\n/u).at(-1);
    if (!source || path.dirname(source) !== directory || !path.basename(source).startsWith(`source-${id}.`)) throw new Error('o download nao produziu um arquivo local valido.');
    if (await realpath(source) !== source || !(await stat(source)).isFile() || (await stat(source)).size > SOURCE_LIMIT) throw new Error('o video excede o limite local de 4 GB.');
    await checkBudget();
    const info = await probeMedia(source, tools, signal);
    if (info.duration > 43200) throw new Error('o video de origem deve ter no maximo 12 horas.');
    for (const requested of cuts.filter((item) => item.url_youtube === cut.url_youtube)) {
      if (requested.segundos_fim > info.duration + 0.001) throw new Error('um corte ultrapassa a duracao disponivel do video. confira os tempos ou a integridade do download.');
    }
    sources.set(cut.url_youtube, source);
  }
  for (const cut of cuts) {
    if (signal.aborted) throw new Error('operacao cancelada.');
    update('processing', `exportando corte ${cut.corte}.`);
    await checkBudget();
    const filename = filenameForCut(cut);
    const result = await encodeCut({ source: sources.get(cut.url_youtube), output: path.join(directory, filename), cut, ratio, framing, tools, signal });
    await checkBudget();
    addClip({ corte: cut.corte, title: cut.titulo_hook, filename, duration: result.duration });
  }
}
