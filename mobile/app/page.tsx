'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { spotifySignInMessages } from '@/lib/queue/spotify-signin.mjs';
import { deliveryVisibility } from '@/lib/queue/review.mjs';
import { refreshedDeviceId } from '@/lib/queue/playback.mjs';
type Track = { uri: string; title: string; artist: string; image: string; url: string };
type Status = { signedIn?: boolean; chatgpt?: boolean; pc?: { paired: boolean; online: boolean; connected: boolean }; spotify: boolean; claude: boolean; provider?: string; mode?: 'replace' | 'append'; review?: boolean; model: string; count: number; queueReview?: boolean; queueBusy?: boolean };
type Selection = { indexes?: number[]; mode?: 'replace' | 'append'; id: string; tracks: Track[]; requested: number; deviceName?: string; expires?: number; note?: string; unmatched?: number };
type Delivery = { mode?: string; tracks: Track[]; accepted: number; total: number; state: string; deviceName?: string };
type Device = { id: string; name: string; type: string; restricted: boolean; active?: boolean; available?: boolean };
type Playback = { device: Device | null; devices?: Device[]; playing: Track | null; queue: Track[]; isPlaying: boolean };
type RequestRow = { id: string; prompt: string; accepted: number; total: number; state: string; at: number };
function Icon({ name, size = 22 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    queue: <><path d="M3 5h14M3 10h14M3 15h8"/><path d="m16 14 5 3-5 3z"/></>,
    settings: <><path d="m9 3-1 3-3 1-1 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1V9l-3-1-1-3-3 1-2-3z"/><circle cx="12" cy="11" r="3"/></>,
    history: <><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/><path d="M12 7v5l3 2"/></>,
    arrow: <path d="m9 5 7 7-7 7"/>, refresh: <><path d="M20 10a8 8 0 0 0-14-5L3 8m0-5v5h5m-4 6a8 8 0 0 0 14 5l3-3m0 5v-5h-5"/></>,
    phone: <><rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M10 18h4"/></>,
    device: <><rect x="2" y="3" width="15" height="12" rx="1"/><path d="M6 19h7m-3-4v4"/><rect x="17" y="10" width="5" height="11" rx="1"/></>,
    note: <><path d="M9 18V5l10-2v13M9 8l10-2"/><ellipse cx="6" cy="18" rx="3" ry="2"/><ellipse cx="16" cy="16" rx="3" ry="2"/></>,
    close: <path d="m6 6 12 12M6 18 18 6"/>, external: <><path d="M14 3h7v7m0-7L10 14"/><path d="M10 3H4v17h17v-6"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>, chevron: <path d="m6 9 6 6 6-6"/>, play: <path d="m8 4 13 8-13 8z"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.note}</svg>;
}
async function api(path: string, input?: object): Promise<any> {
  const response = await fetch('/api/' + path, { ...(input ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) } : {}), cache: 'no-store' });
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('The service could not respond. Refresh and try again.');
  const result: any = await response.json(); if (!response.ok) throw Object.assign(new Error(result.error ?? 'The request could not finish.'), result, { status: response.status }); return result;
}
function TrackRow({ track, index, playing = false }: { track: Track; index?: number; playing?: boolean }) {
  return <a className={'track-row' + (playing ? ' is-playing' : '')} href={track.url} target="_blank" rel="noopener noreferrer">
    {index !== undefined && <span className="track-number">{index + 1}</span>}
    {track.image ? <img src={track.image} width="48" height="48" alt="" referrerPolicy="no-referrer" loading="lazy"/> : <span className="artwork-placeholder"><Icon name="note"/></span>}
    <span className="track-copy"><strong>{track.title}</strong><span>{track.artist}</span></span><span className="track-link"><Icon name={playing ? 'play' : 'external'} size={16}/></span>
  </a>;
}
export default function Home() {
  const [tab, setTab] = useState('queue'), [status, setStatus] = useState<Status | null>(null), [playback, setPlayback] = useState<Playback | null>(null);
  const [prompt, setPrompt] = useState(''), [count, setCount] = useState(15), [busy, setBusy] = useState(''), [loading, setLoading] = useState(true), [key, setKey] = useState('');
  const [message, setMessage] = useState(''), [error, setError] = useState(''), [models, setModels] = useState<{ id: string; name: string }[]>([]), [requests, setRequests] = useState<RequestRow[]>([]);
  const [recoverDevice, setRecoverDevice] = useState(false);
  const [sheet, setSheet] = useState(''), [choice, setChoice] = useState<{ name: string; options: { uri: string; name: string; owner?: string }[] } | null>(null);
  const [installPrompt, setInstallPrompt] = useState<any>(null), [cooldown, setCooldown] = useState(0), [selectionNote, setSelectionNote] = useState('');
  const [preview, setPreview] = useState<Selection | null>(null), [delivery, setDelivery] = useState<Delivery | null>(null);
  const provider = status?.provider ?? (status?.claude ? 'claude' : 'chatgpt');
  const mode = status?.mode ?? 'replace';
  const [selectedDevice, setSelectedDevice] = useState('');
  const providerName = provider === 'spotify' ? 'Spotify library' : provider === 'claude' ? 'Claude API' : 'ChatGPT';
  const working = useRef(false), choices = useRef<Record<string, string>>({}), composer = useRef<HTMLTextAreaElement>(null);
  const showError = useCallback((e: any) => { if (e.code === 'spotify_device') setRecoverDevice(true); setError(e.message ?? 'The request could not finish.'); if (e.retryAfter) setCooldown(Date.now() + e.retryAfter * 1000); }, []);
  const loadPlayback = useCallback(async () => { const result = await api('playback'); setPlayback(result); return result; }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const value = await api('status'); setStatus(value); setCount(value.count); const snapshot = value.spotify ? await loadPlayback() : null; if (!value.spotify) setPlayback(null);
      const last = sessionStorage.getItem('qc-selection') ?? sessionStorage.getItem('qc-last-selection');
      if (last) {
        const result = await api('receipt?selection=' + encodeURIComponent(last));
        if (result.receipt) { if (sessionStorage.getItem('qc-pending-selection') === last) { sessionStorage.removeItem('qc-pending-selection'); sessionStorage.removeItem('qc-kept-indices'); setPreview(null); } setDelivery(result.receipt); if (result.receipt.state === 'complete') sessionStorage.removeItem('qc-selection'); else if (result.receipt.message) setError(result.receipt.message); }
        else if (result.receipt === null) { setDelivery(null); sessionStorage.removeItem('qc-selection'); sessionStorage.removeItem('qc-last-selection'); }
      }
      const pending = sessionStorage.getItem('qc-pending-selection');
      if (pending) {
        try { const selected = await api('selection?id=' + encodeURIComponent(pending)); const saved = sessionStorage.getItem('qc-kept-indices'); const indexes = saved ? JSON.parse(saved) : selected.tracks.map((_: Track, index: number) => index); if (!Array.isArray(indexes) || new Set(indexes).size !== indexes.length || indexes.some((index: any) => !Number.isInteger(index) || index < 0 || index >= selected.tracks.length)) throw Error('The saved review could not be restored.'); setPreview({ ...selected, tracks: indexes.map((index: number) => selected.tracks[index]), indexes }); setRecoverDevice(!snapshot?.device || snapshot.device.available === false); }
        catch (e: any) { if (e.status === 410) { sessionStorage.removeItem('qc-pending-selection'); sessionStorage.removeItem('qc-kept-indices'); setPreview(null); } else throw e; }
      }
    }
    catch (e: any) { if (e.code === 'sign_in') setStatus({ signedIn: false, spotify: false, claude: false, model: '', count: 15 }); else showError(e); }
    finally { setLoading(false); }
  }, [loadPlayback, showError]);
  useEffect(() => {
    refresh(); setPrompt(sessionStorage.getItem('qc-draft') ?? '');
    const install = (e: Event) => { e.preventDefault(); setInstallPrompt(e); }; window.addEventListener('beforeinstallprompt', install);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const params = new URLSearchParams(location.search);
    if (params.get('connection') === 'failed') { const reason = params.get('reason') ?? 'unavailable'; setError(Object.hasOwn(spotifySignInMessages, reason) ? spotifySignInMessages[reason as keyof typeof spotifySignInMessages] : spotifySignInMessages.unavailable); }
    if (params.get('connection') === 'connected') setMessage('Spotify connected. Your next request will use the active playback device.');
    if (params.has('connection')) history.replaceState(null, '', '/');
    return () => window.removeEventListener('beforeinstallprompt', install);
  }, [refresh]);
  useEffect(() => { sessionStorage.setItem('qc-draft', prompt); }, [prompt]);
  useEffect(() => {
    const resume = () => { if (document.visibilityState === 'visible' && !working.current && sessionStorage.getItem('qc-pending-selection')) refresh(); };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, [refresh]);
  useEffect(() => {
    if (!status?.signedIn) return;
    const timer = setInterval(() => { if (!working.current && document.visibilityState === 'visible') api('status').then(setStatus).catch(() => {}); }, 20_000);
    return () => clearInterval(timer);
  }, [status?.signedIn]);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(0), Math.max(0, cooldown - Date.now())); return () => clearTimeout(timer); }, [cooldown]);
  useEffect(() => {
    if (!sheet) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const background = [...document.querySelectorAll<HTMLElement>('main,.app-header,.bottom-nav,.desktop-nav')];
    background.forEach(element => element.inert = true);
    dialog?.querySelector<HTMLElement>('button,a,input')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setSheet(''); return; }
      if (event.key !== 'Tab') return;
      const targets = [...dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled)') ?? []].filter(element => element.offsetParent !== null);
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { background.forEach(element => element.inert = false); document.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [sheet]);
  useEffect(() => { if (tab === 'requests' && status?.signedIn) api('requests').then(result => setRequests(result.requests)).catch(showError); if (tab === 'settings' && (provider === 'chatgpt' && status?.chatgpt || provider === 'claude' && status?.claude)) api('models').then(result => setModels(result.models)).catch(showError); }, [tab, provider, status?.chatgpt, status?.claude, status?.signedIn, showError]);
  async function saveSettings(nextCount = count, model = status?.model ?? '', nextProvider = provider, nextMode = mode, nextReview = status?.review ?? false) {
    if (!status?.signedIn || working.current) return;
    working.current = true; setBusy('Saving settings…');
    try { await api('settings', { count: nextCount, model, provider: nextProvider, mode: nextMode, review: nextReview }); setStatus(value => value && { ...value, count: nextCount, model, provider: nextProvider, mode: nextMode, review: nextReview }); setPreview(null); } catch (e) { showError(e); }
    finally { working.current = false; setBusy(''); }
  }
  async function add(playlistChoice?: { name: string; uri: string }) {
    if (working.current || cooldown > Date.now()) return;
    if (!status?.spotify) { setTab('settings'); setError('Connect Spotify to add songs to your queue.'); return; }
    if (playlistChoice) choices.current[playlistChoice.name] = playlistChoice.uri; else choices.current = {};
    if (!prompt.trim()) { composer.current?.focus(); return; }
    working.current = true; setBusy('Finding songs…'); setError(''); setMessage(''); setSelectionNote(''); setChoice(null);
    try {
      const selected = await api('select', { prompt, count, mode, device: selectedDevice || playback?.device?.id || '', choices: choices.current });
      selected.indexes = selected.tracks.map((_: Track, index: number) => index); sessionStorage.removeItem('qc-kept-indices'); setPreview(selected); setRecoverDevice(false); sessionStorage.setItem('qc-pending-selection', selected.id);
      if (status?.review) setMessage(`${selected.tracks.length} songs ready to review. Nothing has been sent to Spotify.`);
      else await submitSelection(selected);
    } catch (e: any) { if (e.code === 'playlist_choice') { setChoice(e.choice); setSheet('playlist'); } else showError(e); }
    finally { working.current = false; setBusy(''); }
  }
  async function submitSelection(selected: Selection) {
    setBusy((selected.mode ?? mode) === 'replace' ? 'Starting your songs…' : 'Adding your songs…');
    sessionStorage.setItem('qc-selection', selected.id); sessionStorage.setItem('qc-last-selection', selected.id);
    const latest = await loadPlayback();
    const requestedDevice = selectedDevice ? refreshedDeviceId(selectedDevice, playback?.devices ?? (playback?.device ? [playback.device] : []), latest.devices ?? (latest.device ? [latest.device] : [])) : latest.device?.id || playback?.device?.id || '';
    const result = await api('queue', { selection: selected.id, keepUris: selected.tracks.map(track => track.uri), mode: selected.mode ?? mode, device: requestedDevice });
    setDelivery({ ...result, tracks: result.tracks ?? selected.tracks, deviceName: result.deviceName ?? selected.deviceName });
    setPreview(null); setRecoverDevice(false); sessionStorage.removeItem('qc-pending-selection'); sessionStorage.removeItem('qc-kept-indices');
    if (result.state === 'complete') {
      sessionStorage.removeItem('qc-selection');
      setMessage(result.mode === 'replace' ? (result.playbackConfirmed ? `Playing your selection on ${result.deviceName ?? 'Spotify'}. ${result.accepted} songs accepted.` : `Spotify accepted your ${result.accepted}-song selection. Refresh to check playback.`) : `Spotify accepted ${result.accepted} ${result.accepted === 1 ? 'song' : 'songs'} for ${result.deviceName ?? 'your device'}. You can close Queue Companion.`);
      setSelectionNote(result.mode === 'replace' ? 'You can close Queue Companion. Playback stays in Spotify.' : 'The current song keeps playing.');
      if (result.mode === 'replace' && result.playbackConfirmed && result.sequenceConfirmed === false) setSelectionNote('The first song is playing, but Spotify still shows a different next-up list. Previously queued manual songs may need to be cleared in Spotify.');
      try { await loadPlayback(); } catch { setSelectionNote('Spotify accepted the songs. Refresh to check playback.'); }
    } else if (result.state === 'failed') { sessionStorage.removeItem('qc-selection'); setError(`${result.accepted} of ${result.total} songs were sent. ${result.message ?? 'Check Spotify before making another request.'}`); }
    else setError(result.message ?? 'The playback change is not confirmed. Check Spotify before trying again.');
    await refresh();
  }
  async function sendPreview() {
    if (!preview?.tracks.length || working.current || cooldown > Date.now()) return;
    working.current = true; setError(''); setMessage(''); setSelectionNote('');
    try { await submitSelection(preview); }
    catch (e: any) { if (e.status === 410) setPreview(null); showError(e); }
    finally { working.current = false; setBusy(''); }
  }
  async function connectClaude(e: React.FormEvent) {
    e.preventDefault(); if (working.current) return; working.current = true; setBusy('Connecting Claude…'); setError('');
    try { const result = await api('claude/connect', { key }); setKey(''); setModels(result.models); setMessage('Claude API connected.'); await refresh(); }
    catch (e) { showError(e); } finally { working.current = false; setBusy(''); }
  }
  async function disconnect(provider: string) {
    if (working.current) return;
    try { await api('disconnect', { provider }); setMessage(provider === 'spotify' ? 'Spotify disconnected. You can also remove access in your Spotify account.' : 'Claude API key removed.'); await refresh(); } catch (e) { showError(e); }
  }
  async function review() { try { await api('review', {}); sessionStorage.removeItem('qc-selection'); setError(''); setMessage('Queue review saved. New requests are enabled.'); await refresh(); } catch (e) { showError(e); } }
  const device = playback?.devices?.find(d => d.id === selectedDevice) ?? playback?.device;
  const nav = <>{[['queue', 'queue', 'Queue'], ['requests', 'history', 'Requests'], ['settings', 'settings', 'Settings']].map(([id, icon, label]) => <button key={id} disabled={loading} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id ? 'page' : undefined}><Icon name={icon}/><span>{label}</span></button>)}</>;
  return <div className="app-shell">
    <header className="app-header"><a className="wordmark" href="/" aria-label="Queue Companion home"><Icon name="queue" size={25}/><span>Queue Companion</span></a><button disabled={loading} className="icon-button profile-button" aria-label="Open account settings" onClick={() => setTab('settings')}><Icon name="user" size={20}/></button></header>
    <aside className="desktop-nav" aria-label="Main navigation">{nav}<p>Made for your queue.<br/>Playback stays in Spotify.</p></aside>
    <main>
      <div className="page-heading"><h1>{tab === 'queue' ? 'Queue' : tab === 'requests' ? 'Your requests' : 'Settings'}</h1>{tab === 'queue' && <button className="icon-button" aria-label="Refresh Spotify queue" disabled={!!busy || loading || cooldown > Date.now()} onClick={() => { setError(''); refresh(); }}><Icon name="refresh" size={21}/></button>}</div>
      {(message || error) && <div className={'notice ' + (error ? 'notice-error' : 'notice-success')} role={error ? 'alert' : 'status'}><span>{error || message}{!error && selectionNote && <small>{selectionNote}</small>}</span><button aria-label="Dismiss message" className="icon-button" onClick={() => { setMessage(''); setError(''); }}><Icon name="close" size={17}/></button></div>}
      {tab === 'queue' && <>
        <section className="request-section" aria-label="Request music"><label className="request-label" htmlFor="music-request">What do you want to hear?</label>
          <textarea id="music-request" ref={composer} value={prompt} onChange={e => { setPrompt(e.target.value); setPreview(null); }} maxLength={1000} placeholder={provider === 'spotify' ? 'Mix songs from my "Evening" playlist and liked songs.' : 'Classic rock hidden gems, a little less obvious.'} rows={3} disabled={!!busy || loading}/>
          <div className="request-controls"><label className="count-control"><select aria-label="Number of songs" value={count} disabled={!!busy || loading} onChange={e => { const value = Number(e.target.value); setCount(value); saveSettings(value); }}>{[5,10,15,20,25,30,40,50].map(n => <option key={n} value={n}>{n} songs</option>)}</select><Icon name="chevron" size={16}/></label><button className="source-button" disabled={!!busy || loading} onClick={() => setTab('settings')}>{providerName}{provider === 'chatgpt' && !status?.chatgpt ? (status?.pc?.paired ? ' · PC offline' : ' · Not connected') : provider === 'claude' && !status?.claude ? ' · Not connected' : ''}<Icon name="arrow" size={13}/></button></div>
          <label className="playback-mode"><span>Playback</span><select aria-label="Playback mode" value={mode} disabled={!!busy || loading} onChange={e => saveSettings(count, status?.model ?? '', provider, e.target.value as 'replace' | 'append')}><option value="replace">Play now</option><option value="append">Append to queue</option></select></label>
          <button className="primary-button add-button" disabled={!!busy || loading || cooldown > Date.now() || (mode === 'append' && !!status?.queueReview)} onClick={() => add()}>{busy ? <><span className="spinner"/>{busy}</> : status?.review ? 'Find songs' : mode === 'replace' ? 'Generate & play' : 'Generate & append'}</button>
          <button className={'device-button' + (device && device.available !== false ? ' connected' : '')} disabled={!!busy} onClick={() => setSheet('device')}><Icon name={device?.type === 'Smartphone' ? 'phone' : 'device'} size={18}/><span>{device ? (device.available === false ? 'Reconnect ' + device.name : device.name) : status?.spotify ? 'Open Spotify to find your device' : 'Connect Spotify to get started'}</span><Icon name="arrow" size={14}/></button>
        </section>
        {preview && <section className="selection-preview" aria-label="Review selection"><div className="section-heading"><h2>{recoverDevice ? 'Your songs are saved' : 'Review your songs'}</h2><button className="text-button" disabled={!!busy} onClick={() => { setPreview(null); sessionStorage.removeItem('qc-pending-selection'); sessionStorage.removeItem('qc-kept-indices'); setRecoverDevice(false); setMessage('Selection cleared. No songs were sent to Spotify.'); }}>Clear selection</button></div><p className="section-description">{preview.tracks.length} kept of {preview.requested} requested · Nothing sent yet. Remove any songs you don’t want.</p>{recoverDevice && <div className="device-recovery"><p>{(preview.mode ?? mode) === 'replace' ? 'iOS can disconnect Spotify while it is paused. Open the first selected song below and tap Play in Spotify, then return and continue.' : 'iOS can disconnect Spotify while it is paused. Open Spotify and resume your current song, then return and append this saved selection.'} Your selection stays available for 10 minutes; no new AI request is needed.</p>{preview.tracks.length > 0 && <a className="secondary-button" href={(preview.mode ?? mode) === 'replace' ? preview.tracks[0].uri : 'spotify://'}>{(preview.mode ?? mode) === 'replace' ? 'Open first song in Spotify' : 'Open Spotify'}</a>}</div>}{preview.note && <p className="review-detail">{preview.note}</p>}<div>{preview.tracks.map((track, index) => <div className="review-track" key={track.uri}><TrackRow track={track} index={index}/><button className="icon-button" aria-label={'Remove ' + track.title + ' from selection'} disabled={!!busy} onClick={() => setPreview(value => { if (!value) return value; const at = value.tracks.findIndex(t => t.uri === track.uri); const indexes = (value.indexes ?? value.tracks.map((_, i) => i)).filter((_, i) => i !== at); sessionStorage.setItem('qc-kept-indices', JSON.stringify(indexes)); return { ...value, indexes, tracks: value.tracks.filter((_, i) => i !== at) }; })}><Icon name="close" size={18}/></button></div>)}</div><button className="primary-button" disabled={!!busy || !preview.tracks.length || (mode === 'append' && !!status?.queueReview)} onClick={sendPreview}>{recoverDevice ? 'Continue selection' : `${(preview.mode ?? mode) === 'replace' ? 'Play' : 'Append'} ${preview.tracks.length} ${preview.tracks.length === 1 ? 'song' : 'songs'} to Spotify`}</button><p className="review-detail">{(preview.mode ?? mode) === 'replace' ? 'Starts your selection from the first song.' : 'Keeps the current song and existing queue.'} Selection expires after 10 minutes.</p></section>}
        {delivery && <section className="delivery-section" aria-label="Your last request"><div className="section-heading"><h2>Your last request</h2><span>{delivery.accepted} of {delivery.total} accepted</span></div><p className="review-detail">{delivery.deviceName ?? 'Spotify device'} · Spotify may show only part of a long queue. “Accepted” alone does not confirm queue visibility.</p>{delivery.tracks?.length ? deliveryVisibility(delivery.tracks, delivery.accepted, playback, delivery.state).map((item: any, index: number) => <div className="delivery-track" key={item.uri}><TrackRow track={delivery.tracks[index]}/><span className={'delivery-state ' + item.state}>{item.state === 'visible' ? 'Visible in queue' : item.state === 'playing' ? 'Now playing' : item.state === 'not_sent' ? 'Not sent' : item.state === 'unconfirmed' ? 'Unconfirmed' : 'Accepted'}</span></div>) : <p className="review-detail">Song details have expired. Delivery counts are retained in Your requests.</p>}</section>}
        {status?.queueReview && mode === 'append' && <section className="review-notice"><h2>Check your Spotify queue</h2><p>A previous request may still be running or may have added songs. Review it in Spotify before making another request.</p><button className="secondary-button" onClick={review} disabled={!!status.queueBusy || !!busy}>I’ve checked my queue</button></section>}
        <div className="queue-content">{playback?.playing && <section className="now-playing"><h2>{playback.isPlaying ? 'Now playing' : 'Current song'}</h2><TrackRow track={playback.playing} playing/></section>}
          <section className="next-up"><div className="section-heading"><h2>Next up</h2><button className="text-button" disabled={!!busy} onClick={() => setSheet('queue-tools')}>Queue controls</button></div>{!!playback?.queue.length && <p className="review-detail">{playback.queue.length} visible in Spotify</p>}
            {loading && !playback ? <div className="empty-state loading-state"><span className="spinner"/><p>Loading your queue…</p></div> : playback?.queue.length ? <div className="track-list">{playback.queue.map((track, index) => <TrackRow key={track.uri + index} track={track} index={index}/>)}</div> : <div className="empty-state"><Icon name="queue" size={43}/><h3>{status?.spotify ? 'Room for something good' : 'Your next songs start here'}</h3><p>{status?.spotify ? 'Describe what you want to hear. Your selection can start playing as soon as it is ready.' : 'Connect Spotify and describe what you want to hear.'}</p>{!status?.spotify && <button className="secondary-button" onClick={() => setTab('settings')}>Connect Spotify</button>}</div>}
          </section></div>
      </>}
      {tab === 'requests' && <section className="requests-list"><p className="section-description">Music you’ve asked for on this account.</p>{requests.length ? requests.map(row => <article className="request-row" key={row.id}><span className="request-history-icon"><Icon name="history"/></span><div><h2>{row.prompt}</h2><p>{row.accepted} of {row.total} sent · {new Date(row.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p>{row.state !== 'complete' && <span className="request-status">{row.state === 'reviewed' ? 'Queue reviewed' : row.state === 'failed' ? 'Stopped early' : 'Check Spotify’s queue'}</span>}</div></article>) : <div className="empty-state"><Icon name="history" size={43}/><h3>No requests yet</h3><p>Your completed requests will appear here.</p><button className="secondary-button" onClick={() => setTab('queue')}>Make a request</button></div>}</section>}
      {tab === 'settings' && <div className="settings-content"><section className="settings-section"><h2>Connections</h2>
        <div className="connection-row"><span className="connection-icon"><Icon name="user"/></span><div><h3>ChatGPT site account</h3><p>{status?.signedIn ? 'Signed in · Access to this app only' : 'Sign in to keep your connections private.'}</p></div>{!status?.signedIn && <a className="secondary-button small" target="_top" href="/signin-with-chatgpt?return_to=%2F">Sign in</a>}</div>
        <div className="connection-row"><span className="connection-icon"><Icon name="note"/></span><div><h3>Spotify</h3><p>{status?.spotify ? 'Connected · Premium playback' : 'Connect in Safari, then use your Home Screen app'}</p></div>{status?.spotify ? <button className="text-button" disabled={!!busy} onClick={() => disconnect('spotify')}>Disconnect</button> : <a target="_top" className={'secondary-button small' + (!status?.signedIn ? ' disabled' : '')} aria-disabled={!status?.signedIn} href={status?.signedIn ? '/api/spotify/start' : undefined}>Connect</a>}</div>
      </section><section className="settings-section"><h2>Music selection</h2><label className="setting-row"><span><strong>Music source</strong><small>Separate from your site sign-in.</small></span><select aria-label="Music source" value={provider} disabled={!!busy || !status?.signedIn} onChange={e => { setKey(''); saveSettings(count, status?.model ?? '', e.target.value); }}><option value="chatgpt">ChatGPT</option><option value="claude">Claude API</option><option value="spotify">Spotify library</option></select></label>
        {provider === 'chatgpt' && <div className="provider-explanation"><h3>ChatGPT · {status?.chatgpt ? 'Connected through your PC' : status?.pc?.online ? 'Reconnect on your PC' : status?.pc?.paired ? 'PC offline' : 'PC not paired'}</h3><p>{status?.chatgpt ? 'Music requests use your desktop ChatGPT connection. Keep your PC on, awake and online while finding songs.' : status?.pc?.online ? 'Open desktop Queue Companion and reconnect ChatGPT, then refresh this page.' : 'Start Queue Companion on your paired PC and keep it awake, then refresh this page.'}</p><p>Once songs are added, Spotify keeps playing on your phone. You can close this page.</p><button className="secondary-button small" disabled={loading || !!busy} onClick={refresh}>Check connection</button></div>}
        {provider === 'spotify' && <div className="provider-explanation"><h3>Spotify library · No AI key needed</h3><p>Mix songs from named playlists, liked songs or recent plays. Similarity uses available Spotify artist genres. Free-text mood requests need a connected AI source.</p></div>}
        {provider === 'claude' && <><div className="connection-row"><span className="connection-icon"><Icon name="queue"/></span><div><h3>Claude API</h3><p>{status?.claude ? 'Connected · Your API credits' : 'Not connected for music selection'}</p></div>{status?.claude && <button className="text-button" disabled={!!busy} onClick={() => disconnect('claude')}>Disconnect</button>}</div>{!status?.claude && <form className="key-form" onSubmit={connectClaude}><label htmlFor="claude-key">API key</label><div><input id="claude-key" type="password" autoComplete="off" spellCheck={false} placeholder="Paste your Claude API key" value={key} onChange={e => setKey(e.target.value)} disabled={!!busy || !status?.signedIn}/><button className="secondary-button small" type="submit" disabled={!key.trim() || !!busy || !status?.signedIn}>Connect</button></div><p>Encrypted on the server. Claude Pro subscriptions don’t include API credits.</p></form>}</>}
      </section><section className="settings-section"><h2>Requests</h2><label className="setting-row"><span><strong>Review before sending</strong><small>Off: generate and send automatically.</small></span><input type="checkbox" aria-label="Review before sending" checked={status?.review ?? false} disabled={!!busy} onChange={e => saveSettings(count, status?.model ?? '', provider, mode, e.target.checked)}/></label><label className="setting-row"><span><strong>Default song count</strong><small>You can change this for each request.</small></span><select value={count} disabled={!!busy} onChange={e => { const value = Number(e.target.value); setCount(value); saveSettings(value); }}>{[5,10,15,20,25,30,40,50].map(n => <option value={n} key={n}>{n}</option>)}</select></label>{(provider === 'claude' && status?.claude || provider === 'chatgpt' && status?.chatgpt) && <label className="setting-row"><span><strong>{provider === 'chatgpt' ? 'ChatGPT model' : 'Claude model'}</strong><small>{provider === 'chatgpt' ? 'Models available through your PC.' : 'Models available to your API key.'}</small></span><select value={models.some(m => m.id === status?.model) ? status?.model : ''} onChange={e => saveSettings(count, e.target.value)} disabled={!!busy}><option value="">Automatic</option>{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</select></label>}<button className="setting-row setting-button" onClick={() => setSheet('queue-tools')}><span><strong>Queue behavior</strong><small>Play now by default, or append. Review is optional.</small></span><Icon name="arrow" size={17}/></button></section>
      <section className="settings-section"><h2>This iPhone</h2><button className="setting-row setting-button" onClick={() => setSheet('install')}><span><strong>Add to Home Screen</strong><small>Open Queue Companion like an app.</small></span><Icon name="arrow" size={17}/></button><button className="setting-row setting-button" onClick={() => setSheet('privacy')}><span><strong>Privacy and saved data</strong><small>Manage your connections and requests.</small></span><Icon name="arrow" size={17}/></button></section><p className="settings-footnote">Queue Companion · Mobile preview<br/>An independent companion for Spotify. Not affiliated with Spotify.</p></div>}
      {(playback?.playing || !!playback?.queue.length) && <p className="attribution"><a href="https://open.spotify.com" target="_blank" rel="noopener noreferrer">Music information provided by Spotify <Icon name="external" size={13}/></a></p>}
    </main><nav className="bottom-nav" aria-label="Main navigation">{nav}</nav>
    {sheet && <div className="sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) setSheet(''); }}><section className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div className="sheet-handle"/><header><h2 id="sheet-title">{sheet === 'device' ? 'Listening on' : sheet === 'install' ? 'Add to Home Screen' : sheet === 'playlist' ? 'Choose a playlist' : sheet === 'queue-tools' ? 'Manage your queue' : 'Privacy and saved data'}</h2><button className="icon-button" aria-label="Close" onClick={() => setSheet('')}><Icon name="close"/></button></header>
      {sheet === 'queue-tools' && <><p><strong>Play now</strong> starts your generated songs from the beginning using one Spotify playback command. It replaces Spotify’s suggested album, playlist or radio context.</p><p><strong>Append to queue</strong> adds songs after the current manually queued songs and keeps the current song playing.</p><p>Spotify’s public API does not provide a way to delete individual manually queued songs. If those remain after starting a selection, clear them in Spotify’s Queue.</p><p>Turn on <strong>Review before sending</strong> in Settings to remove suggestions before they are sent.</p><a className="secondary-button" href="https://support.spotify.com/us/article/play-queue/" target="_blank" rel="noopener noreferrer">Spotify queue instructions</a></>}
      {sheet === 'device' && <><p>Open Spotify on your iPhone so it appears here. If iOS disconnects it while paused, use the first song in your saved selection to reconnect.</p>{(playback?.devices ?? (playback?.device ? [playback.device] : [])).map(target => <button className="playlist-option" key={target.id} onClick={() => { setSelectedDevice(target.id); setSheet(''); }}><Icon name={target.type === 'Smartphone' ? 'phone' : 'device'}/><span><strong>{target.name}</strong><small>{target.available === false ? 'Last seen · Reconnect' : target.id === device?.id ? 'Selected' : target.active ? 'Active' : 'Available · Paused is fine'}</small></span></button>)}<button className="secondary-button" disabled={loading} onClick={refresh}>Refresh devices</button><a className="text-link" href="spotify://" target="_blank" rel="noopener noreferrer">Open Spotify</a><p className="sheet-note">Songs can be generated even when Spotify is closed. Choose an available device to send them.</p></>}
      {sheet === 'install' && <><p>In Safari, open the Share menu, tap <strong>Add to Home Screen</strong>, and leave <strong>Open as Web App</strong> enabled. Then tap Add.</p><p>Your queue keeps playing in Spotify after you close this app.</p>{installPrompt && <button className="primary-button" onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); setSheet(''); }}>Install Queue Companion</button>}<button className="secondary-button" onClick={() => setSheet('')}>Got it</button></>}
      {sheet === 'playlist' && <><p>More than one playlist matches “{choice?.name}”.</p>{choice?.options.map(option => <button className="playlist-option" key={option.uri} onClick={() => { setSheet(''); add({ name: choice.name, uri: option.uri }); }}><span className="connection-icon"><Icon name="queue"/></span><span><strong>{option.name}</strong><small>{option.owner ?? 'Spotify playlist'}</small></span><Icon name="arrow" size={16}/></button>)}</>}
      {sheet === 'privacy' && <><p>Your Spotify tokens and Claude API key are encrypted on the server and tied to your signed-in account. Keys are never saved in browser storage.</p><p>Your selected model receives the request you type. ChatGPT requests pass through your paired PC; its ChatGPT credentials stay there. Your Spotify queue, playlists, artwork and listening history are not sent to the model. Playlist similarity uses genre information locally.</p><p>Requests save your own prompt and the number of songs sent. Selection details expire after ten minutes.</p><button className="secondary-button danger" disabled={!!busy} onClick={async () => { if (!confirm('Remove your saved connections and request history? Your Spotify queue will keep playing.')) return; try { await api('erase', {}); setSheet(''); setRequests([]); setPreview(null); setDelivery(null); setPrompt(''); sessionStorage.removeItem('qc-selection'); sessionStorage.removeItem('qc-last-selection'); sessionStorage.removeItem('qc-draft'); sessionStorage.removeItem('qc-pending-selection'); sessionStorage.removeItem('qc-kept-indices'); setMessage('Saved connections and requests removed.'); await refresh(); } catch (e) { showError(e); } }}>Remove my saved data</button><p className="sheet-note">To revoke Spotify permission completely, remove Queue Companion from your Spotify account’s Apps page.</p></>}
    </section></div>}
  </div>;
}
