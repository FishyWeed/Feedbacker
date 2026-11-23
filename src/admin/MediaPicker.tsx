// Upload from this computer or use a web address (FileDrop): idle, drag-over, uploading, error, done.
import { createSignal, Match, Show, Switch } from 'solid-js';
import { uploadFile } from '../api';
import { safeUrl } from '../form/FormView';
import { Icon } from '../ui/icons';

type Props = {
  url?: string;
  /** Value for the file input `accept` attribute. */
  accept: string;
  /** "an image", "an image or video" */
  what: string;
  limits: string;
  onChange: (url: string, type: string) => void;
};

const MB = 1024 * 1024;
const maxFor = (type: string) => (type.startsWith('video/') ? 25 * MB : 5 * MB);
const isVideo = (url?: string) => /\.(mp4|webm)(\?|$)/i.test(url ?? '');

export default function MediaPicker(props: Props) {
  const [state, setState] = createSignal<'idle' | 'over' | 'busy' | 'error'>('idle');
  const [error, setError] = createSignal('');
  const [fileName, setFileName] = createSignal('');
  const [link, setLink] = createSignal('');
  let input!: HTMLInputElement;

  async function send(file: File | undefined) {
    if (!file) return;
    if (file.size > maxFor(file.type)) {
      setError(`That file is too big (${Math.ceil(file.size / MB)} MB). Images up to 5 MB, videos up to 25 MB.`);
      return setState('error');
    }
    setFileName(file.name);
    setState('busy');
    try {
      const r = await uploadFile(file);
      props.onChange(r.url, r.type);
      setState('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload failed. Try again.');
      setState('error');
    } finally {
      input.value = '';
    }
  }
  const pick = () => input.click();

  return (
    <div style={{ display: 'flex', 'flex-direction': 'column', gap: '12px' }}>
      <input ref={input} type="file" accept={props.accept} hidden onChange={(e) => send(e.currentTarget.files?.[0])} />
      <Switch>
        <Match when={state() === 'busy'}>
          <div class="fb-drop is-busy" aria-busy="true" role="status">
            <strong>Uploading {fileName()}</strong>
            <div class="fb-progress" aria-hidden="true"><span style={{ width: '60%' }} /></div>
          </div>
        </Match>
        <Match when={state() === 'error'}>
          <div class="fb-drop is-error" role="alert">
            <Icon name="file-x" size="lg" />
            <strong>{error()}</strong>
            <button class="fb-btn fb-btn--secondary fb-btn--sm" onClick={() => { setState('idle'); pick(); }}><Icon name="refresh" size="sm" />Try another file</button>
          </div>
        </Match>
        <Match when={safeUrl(props.url)}>
          {(u) => (
            <div class="fb-media">
              <Show when={isVideo(u())} fallback={<img src={u()} alt="" style={{ width: '100%', 'aspect-ratio': '16/9', 'object-fit': 'cover', display: 'block' }} />}>
                <video src={u()} muted loop autoplay playsinline style={{ width: '100%', 'aspect-ratio': '16/9', 'object-fit': 'cover', display: 'block' }} />
              </Show>
              <div class="fb-media-bar">
                <button class="fb-btn fb-btn--secondary fb-btn--sm" onClick={pick}>Replace</button>
                <button class="fb-btn fb-btn--secondary fb-btn--sm fb-btn--icon" aria-label="Remove" onClick={() => props.onChange('', '')}><Icon name="trash" size="sm" /></button>
              </div>
            </div>
          )}
        </Match>
        <Match when={true}>
          <div class="fb-drop" classList={{ 'is-over': state() === 'over' }} role="button" tabIndex={0}
            onClick={pick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), pick())}
            onDragOver={(e) => { e.preventDefault(); setState('over'); }}
            onDragLeave={() => setState('idle')}
            onDrop={(e) => { e.preventDefault(); setState('idle'); send(e.dataTransfer?.files[0]); }}>
            <Icon name="upload" size="lg" />
            <strong>{state() === 'over' ? 'Release to upload' : `Drop ${props.what}`}</strong>
            <span class="fb-help">or <span class="fb-link">choose a file</span> · {props.limits}</span>
          </div>
        </Match>
      </Switch>
      <div class="fb-or">or a web address</div>
      <form class="fb-input-row" onSubmit={(e) => { e.preventDefault(); if (safeUrl(link())) { props.onChange(link().trim(), ''); setLink(''); } }}>
        <input class="fb-input" type="url" placeholder="https://…" aria-label="Web address" value={link()} onInput={(e) => setLink(e.currentTarget.value)} />
        <button class="fb-btn fb-btn--secondary" disabled={!safeUrl(link())}>Use</button>
      </form>
    </div>
  );
}
