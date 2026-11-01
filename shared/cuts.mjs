const MAX_TIME = 12 * 60 * 60;

function fail(message) {
  throw new Error(message);
}

function youtubeUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/u.test(value)) {
    fail('informe um link publico valido do YouTube.');
  }
  let url;
  try { url = new URL(value); } catch { fail('informe um link publico valido do YouTube.'); }
  // Check the original authority too: URL normalizes an explicit default port away.
  const authority = /^https:\/\/([^/?#]+)/u.exec(value)?.[1];
  if (!authority || authority.includes(':') || authority.includes('@') || url.protocol !== 'https:' || url.username || url.password || url.port) {
    fail('use um link HTTPS do YouTube, sem credenciais ou porta.');
  }
  let id;
  if (url.hostname === 'youtu.be' && authority === 'youtu.be') {
    id = /^\/([A-Za-z0-9_-]{11})\/?$/u.exec(url.pathname)?.[1];
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname) && authority === url.hostname) {
    if (url.pathname === '/watch' && url.searchParams.getAll('v').length === 1) id = url.searchParams.get('v');
    else id = /^\/(?:shorts|live)\/([A-Za-z0-9_-]{11})\/?$/u.exec(url.pathname)?.[1];
  }
  if (!id || !/^[A-Za-z0-9_-]{11}$/u.test(id)) fail('o link precisa identificar um video publico do YouTube.');
  return `https://www.youtube.com/watch?v=${id}`;
}

function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{1,5}:\d{2}(?::\d{2})?(?:\.\d{1,6})?$/u.test(value)) {
    fail('use tempos no formato MM:SS ou HH:MM:SS.');
  }
  const parts = value.split(':').map(Number);
  if (parts.at(-1) >= 60 || (parts.length === 3 && parts[1] >= 60)) fail('minutos e segundos do horario sao invalidos.');
  return parts.reduce((total, part) => total * 60 + part, 0);
}

/** Validate the entire list before any network or media work. Browser-safe. */
export function parseCuts(input, fallbackUrl = '') {
  let items = input;
  if (typeof input === 'string') {
    try { items = JSON.parse(input); } catch { fail('a lista de cortes precisa ser um JSON valido.'); }
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) fail('informe entre 1 e 50 cortes.');
  const ids = new Set();
  return items.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail('cada corte precisa ser um objeto.');
    const { corte } = item;
    if (!Number.isSafeInteger(corte) || corte <= 0 || ids.has(corte)) fail('cada corte precisa de um numero inteiro positivo e unico.');
    ids.add(corte);
    if (typeof item.titulo_hook !== 'string' || item.titulo_hook.length > 180) fail('o titulo deve ter no maximo 180 caracteres.');
    const title = item.titulo_hook.normalize('NFKC').replace(/[\p{Cc}\p{Cf}\p{Cs}]/gu, '').replace(/\s+/gu, ' ').trim();
    if (!title || title.length > 180) fail('informe um titulo valido com ate 180 caracteres.');
    const hasStart = Object.hasOwn(item, 'segundos_inicio');
    const hasEnd = Object.hasOwn(item, 'segundos_fim');
    if (hasStart !== hasEnd) fail('informe segundos_inicio e segundos_fim juntos.');
    const start = hasStart ? item.segundos_inicio : timestamp(item.tempo_inicio);
    const end = hasEnd ? item.segundos_fim : timestamp(item.tempo_fim);
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < 0 || start > MAX_TIME || end > MAX_TIME) {
      fail('os tempos devem ser numeros finitos entre zero e 12 horas.');
    }
    const duration = end - start;
    if (duration < 0.1 - 1e-9 || duration > 180 + 1e-9) fail('cada corte deve durar entre 0.1 e 180 segundos.');
    return { corte, titulo_hook: title, segundos_inicio: start, segundos_fim: end, url_youtube: youtubeUrl(item.url_youtube ?? fallbackUrl) };
  });
}

export function filenameForCut(cut) {
  const slug = cut.titulo_hook.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 110).replace(/-+$/u, '') || 'corte';
  return `${String(cut.corte).padStart(2, '0')}-${slug}.mp4`;
}
