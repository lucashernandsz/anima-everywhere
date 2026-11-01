import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import interLicense from '@fontsource/inter/LICENSE?url';
import zillaLicense from '@fontsource/zilla-slab/LICENSE?url';
import CutsStudio from './CutsStudio';
import {
  ArrowDownToLine, ArrowRight, AudioLines, Check, ChevronRight, CircleHelp,
  Clapperboard, Clock3, FileAudio, FolderOpen, Headphones, LoaderCircle,
  Monitor, Pause, Play, Plus, ShieldCheck, Sparkles,
  Upload, WandSparkles, X,
} from 'lucide-react';

const styles = [
  { id: 'collage', name: 'colagem criativa', description: 'texturas, recortes e novas conexões.', label: 'um pouco de inesperado' },
  { id: 'line', name: 'traço livre', description: 'ideias que encontram seu próprio caminho.', label: 'deixe a ideia fluir' },
  { id: 'shapes', name: 'formas em movimento', description: 'cor e ritmo em uma conversa visual.', label: 'sinta esse ritmo' },
] as const;
type StyleId = typeof styles[number]['id'];
type AudioSource = { url: string; name: string; duration: number; peaks: number[]; demo: boolean };
type Draft = { id: string; title: string; audio: string; start: number; end: number; style: StyleId; ratio: string; date: string };
const storageKey = 'anima-everywhere-drafts-v1';
const placeholderPeaks = Array.from({ length: 100 }, (_, i) => .12 + Math.abs(Math.sin(i * 1.73) * Math.cos(i * .29)) * .85);
const time = (value: number) => `${Math.floor(value / 60).toString().padStart(2, '0')}:${Math.floor(value % 60).toString().padStart(2, '0')}`;

function readDrafts(): Draft[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Draft => item && typeof item.id === 'string'
      && typeof item.title === 'string' && typeof item.audio === 'string'
      && typeof item.start === 'number' && typeof item.end === 'number'
      && typeof item.date === 'string' && ['16:9', '9:16', '1:1'].includes(item.ratio)
      && styles.some(style => style.id === item.style));
  } catch { return []; }
}

function Artwork({ kind, playing = false, compact = false }: { kind: StyleId; playing?: boolean; compact?: boolean }) {
  return <div className={`artwork art-${kind} ${playing ? 'is-playing' : ''} ${compact ? 'compact' : ''}`} aria-hidden="true">
    <svg viewBox="0 0 600 400" fill="none" xmlns="http://www.w3.org/2000/svg">
      {kind === 'collage' ? <>
        <path d="M-40 360C50 180 160 388 300 280C460 150 470 90 640 150V440H-40Z" fill="#c9cebf" />
        <path d="m438 5 22 57 55-25-26 55 54 28-61 6 7 60-40-45-43 43 10-61-60-10 55-25-22-57 49 37Z" fill="#d7cdaa" />
        <g className="orbit"><circle cx="300" cy="203" r="104" fill="#aeb9a1" /><circle cx="300" cy="203" r="69" fill="#40483e" /><circle cx="300" cy="203" r="51" stroke="#939c8e" strokeWidth="1.5" /><circle cx="300" cy="203" r="35" stroke="#939c8e" strokeWidth="1.5" /><circle cx="300" cy="203" r="16" fill="#f6f3e8" /><circle cx="300" cy="203" r="4" fill="#40483e" /></g>
        <g transform="rotate(-16 150 170)"><rect x="70" y="108" width="100" height="134" rx="3" fill="#fffef8" /><path d="M85 205c30-70 28-50 48-10l22-48v78H85Z" fill="#b5ad91" /><circle cx="107" cy="143" r="12" fill="#c9cebf" /></g>
        <path d="M425 229c-19 39-18 66 10 75 30 8 42-31 19-34-28-3-10 44 16 55" stroke="#40483e" strokeWidth="4" strokeLinecap="round" />
        <path d="m466 314 6 14-15-3" stroke="#40483e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M225 85v-23m-11 12h23M490 215v-17m-8 9h16" stroke="#40483e" strokeWidth="3" strokeLinecap="round" />
        <path d="m143 295 12-17 12 17-12 17Z" fill="#7d8776" />
      </> : kind === 'line' ? <>
        <circle cx="440" cy="95" r="90" fill="#ded5bc" /><circle cx="120" cy="335" r="130" fill="#c9cebf" />
        <path className="draw-line" d="M25 250C85 60 200 50 220 160s-90 149-78 38 144-119 151-7-40 153 20 109 54-149 103-140 46 164 158 55" stroke="#31584d" strokeWidth="8" strokeLinecap="round" />
        <path d="m300 53 8 22 23 2-18 15 5 22-19-12-19 13 5-24-18-13 24-3Z" fill="#8f967e" />
      </> : <>
        <g className="orbit"><rect x="160" y="85" width="190" height="190" rx="95" fill="#d7cdaa" /><path d="M300 210h180v150H300Z" fill="#c1c8b7" /><path d="M200 180a120 120 0 0 1 0 240V180Z" fill="#40483e" /><circle cx="398" cy="128" r="58" fill="#b7c2aa" /><circle cx="398" cy="128" r="22" fill="#f6f3e8" /></g>
        <path d="M90 80h55m-27-27v55" stroke="#40483e" strokeWidth="5" /><path d="M470 245h44m-22-22v44" stroke="#8f967e" strokeWidth="5" />
      </>}
    </svg>
  </div>;
}

