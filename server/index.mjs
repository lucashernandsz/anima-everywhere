import http from 'node:http';
import { constants } from 'node:fs';
import { mkdir, chmod, readdir, stat, lstat, statfs, rm, realpath, open } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseCuts, filenameForCut } from '../shared/cuts.mjs';
import { PROJECT_ROOT, DISK_LIMIT, SOURCE_LIMIT, directoryBytes, resolveTools, toolHealth, mediaWorker } from './media.mjs';

const ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']);
const TERMINAL = new Set(['completed', 'failed', 'cancelled']);
const RETENTION = 24 * 60 * 60_000;
const MESSAGES = { completed: 'exportacao concluida.', failed: 'nao foi possivel concluir a exportacao.', cancelled: 'exportacao cancelada.' };

function respond(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(value === undefined ? undefined : JSON.stringify(value));
}

async function readBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > 256 * 1024) {
      request.resume();
      throw Object.assign(new Error('o JSON excede o limite de 256 KB.'), { status: 413 });
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('envie um JSON valido.'), { status: 400 }); }
}

/** Returns an unstarted HTTP server. listen() always binds IPv4 loopback. */
export function createLocalServer(options = {}) {
  const directory = path.resolve(options.dataDirectory ?? path.join(PROJECT_ROOT, '.local-media'));
  const jobs = new Map();
  const getTools = () => resolveTools(options.tools);
  const worker = options.worker ?? mediaWorker;
  let active;
  let starting = false;
  let closing = false;
  const initialized = mkdir(directory, { recursive: true, mode: 0o700 }).then(async () => {
    if (!(await lstat(directory)).isDirectory() || await realpath(directory) !== directory) throw new Error('o armazenamento local nao pode ser um link simbolico.');
    await chmod(directory, 0o700);
  });

  async function cleanup() {
    await initialized;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^job-[a-f0-9-]{36}$/u.test(entry.name)) continue;
      const id = entry.name.slice(4);
      const job = jobs.get(id);
      if (job && !TERMINAL.has(job.status)) continue;
      if (active?.id === id) continue;
      const info = await stat(path.join(directory, entry.name)).catch(() => null);
      if (info && Date.now() - (job?.finishedAt ?? info.mtimeMs) > RETENTION) {
        await rm(path.join(directory, entry.name), { recursive: true, force: true });
        jobs.delete(id);
      }
    }
  }
  const startup = cleanup();
  startup.catch(() => {});

  async function checkBudget(jobDirectory) {
    if (await directoryBytes(directory) > DISK_LIMIT) throw new Error('o armazenamento local atingiu o limite de 8 GB. exclua exportacoes antigas.');
    const disk = await statfs(directory);
    if (disk.bavail * disk.bsize < 256 * 1024 ** 2) throw new Error('espaco livre insuficiente no disco local.');
    if (jobDirectory) {
      const sourceBytes = new Map();
      for (const entry of await readdir(jobDirectory, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.startsWith('source-')) {
          const id = entry.name.slice(0, 18);
          sourceBytes.set(id, (sourceBytes.get(id) ?? 0) + (await stat(path.join(jobDirectory, entry.name))).size);
        }
      }
      if ([...sourceBytes.values()].some((bytes) => bytes > SOURCE_LIMIT)) throw new Error('o video excede o limite local de 4 GB.');
    }
  }

  function publicJob(job) {
    return { id: job.id, status: job.status, message: job.message, completed: job.clips.length, total: job.cuts.length, clips: job.clips, ...(job.error && { error: job.error }) };
  }

  async function execute(job) {
    const controller = new AbortController();
    job.controller = controller;
    let budgetError;
    let checking = false;
    const timer = setInterval(async () => {
      if (checking) return;
      checking = true;
      try { await checkBudget(job.directory); } catch (error) { budgetError = error; controller.abort(); } finally { checking = false; }
    }, 1000);
    timer.unref();
    try {
      await worker({ cuts: job.cuts, ratio: job.ratio, framing: job.framing, directory: job.directory, tools: job.tools, signal: controller.signal,
        checkBudget: () => checkBudget(job.directory),
        update: (status, message) => { if (!controller.signal.aborted) { job.status = status; job.message = message; } },
        addClip: (clip) => {
          if (controller.signal.aborted) return;
          job.clips.push({ ...clip, url: `/api/jobs/${job.id}/files/${encodeURIComponent(clip.filename)}` });
        },
      });
      if (budgetError) throw budgetError;
      if (job.status !== 'cancelled') { job.status = 'completed'; job.message = MESSAGES.completed; }
    } catch (error) {
      if (job.status !== 'cancelled') {
        job.status = 'failed';
        job.message = MESSAGES.failed;
        job.error = budgetError?.message ?? (error instanceof Error && /^(?:operacao cancelada|tempo limite|a ferramenta|nao foi possivel|falha no|o |um |as |espaco )/u.test(error.message) ? error.message : 'falha local ao exportar. verifique as ferramentas e o espaco em disco.');
      }
    } finally {
      clearInterval(timer);
      // Keep only verified completed outputs, including after a partial failure.
      const outputs = new Set(job.clips.map((clip) => clip.filename));
      for (const entry of await readdir(job.directory).catch(() => [])) {
        if (!outputs.has(entry)) await rm(path.join(job.directory, entry), { recursive: true, force: true }).catch(() => {});
      }
      job.finishedAt = Date.now();
      if (active === job) active = undefined;
    }
  }

  const server = http.createServer(async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    try {
      const port = server.address()?.port;
      if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(request.socket.localAddress) || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(request.headers.host)) return respond(response, 403, { error: 'host local nao autorizado.' });
      const origin = request.headers.origin;
      if (origin !== undefined && !ORIGINS.has(origin)) return respond(response, 403, { error: 'origem nao autorizada.' });
      const mutation = ['POST', 'DELETE', 'PUT', 'PATCH'].includes(request.method);
      if (mutation && !origin) return respond(response, 403, { error: 'a origem local e obrigatoria.' });
      if (mutation && !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers['content-type'] ?? '')) return respond(response, 415, { error: 'use application/json.' });
      await startup;
      await cleanup();
      const route = request.url;
      if (request.method === 'GET' && route === '/api/health') return respond(response, 200, await toolHealth(await getTools()));
      if (request.method === 'GET' && route === '/api/jobs') {
        const job = active ?? [...jobs.values()].at(-1);
        return respond(response, 200, { job: job ? publicJob(job) : null });
      }
      if (request.method === 'POST' && route === '/api/jobs') {
        if (active || starting || closing) return respond(response, 409, { error: 'ja existe uma exportacao ativa.' });
        // Hold admission across every await, including reading slow request bodies.
        starting = true;
        try {
          const body = await readBody(request);
          let cuts;
          try {
            if (!body || typeof body !== 'object' || Array.isArray(body) || body.rightsConfirmed !== true) throw new Error('confirme que voce tem autorizacao para baixar e recortar o video.');
            if (!['1:1', '16:9', '9:16'].includes(body.ratio)) throw new Error('selecione a proporcao 1:1, 16:9 ou 9:16.');
            if (!['contain', 'cover'].includes(body.framing)) throw new Error('selecione contain ou cover.');
            if (!Array.isArray(body.cuts)) throw new Error('cuts precisa ser uma lista JSON.');
            cuts = parseCuts(body.cuts, body.url);
          } catch (error) { return respond(response, 400, { error: error.message }); }
          const tools = await getTools();
          const health = await toolHealth(tools);
          if (!health.ready && !options.worker) return respond(response, 503, { error: health.message });
          try { await checkBudget(); } catch (error) { return respond(response, 507, { error: error.message }); }
          if (closing) return respond(response, 503, { error: 'o servidor esta encerrando.' });
          const id = randomUUID();
          const jobDirectory = path.join(directory, `job-${id}`);
          await mkdir(jobDirectory, { mode: 0o700 });
          if (closing) {
            await rm(jobDirectory, { recursive: true, force: true });
            return respond(response, 503, { error: 'o servidor esta encerrando.' });
          }
          const job = { id, cuts, ratio: body.ratio, framing: body.framing, tools, directory: jobDirectory, status: 'queued', message: 'exportacao na fila.', clips: [] };
          jobs.set(id, job);
          active = job;
          job.promise = execute(job);
          return respond(response, 202, { id });
        } finally { starting = false; }
      }
      const match = /^\/api\/jobs\/([a-f0-9-]{36})(?:\/files\/([^/?#]+))?$/u.exec(route);
      if (!match) return respond(response, 404, { error: 'rota nao encontrada.' });
      const job = jobs.get(match[1]);
      if (!job) return respond(response, 404, { error: 'exportacao nao encontrada ou expirada.' });
      if (!match[2] && request.method === 'GET') return respond(response, 200, publicJob(job));
      if (!match[2] && request.method === 'DELETE') {
        if (active === job && !TERMINAL.has(job.status)) {
          job.status = 'cancelled'; job.message = MESSAGES.cancelled; job.controller.abort();
        } else {
          await job.promise;
          await rm(job.directory, { recursive: true, force: true }); jobs.delete(job.id);
        }
        return respond(response, 204);
      }
      if (match[2] && request.method === 'GET') {
        let filename;
        try { filename = decodeURIComponent(match[2]); } catch { return respond(response, 404, { error: 'arquivo nao encontrado.' }); }
        const clip = job.clips.find((item) => item.filename === filename);
        if (!clip || filename !== path.basename(filename) || filename !== filenameForCut(job.cuts.find((item) => item.corte === clip.corte))) return respond(response, 404, { error: 'arquivo nao encontrado.' });
        const target = path.join(job.directory, filename);
        if (await realpath(job.directory).catch(() => null) !== job.directory) return respond(response, 404, { error: 'arquivo nao encontrado.' });
        const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK).catch(() => null);
        if (!handle) return respond(response, 404, { error: 'arquivo nao encontrado.' });
        const info = await handle.stat();
        if (!info.isFile()) { await handle.close(); return respond(response, 404, { error: 'arquivo nao encontrado.' }); }
        response.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': info.size, 'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}` });
        const stream = handle.createReadStream();
        stream.on('error', () => response.destroy());
        response.on('close', () => stream.destroy());
        stream.pipe(response);
        return;
      }
      return respond(response, 405, { error: 'metodo nao permitido.' });
    } catch (error) {
      if (!response.headersSent) respond(response, error.status ?? 500, { error: error.status ? error.message : 'falha local. verifique as ferramentas e o armazenamento.' });
      else response.destroy();
    }
  });
  const listen = server.listen.bind(server);
  server.listen = (port = options.port ?? 4318, host = '127.0.0.1', callback) => {
    if (typeof host === 'function') { callback = host; host = '127.0.0.1'; }
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('informe uma porta TCP local valida.');
    if (host !== '127.0.0.1' && host !== 'localhost') throw new Error('o servidor so pode escutar em 127.0.0.1.');
    return listen(port, '127.0.0.1', callback);
  };
  const close = server.close.bind(server);
  server.close = (callback) => {
    closing = true;
    const pending = active?.promise;
    if (active && !TERMINAL.has(active.status)) { active.status = 'cancelled'; active.message = MESSAGES.cancelled; active.controller.abort(); }
    return close(async (error) => {
      await startup.catch(() => {});
      await pending;
      callback?.(error);
    });
  };
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createLocalServer();
  server.listen(4318, '127.0.0.1', () => console.log('servidor local em http://127.0.0.1:4318'));
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
}
