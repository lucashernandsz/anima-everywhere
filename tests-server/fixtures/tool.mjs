#!/usr/bin/env node
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const name = path.basename(process.argv[1]);
const value = (flag) => args[args.indexOf(flag) + 1];
if (args.includes('--hang')) {
  if (args.includes('--ignore-term')) process.on('SIGTERM', () => {});
  setInterval(() => {}, 1000);
} else if (args.includes('--overflow')) {
  process.stdout.write('x'.repeat(2 * 1024 * 1024));
} else if (args.includes('--fail')) {
  process.stderr.write('https://secret.invalid?token=private');
  process.exitCode = 1;
} else if (args.includes('-version') || args.includes('--version')) {
  console.log('fixture 1.0');
} else {
  await appendFile(path.join(path.dirname(process.argv[1]), 'calls.jsonl'), `${JSON.stringify({ name, args })}\n`);
  if (name === 'yt-dlp') {
    const target = value('--output').replace('%(ext)s', 'mkv');
    const duration = args.at(-1).includes('abcdefghijk') ? 2 : args.at(-1).includes('longvideo12') ? 43200.1 : 120;
    await writeFile(target, JSON.stringify({ duration, width: 640, height: 360 }));
    console.log(target);
  } else if (name === 'ffprobe') {
    const data = JSON.parse(await readFile(args.at(-1), 'utf8'));
    console.log(JSON.stringify({ format: { duration: String(data.duration) }, streams: [{ codec_type: 'video', ...data }] }));
  } else if (name === 'ffmpeg') {
    if (args.at(-1).includes('-falha.')) { process.stderr.write('secret fixture error'); process.exitCode = 1; }
    else {
      const [width, height] = /scale=(\d+):(\d+)/u.exec(value('-vf')).slice(1).map(Number);
      const truncated = args.at(-1).includes('truncated');
      const wrongSize = args.at(-1).includes('wrong-size');
      await writeFile(args.at(-1), JSON.stringify({ duration: Number(value('-t')) - (truncated ? 0.5 : 0), width: wrongSize ? 16 : width, height }));
    }
  }
}
