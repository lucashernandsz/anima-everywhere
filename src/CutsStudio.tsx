import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Check, FileJson, LoaderCircle, Scissors, ShieldCheck, Upload } from 'lucide-react';
import { parseCuts, filenameForCut, type Cut } from '../shared/cuts.mjs';
import example from './cortes-exemplo.json?raw';

type Health = { ready: boolean; tools: Record<string, boolean>; message?: string };
type Clip = { corte: number; title: string; filename: string; url: string; duration: number };
type Job = { id: string; status: 'queued' | 'downloading' | 'processing' | 'completed' | 'failed' | 'cancelled'; message: string; completed: number; total: number; clips: Clip[]; error?: string };
const terminal = (job: Job) => ['completed', 'failed', 'cancelled'].includes(job.status);
const timestamp = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(3).padStart(6, '0')}`;
const duration = (seconds: number) => `${Number(seconds.toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} s`;
const storageKey = 'anima-everywhere-cut-job-v1';

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...options?.headers }, signal: options?.signal ?? AbortSignal.timeout(20_000) });
  if (response.status === 204) return undefined as T;
  let data;
  try { data = await response.json(); } catch { throw new Error('o serviço local não respondeu. reinicie npm run dev.'); }
  if (!response.ok) throw Object.assign(new Error(data.error || 'não foi possível acessar o serviço local.'), { status: response.status });
  return data as T;
}

function remember(id: string | null) {
  try { if (id) localStorage.setItem(storageKey, id); else localStorage.removeItem(storageKey); } catch { /* Processing works without browser storage. */ }
}

export default function CutsStudio() {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [ratio, setRatio] = useState('1:1');
  const [framing, setFraming] = useState('contain');
  const [rights, setRights] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [checking, setChecking] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [jobId, setJobId] = useState<string | null>(() => {
    try { const id = localStorage.getItem(storageKey); return id && /^[a-f0-9-]{36}$/.test(id) ? id : null; } catch { return null; }
  });
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [changing, setChanging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const locked = submitting || uncertain || Boolean(jobId && (!job || !terminal(job)));
  let cuts: Cut[] = [];
  let validation = '';
  if (text.trim()) {
    try { cuts = parseCuts(text, url.trim()); } catch (error) { validation = (error as Error).message; }
  }

  async function checkHealth() {
    setChecking(true);
    try { setHealth(await api<Health>('/api/health')); } catch { setHealth({ ready: false, tools: {}, message: 'serviço local indisponível. inicie npm run dev e tente novamente.' }); }
    finally { setChecking(false); }
  }

  useEffect(() => { void checkHealth(); }, []);
  useEffect(() => {
    if (!jobId) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const response = await fetch(`/api/jobs/${jobId}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]) });
        if (disposed) return;
        if (response.status === 404) {
          setPollError('exportação não encontrada. o serviço pode ter reiniciado ou os arquivos expiraram.');
          setJobId(null); setJob(null); remember(null); return;
        }
        if (!response.ok) throw new Error('status indisponível');
        const next = await response.json() as Job;
        if (disposed) return;
        setJob(next); setPollError('');
        if (terminal(next)) return;
      } catch { if (disposed) return; setPollError('conexão interrompida. tentando recuperar o andamento, sem reiniciar o trabalho.'); }
      if (!disposed) timer = setTimeout(() => void poll(), 1500);
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); controller.abort(); };
  }, [jobId]);

  async function recover() {
    try {
      const { job: existing } = await api<{ job: Job | null }>('/api/jobs');
      setUncertain(false);
      if (existing) { setJob(existing); setJobId(existing.id); remember(existing.id); setError(''); }
      else setError('nenhuma exportação encontrada no serviço. confira a lista antes de enviar novamente.');
    } catch { setError('não foi possível confirmar o pedido. recupere o andamento antes de enviar novamente.'); }
  }

  async function start() {
    if (locked || !cuts.length || !rights || !health?.ready) return;
    setSubmitting(true); setError(''); setPollError('');
    try {
      const result = await api<{ id: string }>('/api/jobs', { method: 'POST', body: JSON.stringify({ cuts, url: url.trim(), ratio, framing, rightsConfirmed: rights }) });
      setJob(null); setJobId(result.id); remember(result.id);
    } catch (error) {
      setError((error as Error).message);
      const status = (error as Error & { status?: number }).status;
      if (status === undefined || status === 409) {
        setUncertain(true);
        // A lost response does not prove that the server rejected the request.
        await recover();
      }
    } finally { setSubmitting(false); }
  }

  async function changeJob() {
    if (!jobId || changing) return;
    setChanging(true); setError('');
    try {
      await api(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (job && terminal(job)) { setJob(null); setJobId(null); remember(null); }
      else {
        const next = await api<Job>(`/api/jobs/${jobId}`);
        setJob(next);
      }
    } catch (error) { setError((error as Error).message); }
    finally { setChanging(false); }
  }

  async function importFile(file?: File) {
    if (!file) return;
    if (file.size > 240 * 1024) { setError('o arquivo JSON precisa ter até 240 KB.'); return; }
    try { setText(await file.text()); setError(''); } catch { setError('não foi possível ler o JSON. tente selecionar o arquivo novamente.'); }
  }

  return <>
    <section className="page-heading cuts-heading"><div><span className="prototype-tag">cortes de vídeo, no seu computador</span><h1>o trecho certo.<br />pronto para compartilhar.</h1><p>cole o link e a lista de cortes. baixe os trechos em MP4, com os nomes e o formato que você escolheu.</p></div><Scissors className="cuts-heading-icon" size={52} strokeWidth={1} aria-hidden="true" /></section>
    <div className="cuts-layout">
      <div className="cuts-inputs">
        <section className="panel">
          <div className="section-heading"><div><h2>vídeo e minutagem</h2></div><span className="subtle-tag">até 50 cortes</span></div>
          <label className="cut-label" htmlFor="youtube-link">link do vídeo <span>(opcional se estiver no JSON)</span></label>
          <input id="youtube-link" className="cut-input" type="url" value={url} disabled={locked} onChange={event => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" aria-describedby="link-hint" />
          <p className="cut-hint" id="link-hint">cada url_youtube da lista tem prioridade sobre este link. o vídeo é baixado uma vez por exportação.</p>
          <div className="cut-json-heading"><label className="cut-label" htmlFor="cuts-json">lista de cortes em JSON</label><button className="text-button" disabled={locked} onClick={() => picker.current?.click()}><Upload size={14} /> importar JSON</button></div>
          <textarea id="cuts-json" className="cut-json" value={text} disabled={locked} onChange={event => { setText(event.target.value); setError(''); }} maxLength={240 * 1024} placeholder={'[\n  {\n    "corte": 1,\n    "titulo_hook": "nome do seu corte",\n    "segundos_inicio": 24.5,\n    "segundos_fim": 55.8\n  }\n]'} spellCheck={false} aria-invalid={Boolean(validation)} aria-describedby="json-hint json-validation" />
          <p className="cut-hint" id="json-hint">segundos_inicio e segundos_fim preservam os decimais. sem eles, usamos tempo_inicio e tempo_fim em MM:SS ou HH:MM:SS.</p>
          <p id="json-validation" className={validation ? 'error-message' : 'cut-hint'} role={validation ? 'alert' : undefined}>{validation || (cuts.length ? `${cuts.length} cortes válidos. duração total: ${duration(cuts.reduce((sum, cut) => sum + cut.segundos_fim - cut.segundos_inicio, 0))}.` : 'cole sua lista ou experimente o exemplo. nenhum download começa sozinho.')}</p>
          <button className="text-button" disabled={locked} onClick={() => { setText(example); setError(''); }}><FileJson size={14} /> usar lista do exemplo com 10 cortes</button>
          <input ref={picker} type="file" className="visually-hidden" accept=".json,application/json" aria-label="selecionar lista JSON" tabIndex={-1} disabled={locked} onChange={event => { void importFile(event.target.files?.[0]); event.target.value = ''; }} />
        </section>
        {cuts.length > 0 && <section className="cut-list-section" aria-labelledby="cuts-list-title"><div className="section-heading"><div><h2 id="cuts-list-title">confira seus cortes</h2></div><span className="subtle-tag">{cuts.length} trechos</span></div><ol className="cut-list">{cuts.map(cut => <li key={cut.corte}><span className="cut-number">{String(cut.corte).padStart(2, '0')}</span><div><h3>{cut.titulo_hook}</h3><p>{timestamp(cut.segundos_inicio)} a {timestamp(cut.segundos_fim)} <span>({duration(cut.segundos_fim - cut.segundos_inicio)})</span></p><small>{filenameForCut(cut)}</small></div></li>)}</ol></section>}
      </div>
      <aside className="cuts-settings" aria-label="formato e exportação">
        <section className="panel">
          <div className="section-heading"><div><h2>como vai sair?</h2></div></div>
          <fieldset className="cut-fieldset" disabled={locked}><legend>formato dos cortes</legend><div className="ratio-options">{[{ value: '1:1', name: 'quadrado', size: '720 × 720' }, { value: '16:9', name: 'horizontal', size: '1280 × 720' }, { value: '9:16', name: 'vertical', size: '720 × 1280' }].map(item => <label key={item.value} className={`ratio-option cut-ratio ${ratio === item.value ? 'chosen' : ''}`}><input type="radio" name="cut-ratio" value={item.value} checked={ratio === item.value} onChange={() => setRatio(item.value)} aria-label={`${item.name} ${item.value}`} /><span className={`ratio-icon icon-${item.value.replace(':', '-')}`} /><strong>{item.name}</strong><small>{item.value}</small><span className="cut-dimensions">{item.size}</span></label>)}</div></fieldset>
          <fieldset className="cut-fieldset framing-options" disabled={locked}><legend>enquadramento</legend><label><input type="radio" name="framing" value="contain" checked={framing === 'contain'} onChange={() => setFraming('contain')} /><span><strong>preservar imagem inteira</strong><small>adiciona barras pretas quando necessário.</small></span></label><label><input type="radio" name="framing" value="cover" checked={framing === 'cover'} onChange={() => setFraming('cover')} /><span><strong>preencher e recortar o centro</strong><small>preenche o formato. pode cortar pessoas e textos.</small></span></label></fieldset>
          <p className="cut-hint">MP4 com vídeo H.264 e áudio AAC. o título vira nome do arquivo, não texto sobre o vídeo. precisão limitada aos quadros do vídeo.</p>
          <div className="cut-service" role="status">{checking ? <><LoaderCircle size={15} className="spin" /> verificando ferramentas locais…</> : health?.ready ? <><Check size={15} /> ferramentas locais prontas</> : <span>{health?.message}<br /><code>npm run setup:tools</code><br /><button className="text-button" onClick={() => void checkHealth()}>verificar novamente</button></span>}</div>
          <label className="cut-consent"><input type="checkbox" checked={rights} disabled={locked} onChange={event => setRights(event.target.checked)} /><span>tenho os direitos ou autorização para baixar e recortar estes vídeos. o download também deve respeitar os termos do YouTube.</span></label>
          <button className="primary-button cut-start" disabled={locked || !cuts.length || !rights || !health?.ready || checking} onClick={() => void start()}>{submitting ? <LoaderCircle size={17} className="spin" /> : <Scissors size={17} />} baixar e gerar cortes</button>
          <p className="cut-hint">processamento local, um corte por vez. sem conta Google conectada. baixar do YouTube exige internet e pode ser bloqueado.</p>
        </section>
        {(jobId || job || error || pollError || uncertain) && <section className="panel cut-progress" aria-labelledby="export-title"><div className="section-heading"><div><h2 id="export-title">sua exportação</h2></div></div>
          <div role="status" aria-live="polite"><p className="cut-status">{job?.message || (jobId ? 'recuperando andamento…' : '')}</p>{job && <><progress max={job.total} value={job.completed} aria-label="cortes concluídos" /><p className="cut-hint">{job.completed} de {job.total} cortes concluídos{job.status === 'downloading' ? '. o download do vídeo completo pode demorar.' : '.'}</p></>}</div>
          {(error || job?.error) && <p className="error-message" role="alert">{error || job?.error}</p>}
          {pollError && <p className="error-message" role="alert">{pollError}</p>}
          {uncertain && <button className="text-button" onClick={() => void recover()}>recuperar pedido sem reenviar</button>}
          {job?.clips.length ? <ul className="cut-downloads">{job.clips.map(clip => <li key={clip.corte}><strong>{clip.title}</strong><a className="cut-download" href={clip.url} download={clip.filename}><ArrowDownToLine size={16} /> baixar corte {String(clip.corte).padStart(2, '0')} <span>({duration(clip.duration)})</span></a></li>)}</ul> : null}
          {jobId && <button className="text-button" disabled={changing} onClick={() => { if (!job || !terminal(job) || window.confirm('excluir os arquivos desta exportação do serviço local? os arquivos já baixados não serão removidos.')) void changeJob(); }}>{changing ? 'aguarde…' : job && terminal(job) ? 'excluir exportação local' : 'cancelar processamento'}</button>}
          {job?.clips.length ? <p className="cut-hint">baixe os arquivos antes de fechar o serviço. resultados expiram após 24 horas; reiniciar o serviço perde o acesso pela interface.</p> : null}
        </section>}
        <p className="cut-privacy"><ShieldCheck size={16} /><span>o link é consultado no YouTube. vídeos e cortes ficam neste computador, sem envio a serviços de edição. não contornamos login, DRM ou restrições de acesso.</span></p>
      </aside>
    </div>
  </>;
}
