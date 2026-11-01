import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir, writeFile, readdir, stat, utimes, open, symlink, copyFile, chmod, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { filenameForCut } from '../shared/cuts.mjs';
import { start, fakeTools, temporary, waitFor, headers, body, cut, url } from './helpers.mjs';

const noTools = { ffmpeg: '/nonexistent/ffmpeg', ffprobe: '/nonexistent/ffprobe', ytdlp: '/nonexistent/yt-dlp' };
const idle = async () => {};

test('health honestly reports missing tools and jobs cannot start', async (t) => {
  const { request, submit } = await start(t, { tools: noTools });
  const health = await (await request('/api/health')).json();
  assert.equal(health.ready, false);
  assert.deepEqual(health.tools, { ffmpeg: false, ffprobe: false, ytdlp: false });
  assert.equal((await submit()).status, 503);
});

test('health rediscovers tools installed after startup without losing explicit overrides', async (t) => {
  const bin = await temporary(t);
  const tools = Object.fromEntries([['ffmpeg', 'ffmpeg'], ['ffprobe', 'ffprobe'], ['ytdlp', 'yt-dlp']].map(([key, name]) => [key, path.join(bin, name)]));
  const { request, submit } = await start(t, { tools });
  assert.deepEqual((await (await request('/api/health')).json()).tools, { ffmpeg: false, ffprobe: false, ytdlp: false });
  assert.equal((await submit()).status, 503);
  for (const target of Object.values(tools)) {
    await copyFile(new URL('./fixtures/tool.mjs', import.meta.url), target);
    await chmod(target, 0o700);
  }
  assert.equal((await (await request('/api/health')).json()).ready, true);
  const response = await submit();
  assert.equal(response.status, 202);
  const job = await waitFor(request, (await response.json()).id);
  assert.equal(job.status, 'completed', job.error);
});

test('GET jobs recovers active or latest retained job, never retries mutations, and rejects external Origin', async (t) => {
  let finish;
  let executions = 0;
  const { request, submit } = await start(t, { tools: noTools, worker: async ({ signal, update }) => {
    executions += 1;
    update('processing', 'teste de recuperacao.');
    await new Promise((resolve) => { finish = resolve; signal.addEventListener('abort', resolve, { once: true }); });
  } });
  assert.deepEqual(await (await request('/api/jobs')).json(), { job: null });
  assert.equal((await request('/api/jobs', { headers: { Origin: 'https://evil.test' } })).status, 403);
  const { id } = await (await submit()).json();
  let recovered = await (await request('/api/jobs', { headers })).json();
  assert.equal(recovered.job.id, id);
  assert.equal(recovered.job.status, 'processing');
  assert.deepEqual(recovered.job, await (await request(`/api/jobs/${id}`)).json());
  finish();
  await waitFor(request, id);
  await new Promise((resolve) => setTimeout(resolve, 30));
  recovered = await (await request('/api/jobs')).json();
  assert.equal(recovered.job.id, id);
  assert.equal(recovered.job.status, 'completed');
  const second = await submit();
  assert.equal(second.status, 202);
  const secondId = (await second.json()).id;
  assert.equal((await (await request('/api/jobs')).json()).job.id, secondId);
  await request(`/api/jobs/${secondId}`, { method: 'DELETE', headers });
  await waitFor(request, secondId);
  await new Promise((resolve) => setTimeout(resolve, 30));
  await request(`/api/jobs/${secondId}`, { method: 'DELETE', headers });
  assert.equal((await (await request('/api/jobs')).json()).job.id, id);
  await request(`/api/jobs/${id}`, { method: 'DELETE', headers });
  assert.deepEqual(await (await request('/api/jobs')).json(), { job: null });
  assert.equal(executions, 2);
});