function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); previousFocus?.focus(); };
  }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="dialog-title" onClick={event => {
    if (event.target === event.currentTarget) {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }
  }}>
    <div className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="icon-button" aria-label="fechar" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}

export default function App() {
  const [page, setPage] = useState<'studio' | 'projects' | 'cuts'>('cuts');
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<AudioSource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(60);
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [style, setStyle] = useState<StyleId>('collage');
  const [ratio, setRatio] = useState('16:9');
  const [modal, setModal] = useState<'help' | 'save' | 'ready' | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>(readDrafts);
  const [title, setTitle] = useState('minha próxima história');
  const [notice, setNotice] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const loadId = useRef(0);
  const currentStyle = styles.find(item => item.id === style)!;

  useEffect(() => () => { if (source) URL.revokeObjectURL(source.url); }, [source]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(''), 6500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { audio.current?.pause(); setCurrentTime(start); if (audio.current) audio.current.currentTime = start; }, [start, end]);

  async function loadAudio(file: File, demo = false) {
    if (loading) return;
    const id = ++loadId.current;
    if (!file.type.startsWith('audio/') && !/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(file.name)) {
      setError('escolha um arquivo de áudio, como MP3, WAV ou M4A.'); return;
    }
    if (file.size > 80 * 1024 * 1024) { setError('o arquivo ultrapassa 80 MB. escolha um áudio menor.'); return; }
    setLoading(true); setError('');
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      if (id !== loadId.current) return;
      if (buffer.duration < 30) { setError('este áudio tem menos de 30 segundos. escolha um arquivo mais longo.'); return; }
      const channel = buffer.getChannelData(0);
      const stride = Math.max(1, Math.floor(channel.length / 100));
      const peaks = Array.from({ length: 100 }, (_, index) => {
        let max = 0;
        for (let i = index * stride; i < Math.min((index + 1) * stride, channel.length); i += 16) max = Math.max(max, Math.abs(channel[i]));
        return max;
      });
      const highest = Math.max(...peaks, .001);
      setSource({ url: URL.createObjectURL(file), name: file.name, duration: buffer.duration, peaks: peaks.map(p => p / highest), demo });
      setStart(0); setEnd(Math.min(60, buffer.duration)); setCurrentTime(0); setPlaying(false); setPreviewPlaying(false);
      setNotice(demo ? 'áudio de exemplo carregado. experimente selecionar um trecho.' : 'áudio carregado. o arquivo permanece neste navegador.');
    } catch { if (id === loadId.current) setError('não foi possível ler este áudio. tente outro arquivo MP3 ou WAV.'); }
    finally { if (context) await context.close(); if (id === loadId.current) setLoading(false); }
  }

  function useExample() {
    // A quiet synthesized sample keeps the demonstration completely local.
    const rate = 16000; const duration = 72;
    const data = new ArrayBuffer(44 + rate * duration * 2);
    const view = new DataView(data);
    const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
    text(0, 'RIFF'); view.setUint32(4, data.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, data.byteLength - 44, true);
    const notes = [220, 261.63, 329.63, 293.66, 196, 261.63, 293.66, 329.63];
    for (let i = 0; i < rate * duration; i++) {
      const t = i / rate; const beat = t % .6;
      const envelope = Math.min(1, beat * 35) * Math.exp(-beat * 5) * Math.min(1, (duration - t) / 2);
      const frequency = notes[Math.floor(t / .6) % notes.length];
      const sample = (Math.sin(2 * Math.PI * frequency * t) + .3 * Math.sin(2 * Math.PI * frequency * 2 * t)) * envelope * .13;
      view.setInt16(44 + i * 2, sample * 32767, true);
    }
    void loadAudio(new File([data], 'Pequenas ideias.wav', { type: 'audio/wav' }), true);
  }

  async function toggleAudio() {
    if (!audio.current || !source) return;
    if (playing) { audio.current.pause(); return; }
    if (audio.current.currentTime < start || audio.current.currentTime >= end - .1) audio.current.currentTime = start;
    try { await audio.current.play(); } catch { setError('a reprodução não iniciou. tente novamente ou escolha outro áudio.'); }
  }

  function changeStart(event: ChangeEvent<HTMLInputElement>) {
    if (!source) return;
    const value = Math.max(0, Math.min(Number(event.target.value), source.duration - 30));
    setStart(value); setEnd(Math.min(source.duration, Math.max(value + 30, Math.min(end, value + 180))));
  }
  function changeEnd(event: ChangeEvent<HTMLInputElement>) {
    if (!source) return;
    const value = Math.max(30, Math.min(Number(event.target.value), source.duration));
    setEnd(value); setStart(Math.max(0, Math.min(value - 30, Math.max(start, value - 180))));
  }

  function goToStep(value: number) {
    setStep(value);
    const target = document.getElementById(['audio-section', 'style-section', 'preview-section'][value - 1]);
    target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' });
    target?.focus({ preventScroll: true });
  }

  function saveDraft() {
    if (!source || !title.trim()) return;
    const draft: Draft = { id: crypto.randomUUID(), title: title.trim(), audio: source.name, start, end, style, ratio, date: new Date().toISOString() };
    const next = [draft, ...drafts];
    try {
      localStorage.setItem(storageKey, JSON.stringify(next)); setDrafts(next); setModal(null);
      setNotice('rascunho salvo neste navegador. o arquivo de áudio não é armazenado.');
    } catch { setNotice('não foi possível salvar. verifique se o armazenamento do navegador está disponível.'); }
  }

  return <div className="app-shell">
    <a className="skip-link" href="#main">ir para o conteúdo</a>
    <header className="site-header">
      <a href="#" className="brand" aria-label="Anima Everywhere, início" onClick={event => { event.preventDefault(); setPage('cuts'); }}>Anima Everywhere</a>
      <nav aria-label="navegação principal">
        <button className={page === 'cuts' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('cuts')} aria-current={page === 'cuts' ? 'page' : undefined}>cortes de vídeo</button>
        <button className={page === 'studio' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('studio')} aria-current={page === 'studio' ? 'page' : undefined}>estúdio</button>
        <button className={page === 'projects' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('projects')} aria-current={page === 'projects' ? 'page' : undefined}>meus projetos <span className="project-count">{drafts.length}</span></button>
        <button className="help-button" onClick={() => setModal('help')} aria-label="ajuda"><CircleHelp size={18} /><span>como funciona</span></button>
      </nav>
      <button className="new-project" disabled={loading} onClick={() => { setPage('studio'); input.current?.click(); }}><Plus size={17} /> novo projeto</button>
    </header>
    <div className="workspace">
      <main id="main">
        <div hidden={page !== 'cuts'}><CutsStudio /></div>
        {page !== 'cuts' && <>
        {page === 'studio' ? <>
          <section className="page-heading"><div><span className="prototype-tag">um estúdio em construção</span><h1>seu som ganha movimento.</h1><p>selecione um trecho de áudio e explore uma nova forma de contar histórias.</p></div></section>
          <div className="workflow" aria-label="etapas de criação">{['seu áudio', 'direção visual', 'prévia do projeto'].map((label, index) => <button key={label} className={step === index + 1 ? 'workflow-step selected' : 'workflow-step'} onClick={() => goToStep(index + 1)} aria-current={step === index + 1 ? 'step' : undefined}><span>{index === 0 && source ? <Check size={14} /> : index + 1}</span>{label}{index < 2 && <ChevronRight className="step-chevron" size={16} />}</button>)}</div>
          <div className="studio-grid">
            <div className="editor-column">
              <section className="panel audio-panel" id="audio-section" tabIndex={-1}>
                <div className="section-heading"><div><span className="section-icon"><AudioLines size={19} /></span><h2>primeiro, o seu áudio</h2></div><span className="subtle-tag">30 s a 3 min</span></div>
                <p className="section-description">uma fala, um podcast, uma música. qual história vamos contar?</p>
                <button className={`dropzone ${dragging ? 'dragging' : ''} ${source ? 'has-audio' : ''}`} disabled={loading} onClick={() => input.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file && !loading) void loadAudio(file); }}>
                  <span className="upload-icon">{loading ? <LoaderCircle className="spin" size={25} /> : source ? <FileAudio size={25} /> : <Upload size={25} />}</span>
                  <strong>{loading ? 'preparando seu áudio…' : source ? source.name : 'arraste seu áudio até aqui'}</strong>
                  <span>{source ? `${time(source.duration)} de áudio ${source.demo ? 'de exemplo' : 'local'} · clique para trocar` : <>ou <b>escolha um arquivo</b> no seu dispositivo</>}</span>
                  {!source && <small>MP3, WAV, M4A e outros áudios · até 80 MB</small>}
                </button>
                {error && <p className="error-message" role="alert">{error}</p>}
                {!source && <div className="example-row"><span>quer experimentar primeiro?</span><button className="text-button" disabled={loading} onClick={useExample}><Play size={13} fill="currentColor" /> usar áudio de exemplo</button></div>}
                <div className={`audio-editor ${!source ? 'empty-editor' : ''}`}>
                  <div className="waveform-header"><span>{source ? 'selecione o melhor trecho' : 'seu trecho aparece aqui'}</span><span>{source ? time(end - start) : '00:00'} <small>selecionados</small></span></div>
                  <div className="waveform" role="img" aria-label={source ? `forma de onda. trecho de ${time(start)} a ${time(end)}.` : 'demonstração da forma de onda, aguardando áudio'}>
                    {(source?.peaks || placeholderPeaks).map((height, index) => <span key={index} style={{ height: `${Math.max(9, height * 100)}%` }} className={source && index / 100 >= start / source.duration && index / 100 <= end / source.duration ? 'in-selection' : ''} />)}
                    {source && <><div className="selection-region" style={{ left: `${start / source.duration * 100}%`, width: `${(end - start) / source.duration * 100}%` }} /><span className="playhead" style={{ left: `${currentTime / source.duration * 100}%` }} /></>}
                  </div>
                  <div className="timeline-labels"><span>00:00</span><span>{source ? time(source.duration / 2) : '00:30'}</span><span>{source ? time(source.duration) : '01:00'}</span></div>
                  <div className="audio-controls"><button className="play-audio" disabled={!source} aria-label={playing ? 'pausar áudio' : 'reproduzir trecho'} onClick={() => void toggleAudio()}>{playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button><span className="playback-time">{time(currentTime)} <small>/ {source ? time(source.duration) : '00:00'}</small></span><span className="headphone-hint"><Headphones size={14} /> ouça e encontre seu trecho</span></div>
                  {source && <div className="trim-controls"><label>início <output>{time(start)}</output><input aria-label="início do trecho" type="range" min="0" max={source.duration - 30} step="0.1" value={start} onChange={changeStart} /></label><label>fim <output>{time(end)}</output><input aria-label="fim do trecho" type="range" min="30" max={source.duration} step="0.1" value={end} onChange={changeEnd} /></label></div>}
                </div>
                <p className="privacy-note"><ShieldCheck size={14} /> seu áudio fica neste navegador. nada é enviado.</p>
              </section>
              <section className="panel direction-panel" id="style-section" tabIndex={-1}>
                <div className="section-heading"><div><span className="section-icon"><WandSparkles size={19} /></span><h2>uma direção para imaginar</h2></div></div><p className="section-description">referências exploratórias. o estilo final a gente define depois.</p>
                <div className="style-grid" role="group" aria-label="direção visual">{styles.map(item => <button key={item.id} className={`style-option ${style === item.id ? 'chosen' : ''}`} aria-pressed={style === item.id} onClick={() => { setStyle(item.id); setStep(2); }}><div className="style-thumb"><Artwork kind={item.id} compact /><span className="style-check">{style === item.id && <Check size={12} />}</span></div><strong>{item.name}</strong><span>{item.description}</span></button>)}</div>
              </section>
            </div>
            <aside className="preview-column">
              <section className="panel preview-panel" id="preview-section" tabIndex={-1}>
                <div className="section-heading"><div><span className="section-icon"><Clapperboard size={19} /></span><h2>um gostinho da ideia</h2></div></div>
                <div className="preview-topline"><span>prévia ilustrativa</span><span>{ratio}</span></div>
                <div className={`preview-stage ratio-${ratio.replace(':', '-')}`}><Artwork kind={style} playing={previewPlaying} /><div className="art-caption"><span>{currentStyle.label}</span><strong>histórias que<br />saem do lugar.</strong></div><span className="art-signature">Anima Everywhere</span><button className="preview-play" aria-label={previewPlaying ? 'pausar prévia ilustrativa' : 'reproduzir prévia ilustrativa'} onClick={() => { setPreviewPlaying(!previewPlaying); setStep(3); }}>{previewPlaying ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button></div>
                <p className="preview-disclaimer">uma referência visual, não uma animação gerada a partir do seu áudio.</p>
                <div className="format-heading"><h3>formato da tela</h3></div>
                <div className="ratio-options" role="group" aria-label="formato da tela">{[{ value: '16:9', name: 'horizontal' }, { value: '9:16', name: 'vertical' }, { value: '1:1', name: 'quadrado' }].map(item => <button key={item.value} className={ratio === item.value ? 'ratio-option chosen' : 'ratio-option'} aria-pressed={ratio === item.value} onClick={() => setRatio(item.value)}><span className={`ratio-icon icon-${item.value.replace(':', '-')}`} /><strong>{item.name}</strong><small>{item.value}</small></button>)}</div>
                <div className="project-summary"><span><Clock3 size={14} /> duração do trecho</span><strong>{source ? time(end - start) : 'a definir'}</strong></div>
                <button className="primary-button prepare-button" disabled={!source || loading} onClick={() => { setModal('ready'); setStep(3); }}><Sparkles size={17} /> preparar projeto <ArrowRight size={17} /></button>
                <span className="generation-note">a geração de animações chega em uma próxima etapa.</span>
              </section>
            </aside>
          </div>
          <footer className="studio-footer"><span><ShieldCheck size={14} /> feito para criar, com espaço para experimentar.</span><span>Anima Everywhere <span className="footer-version">v0.1</span></span></footer>
        </> : <>
          <section className="page-heading"><div><span className="prototype-tag">um lugar para suas ideias</span><h1>meus projetos</h1><p>rascunhos salvos neste navegador. os arquivos de áudio não são armazenados.</p></div><button className="primary-button" onClick={() => setPage('studio')}><Plus size={17} /> criar projeto</button></section>
          {drafts.length ? <div className="projects-grid">{drafts.map(draft => <article className="panel project-card" key={draft.id}><Artwork kind={draft.style} compact /><div><span className="subtle-tag">rascunho local</span><h2>{draft.title}</h2><p>{draft.audio}</p><div className="draft-meta"><span>{time(draft.end - draft.start)} · {draft.ratio}</span><span>{new Date(draft.date).toLocaleDateString('pt-BR')}</span></div><button className="text-button" onClick={() => { setSource(null); setPlaying(false); setPreviewPlaying(false); setStyle(draft.style); setRatio(draft.ratio); setTitle(draft.title); setPage('studio'); setNotice(`direção visual restaurada. reimporte ${draft.audio} e selecione novamente o trecho ${time(draft.start)} a ${time(draft.end)}.`); }}>continuar ideia <ArrowRight size={16} /></button></div></article>)}</div> : <div className="empty-projects"><FolderOpen size={42} /><h2>seu próximo projeto está por vir.</h2><p>escolha um áudio, explore uma direção e salve sua primeira ideia.</p><button className="primary-button" onClick={() => setPage('studio')}>ir para o estúdio <ArrowRight size={17} /></button></div>}
        </>}
        </>}
      </main>
    </div>
    <input ref={input} className="visually-hidden" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac" aria-label="selecionar arquivo de áudio" tabIndex={-1} onChange={event => { const file = event.target.files?.[0]; if (file) void loadAudio(file); event.target.value = ''; }} />
    {source && <audio ref={audio} src={source.url} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={() => { const element = audio.current; if (!element) return; if (element.currentTime >= end) { element.pause(); element.currentTime = start; } setCurrentTime(element.currentTime); }} />}
    <div className="toast-region" role="status">{notice && <div className="toast"><Check size={18} /><span>{notice}</span><button className="icon-button" aria-label="dispensar aviso" onClick={() => setNotice('')}><X size={16} /></button></div>}</div>
    {modal === 'help' && <Dialog title="do som à primeira ideia" onClose={() => setModal(null)}><p className="dialog-intro">o estúdio de áudio é um espaço para experimentar, inteiramente no seu navegador. a aba de cortes de vídeo usa um serviço neste computador, com yt-dlp e FFmpeg.</p><ol className="help-steps"><li><span>1</span><div><h3>escolha seu áudio</h3><p>importe um arquivo de até 80 MB ou use o exemplo. selecione um trecho entre 30 segundos e 3 minutos.</p></div></li><li><span>2</span><div><h3>explore a direção visual</h3><p>experimente referências de estilo e formatos. são possibilidades exploratórias, não estilos definitivos.</p></div></li><li><span>3</span><div><h3>guarde a ideia</h3><p>salve as configurações como rascunho local. ao voltar, você precisará selecionar o áudio novamente.</p></div></li></ol><div className="info-box"><Sparkles size={20} /><p>no estúdio de áudio, a geração de animações e a exportação de vídeo ainda não estão disponíveis. a prévia é ilustrativa. para exportar trechos de vídeos existentes, use a aba cortes de vídeo.</p></div><p className="font-licenses">fontes locais, sob SIL Open Font License: <a href={zillaLicense} download="Zilla-Slab-OFL.txt">Zilla Slab</a> e <a href={interLicense} download="Inter-OFL.txt">Inter</a>.</p><button className="primary-button dialog-action" onClick={() => setModal(null)}>vamos experimentar <ArrowRight size={17} /></button></Dialog>}
    {modal === 'ready' && source && <Dialog title="sua ideia já tem um caminho." onClose={() => setModal(null)}><p className="dialog-intro">seu projeto está preparado. salve a direção para continuar explorando depois.</p><div className="ready-summary"><Artwork kind={style} compact /><dl><div><dt>áudio</dt><dd>{source.name}</dd></div><div><dt>trecho</dt><dd>{time(start)} a {time(end)} ({time(end - start)})</dd></div><div><dt>direção</dt><dd>{currentStyle.name}</dd></div><div><dt>formato</dt><dd>{ratio}</dd></div></dl></div><div className="info-box"><Monitor size={19} /><p>nenhum vídeo será gerado nesta etapa. o rascunho guarda apenas as configurações, não o arquivo de áudio.</p></div><button className="primary-button dialog-action" onClick={() => setModal('save')}><ArrowDownToLine size={17} /> salvar rascunho</button></Dialog>}
    {modal === 'save' && <Dialog title="dê um nome à sua ideia" onClose={() => setModal(null)}><form onSubmit={event => { event.preventDefault(); saveDraft(); }}><label className="title-label" htmlFor="project-title">nome do projeto</label><input className="title-input" id="project-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={100} required autoFocus /><p className="dialog-intro">o rascunho fica só neste navegador. o áudio deverá ser importado novamente ao continuar.</p><button className="primary-button dialog-action" type="submit" disabled={!title.trim()}><Check size={17} /> salvar rascunho</button></form></Dialog>}
  </div>;
}
