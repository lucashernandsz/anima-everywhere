import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile, stat, readFile, symlink } from 'node:fs/promises';
import { runProcess, resolveTools, probeMedia, encodeCut, DIMENSIONS } from '../server/media.mjs';
import { fakeTools, temporary, cut } from './helpers.mjs';

test('subprocess timeout, cancellation, output bounds and safe errors', async (t) => {
  const { tools } = await fakeTools(t);
  await assert.rejects(runProcess(tools.ffmpeg, ['--hang'], { timeout: 100, label: 'teste' }), /tempo limite/u);
  const controller = new AbortController();
  const running = runProcess(tools.ffmpeg, ['--hang', '--ignore-term'], { signal: controller.signal });
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(running, /cancelada/u);
  await assert.rejects(runProcess(tools.ffmpeg, ['--overflow']), /dados demais/u);
  await assert.rejects(runProcess(tools.ffmpeg, ['--fail']), (error) => !error.message.includes('private') && !error.message.includes('secret.invalid'));
  await assert.rejects(runProcess('/nonexistent/tool', []), /instalacao local/u);
  await assert.rejects(runProcess(tools.ffmpeg, [], { signal: AbortSignal.abort() }), /cancelada/u);
});

test('probe rejects invalid, zero-duration and non-video sources', async (t) => {
  const { tools } = await fakeTools(t);
  const directory = await temporary(t);
  const source = path.join(directory, 'source.mkv');
  await writeFile(source, JSON.stringify({ duration: 0, width: 640, height: 360 }));
  await assert.rejects(probeMedia(source, tools), /duracao finita/u);
  await writeFile(source, JSON.stringify({ duration: 10, width: 0, height: 0 }));
  await assert.rejects(probeMedia(source, tools), /duracao finita/u);
  await writeFile(source, JSON.stringify({ duration: 10, width: 640, height: 360, codec_type: 'audio' }));
  await assert.rejects(probeMedia(source, tools), /duracao finita/u);
  await writeFile(source, JSON.stringify({ duration: 'Infinity', width: 640, height: 360 }));
  await assert.rejects(probeMedia(source, tools), /duracao finita/u);
});

test('verification rejects truncated and wrong-size output instead of publishing success', async (t) => {
  const { tools } = await fakeTools(t);
  const directory = await temporary(t);
  const source = path.join(directory, 'source.mkv');
  await writeFile(source, '{}');
  for (const name of ['truncated', 'wrong-size']) {
    const output = path.join(directory, `${name}.mp4`);
    await assert.rejects(encodeCut({ source, output, cut, ratio: '1:1', framing: 'contain', tools }), /nao corresponde/u);
    await assert.rejects(stat(output), { code: 'ENOENT' });
  }
});

test('media tools never read symlinked local input', async (t) => {
  const { tools, calls } = await fakeTools(t);
  const directory = await temporary(t);
  const source = path.join(directory, 'actual.mkv');
  const linked = path.join(directory, 'linked.mkv');
  await writeFile(source, '{}');
  await symlink(source, linked);
  await assert.rejects(probeMedia(linked, tools), /link simbolico/u);
  await assert.rejects(encodeCut({ source: linked, output: path.join(directory, 'output.mp4'), cut, ratio: '1:1', framing: 'contain', tools }), /link simbolico/u);
  assert.deepEqual(await calls(), []);
});

test('all ratios and both framing modes use bounded target sizes', async (t) => {
  const { tools, calls } = await fakeTools(t);
  const directory = await temporary(t);
  const source = path.join(directory, 'source.mkv');
  await writeFile(source, '{}');
  for (const ratio of Object.keys(DIMENSIONS)) {
    for (const framing of ['contain', 'cover']) {
      const output = path.join(directory, `${ratio.replace(':', '-')}-${framing}.mp4`);
      const result = await encodeCut({ source, output, cut, ratio, framing, tools });
      assert.deepEqual([result.width, result.height], DIMENSIONS[ratio]);
      assert.ok((await stat(output)).isFile());
    }
  }
  const filters = (await calls()).filter((call) => call.name === 'ffmpeg').map((call) => call.args[call.args.indexOf('-vf') + 1]);
  assert.equal(filters.filter((filter) => filter.includes('pad=')).length, 3);
  assert.equal(filters.filter((filter) => filter.includes('crop=')).length, 3);
  assert.ok(filters.every((filter) => filter.startsWith('scale=iw*sar:ih,setsar=1,') && filter.includes('force_divisible_by=2')));
});

