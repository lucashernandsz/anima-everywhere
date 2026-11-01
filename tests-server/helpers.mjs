import { mkdtemp, rm, copyFile, chmod, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createLocalServer } from '../server/index.mjs';

export const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
export const cut = { corte: 1, titulo_hook: 'ação local', segundos_inicio: 24.72, segundos_fim: 49.44, url_youtube: url };
export const body = { cuts: [cut], ratio: '1:1', framing: 'contain', rightsConfirmed: true };
export const headers = { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' };

export async function temporary(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'anima-backend-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

export async function fakeTools(t) {
  const directory = await temporary(t);
  const tools = {};
  for (const [key, name] of [['ffmpeg', 'ffmpeg'], ['ffprobe', 'ffprobe'], ['ytdlp', 'yt-dlp']]) {
    tools[key] = path.join(directory, name);
    await copyFile(new URL('./fixtures/tool.mjs', import.meta.url), tools[key]);
    await chmod(tools[key], 0o700);
  }
  return { tools, calls: async () => (await readFile(path.join(directory, 'calls.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)) };
}

export async function start(t, options = {}) {
  const directory = options.dataDirectory ?? await mkdtemp(path.join(os.tmpdir(), 'anima-backend-'));
  const server = createLocalServer({ dataDirectory: directory, ...options });
  server.listen(0);
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (route, init) => fetch(`${base}${route}`, init);
  const submit = (data = body) => request('/api/jobs', { method: 'POST', headers, body: JSON.stringify(data) });
  return { directory, server, base, request, submit };
}

export async function waitFor(request, id, predicate = (job) => ['completed', 'failed', 'cancelled'].includes(job.status)) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const response = await request(`/api/jobs/${id}`);
    const job = await response.json();
    if (predicate(job)) return job;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('job did not settle');
}