test('Host, Origin, mutation content type and missing Origin are enforced', async (t) => {
  const { request, submit, base } = await start(t, { tools: noTools, worker: idle });
  for (const origin of ['https://evil.test', 'null', 'http://localhost:5174', 'http://localhost:5173.evil.test']) {
    assert.equal((await request('/api/health', { headers: { Origin: origin } })).status, 403);
  }
  const wrongHost = await new Promise((resolve, reject) => {
    http.get(`${base}/api/health`, { headers: { Host: 'evil.test' } }, (response) => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(wrongHost, 403);
  assert.equal((await request('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, 403);
  assert.equal((await request('/api/jobs', { method: 'POST', headers: { Origin: headers.Origin, 'Content-Type': 'text/plain' }, body: JSON.stringify(body) })).status, 415);
  assert.equal((await request('/api/jobs', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await request('/api/health', { headers: { Origin: 'http://127.0.0.1:4173' } })).status, 200);
  const health = await request('/api/health');
  assert.equal(health.headers.get('access-control-allow-origin'), null);
  assert.equal((await submit()).status, 202);
});

test('refuses non-loopback listeners', async (t) => {
  const { server } = await start(t, { tools: noTools });
  assert.throws(() => server.listen(0, '0.0.0.0'), /127\.0\.0\.1/u);
  assert.throws(() => server.listen({ port: 0, host: '0.0.0.0' }), /porta TCP/u);
});

test('rejects invalid and oversized bodies before worker execution', async (t) => {
  let calls = 0;
  const { request, submit } = await start(t, { tools: noTools, worker: async () => { calls += 1; } });
  for (const invalid of [null, [], { ...body, rightsConfirmed: false }, { ...body, ratio: '4:3' }, { ...body, framing: 'arbitrary' }, { ...body, cuts: [cut, cut] }, { ...body, cuts: [cut, { ...cut, corte: 2, segundos_fim: -1 }] }, { ...body, cuts: JSON.stringify([cut]) }]) {
    assert.equal((await submit(invalid)).status, 400);
  }
  assert.equal((await request('/api/jobs', { method: 'POST', headers, body: '{' })).status, 400);
  assert.equal((await request('/api/jobs', { method: 'POST', headers, body: JSON.stringify({ padding: 'x'.repeat(257 * 1024) }) })).status, 413);
  assert.equal(calls, 0);
});

test('one admission lock prevents concurrent requests and remains busy until cancellation settles', async (t) => {
  let calls = 0;
  const { submit, request } = await start(t, { tools: noTools, worker: async ({ signal, update }) => {
    calls += 1;
    update('downloading', 'teste local.');
    await new Promise((resolve) => signal.addEventListener('abort', () => setTimeout(resolve, 100), { once: true }));
  } });
  const responses = await Promise.all([submit(), submit(), submit()]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [202, 409, 409]);
  const { id } = await responses.find((response) => response.status === 202).json();
  assert.equal(calls, 1);
  assert.equal((await request(`/api/jobs/${id}`, { method: 'DELETE', headers })).status, 204);
  assert.equal((await submit()).status, 409);
  assert.equal((await waitFor(request, id)).status, 'cancelled');
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal((await request(`/api/jobs/${id}`, { method: 'DELETE', headers })).status, 204);
  assert.equal((await request(`/api/jobs/${id}`)).status, 404);
});

test('slow body holds admission lock before validation finishes', async (t) => {
  const { base, submit } = await start(t, { tools: noTools, worker: idle });
  const slow = http.request(`${base}/api/jobs`, { method: 'POST', headers });
  const response = once(slow, 'response');
  slow.write('{');
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal((await submit()).status, 409);
  slow.end('broken}');
  const [result] = await response;
  result.resume();
  assert.equal(result.statusCode, 400);
});

test('real worker with fixture tools downloads each unique video once and encodes accurate arguments', async (t) => {
  const { tools, calls } = await fakeTools(t);
  const { submit, request, directory } = await start(t, { tools });
  assert.equal((await (await request('/api/health')).json()).ready, true);
  const second = { ...cut, corte: 2, titulo_hook: 'segundo', segundos_inicio: 50.01, segundos_fim: 51.11 };
  const third = { ...cut, corte: 3, titulo_hook: 'terceiro', segundos_inicio: 0, segundos_fim: 1, url_youtube: 'https://youtu.be/abcdefghijk' };
  const response = await submit({ ...body, cuts: [cut, second, third], ratio: '9:16', framing: 'cover' });
  assert.equal(response.status, 202);
  const { id } = await response.json();
  const job = await waitFor(request, id);
  assert.equal(job.status, 'completed', job.error);
  assert.equal(job.completed, 3);
  assert.equal(job.total, 3);
  assert.deepEqual(Object.keys(job).sort(), ['clips', 'completed', 'id', 'message', 'status', 'total']);
  assert.deepEqual(Object.keys(job.clips[0]).sort(), ['corte', 'duration', 'filename', 'title', 'url']);
  assert.equal(job.clips[0].duration, 24.72);
  const log = await calls();
  const downloads = log.filter((entry) => entry.name === 'yt-dlp');
  assert.equal(downloads.length, 2);
  for (const { args } of downloads) {
    for (const flag of ['--ignore-config', '--no-plugin-dirs', '--no-playlist', '--no-remote-components', '--max-filesize', '--no-cache-dir']) assert.ok(args.includes(flag));
    assert.equal(args[args.indexOf('--js-runtimes') + 1], `node:${process.execPath}`);
    assert.equal(args[args.indexOf('-f') + 1], 'bv*[height<=720]+ba/b[height<=720]');
    for (const [flag, value] of [['--socket-timeout', '30'], ['--retries', '3'], ['--fragment-retries', '3'], ['--concurrent-fragments', '1'], ['--match-filter', '!is_live & duration <= 43200']]) assert.equal(args[args.indexOf(flag) + 1], value);
    assert.ok(!args.some((arg) => /cookie|password/iu.test(arg)));
  }
  const encoding = log.filter((entry) => entry.name === 'ffmpeg');
  assert.equal(encoding.length, 3);
  const args = encoding[0].args;
  for (const [flag, expected] of [['-ss', '24.72'], ['-t', '24.72'], ['-threads', '2'], ['-c:v', 'libx264'], ['-protocol_whitelist', 'file,pipe'], ['-r', '30'], ['-pix_fmt', 'yuv420p']]) assert.equal(args[args.indexOf(flag) + 1], expected);
  assert.match(args[args.indexOf('-vf') + 1], /scale=720:1280:.*crop=720:1280/u);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  assert.equal((await stat(path.join(directory, `job-${id}`))).mode & 0o777, 0o700);
  const download = await request(job.clips[0].url);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'video/mp4');
  assert.match(download.headers.get('content-disposition'), /attachment;.*filename\*=UTF-8''01-acao-local\.mp4/u);
  assert.equal(JSON.parse(await download.text()).width, 720);
  // DELETE waits for final cleanup before removing a terminal job.
  assert.equal((await request(`/api/jobs/${id}`, { method: 'DELETE', headers })).status, 204);
  assert.equal((await request(job.clips[0].url)).status, 404);
  assert.deepEqual(await readdir(directory), []);
});

test('failed encoding keeps earlier completed clips downloadable and removes sources', async (t) => {
  const { tools } = await fakeTools(t);
  const { submit, request, directory } = await start(t, { tools });
  const { id } = await (await submit({ ...body, cuts: [cut, { ...cut, corte: 2, titulo_hook: 'falha' }] })).json();
  const job = await waitFor(request, id);
  assert.equal(job.status, 'failed');
  assert.equal(job.completed, 1);
  assert.equal(job.total, 2);
  assert.ok(!job.error.includes('secret'));
  assert.equal((await request(job.clips[0].url)).status, 200);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(await readdir(path.join(directory, `job-${id}`)), [filenameForCut(cut)]);
});

test('rejects requested intervals beyond available source before encoding', async (t) => {
  const { tools, calls } = await fakeTools(t);
  const { request, submit } = await start(t, { tools });
  const { id } = await (await submit({ ...body, cuts: [{ ...cut, url_youtube: 'https://youtu.be/abcdefghijk' }] })).json();
  const job = await waitFor(request, id);
  assert.equal(job.status, 'failed');
  assert.match(job.error, /ultrapassa/u);
  assert.equal(job.clips.length, 0);
  assert.equal((await calls()).filter((entry) => entry.name === 'ffmpeg').length, 0);
});

test('finite sources longer than 12 hours are rejected even if metadata filtering is bypassed', async (t) => {
  const { tools, calls } = await fakeTools(t);
  const { request, submit } = await start(t, { tools });
  const { id } = await (await submit({ ...body, cuts: [{ ...cut, url_youtube: 'https://youtu.be/longvideo12' }] })).json();
  const job = await waitFor(request, id);
  assert.equal(job.status, 'failed');
  assert.match(job.error, /12 horas/u);
  assert.equal(job.completed, 0);
  assert.equal((await calls()).filter((entry) => entry.name === 'ffmpeg').length, 0);
});

test('files are allowlisted, not arbitrary paths, and reject untrusted origins', async (t) => {
  const { tools } = await fakeTools(t);
  const { request, submit } = await start(t, { tools });
  const { id } = await (await submit()).json();
  const job = await waitFor(request, id);
  for (const target of ['source-dQw4w9WgXcQ.mkv', '%2e%2e%2fsecret.mp4', 'unknown.mp4', '%', `${filenameForCut(cut)}%00`]) assert.equal((await request(`/api/jobs/${id}/files/${target}`)).status, 404);
  assert.equal((await request(job.clips[0].url, { headers: { Origin: 'https://evil.test' } })).status, 403);
  assert.equal((await request(`/api/jobs/${id}`, { method: 'DELETE', headers: { Origin: headers.Origin } })).status, 415);
  assert.equal((await request('/api/jobs/not-a-job')).status, 404);
});

test('startup removes only expired isolated job directories', async (t) => {
  const directory = await temporary(t);
  const stale = path.join(directory, `job-${randomUUID()}`);
  const recent = path.join(directory, `job-${randomUUID()}`);
  const unrelated = path.join(directory, 'keep-me');
  await mkdir(stale); await mkdir(recent); await mkdir(unrelated);
  await writeFile(path.join(stale, 'source.mkv'), 'fixture');
  const old = new Date(Date.now() - 25 * 60 * 60_000);
  await utimes(stale, old, old);
  const { request } = await start(t, { dataDirectory: directory, tools: noTools });
  await request('/api/health');
  assert.deepEqual((await readdir(directory)).sort(), [path.basename(recent), 'keep-me'].sort());
});

test('cancelled workers cannot publish later clips or overwrite terminal state', async (t) => {
  const { request, submit } = await start(t, { tools: noTools, worker: async ({ signal, addClip, update }) => {
    await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
    update('completed', 'late');
    addClip({ corte: 1, title: 'late', filename: filenameForCut(cut), duration: 1 });
  } });
  const { id } = await (await submit()).json();
  await request(`/api/jobs/${id}`, { method: 'DELETE', headers });
  const job = await waitFor(request, id);
  assert.equal(job.status, 'cancelled');
  assert.equal(job.completed, 0);
});

test('disk admission and per-source budgets reject sparse oversized files without allocating gigabytes', async (t) => {
  const { request, submit, directory } = await start(t, { tools: noTools, worker: idle });
  const occupied = await open(path.join(directory, 'occupied.bin'), 'w');
  await occupied.truncate(8 * 1024 ** 3 + 1);
  await occupied.close();
  assert.equal((await submit()).status, 507);
  assert.equal((await request('/api/jobs/unknown')).status, 404);
  const second = await start(t, { tools: noTools, worker: async ({ directory: jobDirectory, checkBudget }) => {
    const source = await open(path.join(jobDirectory, 'source-dQw4w9WgXcQ.mkv'), 'w');
    await source.truncate(4 * 1024 ** 3 + 1);
    await source.close();
    await checkBudget();
  } });
  const { id } = await (await second.submit()).json();
  const job = await waitFor(second.request, id);
  assert.equal(job.status, 'failed');
  assert.match(job.error, /4 GB/u);
});

test('allowlisted filename cannot expose a symlink outside job storage', async (t) => {
  const external = path.join(await temporary(t), 'private.txt');
  await writeFile(external, 'private fixture');
  const { request, submit } = await start(t, { tools: noTools, worker: async ({ directory, addClip }) => {
    const filename = filenameForCut(cut);
    await symlink(external, path.join(directory, filename));
    addClip({ corte: cut.corte, title: cut.titulo_hook, filename, duration: 24.72 });
  } });
  const { id } = await (await submit()).json();
  const job = await waitFor(request, id);
  assert.equal((await request(job.clips[0].url)).status, 404);
});

test('symlinked job directory cannot expose otherwise allowlisted files', async (t) => {
  const { request, submit, directory } = await start(t, { tools: noTools, worker: async ({ directory: target, addClip }) => {
    const filename = filenameForCut(cut);
    await writeFile(path.join(target, filename), 'fixture');
    addClip({ corte: cut.corte, title: cut.titulo_hook, filename, duration: 24.72 });
  } });
  const { id } = await (await submit()).json();
  const job = await waitFor(request, id);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const target = path.join(directory, `job-${id}`);
  const moved = path.join(directory, 'moved');
  await rename(target, moved);
  await symlink(moved, target);
  assert.equal((await request(job.clips[0].url)).status, 404);
});

test('symlinked storage root is rejected before exposing any data', async (t) => {
  const parent = await temporary(t);
  const target = path.join(parent, 'actual');
  await mkdir(target);
  const directory = path.join(parent, 'linked');
  await symlink(target, directory);
  const { request } = await start(t, { dataDirectory: directory, tools: noTools });
  assert.equal((await request('/api/jobs')).status, 500);
});
