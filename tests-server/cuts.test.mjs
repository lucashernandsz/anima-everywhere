import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCuts, filenameForCut } from '../shared/cuts.mjs';

const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const base = { corte: 1, titulo_hook: 'um titulo', segundos_inicio: 24.72, segundos_fim: 49.44, url_youtube: url };

test('normalizes user fields and preserves decimal seconds instead of rounded timestamps', () => {
  const [cut] = parseCuts(JSON.stringify([{ ...base, tempo_inicio: '00:25', tempo_fim: '00:49', duracao_segundos: 24.72 }]));
  assert.deepEqual(cut, base);
  assert.equal(cut.segundos_fim - cut.segundos_inicio, 24.72);
});

test('accepts long MM:SS, HH:MM:SS, decimal timestamps, minimum and maximum durations', () => {
  const [cut] = parseCuts([{ corte: 1, titulo_hook: 'titulo', tempo_inicio: '66:15', tempo_fim: '01:06:39.720' }], url);
  assert.equal(cut.segundos_inicio, 3975);
  assert.equal(cut.segundos_fim, 3999.72);
  assert.doesNotThrow(() => parseCuts([{ ...base, segundos_inicio: 0, segundos_fim: 0.1 }]));
  assert.doesNotThrow(() => parseCuts([{ ...base, segundos_inicio: 43020, segundos_fim: 43200 }]));
});

test('normalizes supported public YouTube links and gives each item URL precedence', () => {
  for (const variant of ['https://youtu.be/dQw4w9WgXcQ?t=24.72', 'https://youtube.com/watch?v=dQw4w9WgXcQ&t=25', 'https://m.youtube.com/shorts/dQw4w9WgXcQ', 'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share']) {
    assert.equal(parseCuts([{ ...base, url_youtube: variant }], 'https://example.com')[0].url_youtube, url);
  }
  const { url_youtube, ...withoutUrl } = base;
  assert.equal(parseCuts([withoutUrl], url)[0].url_youtube, url_youtube);
});

test('rejects arbitrary hosts, SSRF-like authorities, credentials, ports and malformed IDs', () => {
  const invalid = ['http://youtu.be/dQw4w9WgXcQ', 'https://youtube.com:443/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com:4318/watch?v=dQw4w9WgXcQ', 'https://user:secret@youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', 'https://youtube.com./watch?v=dQw4w9WgXcQ', 'https://127.0.0.1/watch?v=dQw4w9WgXcQ', 'file:///tmp/video', 'https://youtu.be/short', 'https://youtube.com/playlist?list=dQw4w9WgXcQ', 'https://youtube.com/watch?v=dQw4w9WgXcQ&v=abcdefghijk', 'https://youtube.com\\@example.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ\n', 'https://youtu.be/dQw4w9WgXcQ/extra', 'https://youtu.be%2eexample.com/dQw4w9WgXcQ'];
  for (const badUrl of invalid) assert.throws(() => parseCuts([{ ...base, url_youtube: badUrl }]), undefined, badUrl);
});

test('rejects incomplete, invalid, nonfinite, string, reversed and out-of-range seconds', () => {
  for (const value of [null, '24.72', 'NaN', NaN, Infinity, -1, 43201, {}, true]) {
    assert.throws(() => parseCuts([{ ...base, segundos_inicio: value }]));
    assert.throws(() => parseCuts([{ ...base, segundos_fim: value }]));
  }
  for (const [start, end] of [[0, 0], [2, 1], [0, 0.09], [0, 180.01], [43200, 43200.1]]) assert.throws(() => parseCuts([{ ...base, segundos_inicio: start, segundos_fim: end }]));
  const { segundos_fim, ...missingEnd } = base;
  assert.throws(() => parseCuts([{ ...missingEnd, tempo_fim: '00:49' }]));
  const { segundos_inicio, ...missingStart } = base;
  assert.throws(() => parseCuts([{ ...missingStart, tempo_inicio: '00:24' }]));
});

test('rejects malformed and injected timestamps', () => {
  for (const time of ['1:60', '1:60:00', '00:00; touch pwned', '-01:20', '00:NaN', '1.5:20', '12:00:01', '00:24:72', '24', '00:00:00:00']) {
    assert.throws(() => parseCuts([{ corte: 1, titulo_hook: 'titulo', tempo_inicio: time, tempo_fim: '00:30' }], url), undefined, time);
  }
});

test('validates list length, unique integer IDs and titles before work', () => {
  for (const list of [[], {}, null, 'broken', Array.from({ length: 51 }, (_, index) => ({ ...base, corte: index + 1 })), [base, base]]) assert.throws(() => parseCuts(list));
  for (const corte of [0, -1, 1.1, '1', Number.MAX_SAFE_INTEGER + 1, NaN]) assert.throws(() => parseCuts([{ ...base, corte }]));
  for (const titulo_hook of ['', ' '.repeat(10), '\u202e\u0000', 'a'.repeat(181), null]) assert.throws(() => parseCuts([{ ...base, titulo_hook }]));
  assert.equal(parseCuts(Array.from({ length: 50 }, (_, index) => ({ ...base, corte: index + 1 }))).length, 50);
});

test('sanitizes hostile Unicode separately from safe, bounded, collision-resistant filenames', () => {
  const [cut] = parseCuts([{ ...base, titulo_hook: '  Ação: ../\u202efala\u0000 "Olá" / teste!  ' }]);
  assert.equal(cut.titulo_hook, 'Ação: ../fala "Olá" / teste!');
  assert.equal(filenameForCut(cut), '01-acao-fala-ola-teste.mp4');
  assert.equal(filenameForCut({ ...cut, titulo_hook: '中文' }), '01-corte.mp4');
  assert.match(filenameForCut({ ...cut, titulo_hook: 'a'.repeat(180) }), /^01-a{110}\.mp4$/u);
  assert.notEqual(filenameForCut(cut), filenameForCut({ ...cut, corte: 2 }));
});