test('real ffmpeg integration: synthetic local fixture, decimal recode, three ratios, no network', async (t) => {
  const tools = await resolveTools();
  if (!tools.ffmpeg || !tools.ffprobe) return t.skip('ffmpeg/ffprobe not installed locally');
  const directory = await temporary(t);
  const source = path.join(directory, 'synthetic.mp4');
  await runProcess(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '3', '-c:v', 'libx264', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', source]);
  for (const [index, ratio] of Object.keys(DIMENSIONS).entries()) {
    const output = path.join(directory, `real-${index}.mp4`);
    const result = await encodeCut({ source, output, cut: { ...cut, segundos_inicio: 0.72, segundos_fim: 2.17 }, ratio, framing: index === 1 ? 'cover' : 'contain', tools });
    assert.ok(Math.abs(result.duration - 1.45) < 0.09);
    assert.deepEqual([result.width, result.height], DIMENSIONS[ratio]);
    assert.equal((await readFile(output)).subarray(4, 8).toString(), 'ftyp');
  }
});

test('real ffmpeg preserves odd-size anamorphic display aspect without reset_sar, no network', async (t) => {
  const tools = await resolveTools();
  if (!tools.ffmpeg || !tools.ffprobe) return t.skip('ffmpeg/ffprobe not installed locally');
  const directory = await temporary(t);
  for (const sar of [1, 2]) {
    const source = path.join(directory, `source-sar-${sar}.mkv`);
    await runProcess(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `testsrc=size=641x360:rate=30,format=yuv444p,lut=y=235:u=128:v=128,setsar=${sar}`, '-t', '1', '-c:v', 'ffv1', '-threads', '2', '-filter_threads', '2', source]);
    const original = JSON.parse(await runProcess(tools.ffprobe, ['-v', 'error', '-show_entries', 'stream=width,height,sample_aspect_ratio', '-of', 'json', source]));
    assert.equal(original.streams[0].width, 641);
    assert.equal(original.streams[0].sample_aspect_ratio, `${sar}:1`);
    for (const framing of ['contain', 'cover']) {
      const output = path.join(directory, `${sar}-${framing}.mp4`);
      await encodeCut({ source, output, cut: { ...cut, segundos_inicio: 0.12, segundos_fim: 0.62 }, ratio: '1:1', framing, tools });
      const info = JSON.parse(await runProcess(tools.ffprobe, ['-v', 'error', '-show_entries', 'stream=sample_aspect_ratio', '-of', 'json', output]));
      assert.equal(info.streams[0].sample_aspect_ratio, '1:1');
      const raw = path.join(directory, `${sar}-${framing}.gray`);
      await runProcess(tools.ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-protocol_whitelist', 'file,pipe', '-i', output, '-frames:v', '1', '-threads', '2', '-filter_threads', '2', '-pix_fmt', 'gray', '-f', 'rawvideo', raw]);
      const pixels = await readFile(raw);
      let whiteRows = 0;
      for (let y = 0; y < 720; y += 1) if (pixels[y * 720 + 360] > 200) whiteRows += 1;
      const expectedRows = sar === 1 ? 404 : 202;
      if (framing === 'contain') assert.ok(Math.abs(whiteRows - expectedRows) <= 2, `expected ${expectedRows} white rows, got ${whiteRows}`);
      else assert.equal(whiteRows, 720);
    }
  }
});
