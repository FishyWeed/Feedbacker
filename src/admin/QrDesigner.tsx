// The editor's "QR code" tab (QRDesigner): default or custom design, with a live scan check.
import { createEffect, createMemo, createSignal, For, Index, Match, on, onCleanup, Show, Switch } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { colorProblems, DEFAULT_QR, frameColorOf, DOT_STYLES, EYE_DOTS, EYE_FRAMES, GRADIENT_PRESETS, MAX_STOPS, resolveQr, stopNames, stops, type Gradient, type QrDesign, type QrStyle } from '../../shared/qr';
import { resolveTheme } from '../../shared/themes';
import { safeUrl } from '../form/FormView';
import { canScan, downloadPng, downloadSvg, fileName, finalSvg } from '../qr/export';
import { qrSvg } from '../qr/render';
import { Icon } from '../ui/icons';
import { ColorField, Range, Seg } from '../ui/kit';
import { useEditor } from './editorStore';
import MediaPicker from './MediaPicker';
import { shareLink } from './SharePanel';

const LABELS: Record<string, string> = { square: 'Square', rounded: 'Rounded', dots: 'Dots', liquid: 'Liquid', circle: 'Circle' };
const SAMPLE = 'https://feedbacker.app/f/sample';

/** Small pictures of each corner shape (Corner eyes), drawn in the current text color. */
const EYE_FRAME_SVG: Record<string, string> = {
  square: '<rect x="2" y="2" width="28" height="28" fill="none" stroke="currentColor" stroke-width="4"/>',
  rounded: '<rect x="2" y="2" width="28" height="28" rx="8" fill="none" stroke="currentColor" stroke-width="4"/>',
  circle: '<circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="4"/>',
};
const EYE_DOT_SVG: Record<string, string> = {
  square: '<rect x="10" y="10" width="12" height="12" fill="currentColor"/>',
  rounded: '<rect x="10" y="10" width="12" height="12" rx="3" fill="currentColor"/>',
  circle: '<circle cx="16" cy="16" r="6" fill="currentColor"/>',
};

/** Scan status for a style: checks with a real decoder after the owner stops changing things. */
export function useScanCheck(text: () => string, style: () => QrStyle, logo: () => string | undefined) {
  const [status, setStatus] = createSignal<'checking' | 'ok' | 'fail'>('checking');
  let run = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(on([text, style, logo], () => {
    const id = ++run;
    setStatus('checking');
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const ok = await finalSvg(text(), style(), logo()).then((svg) => canScan(svg, text())).catch(() => false);
      if (id === run) setStatus(ok ? 'ok' : 'fail');
    }, 350);
  }));
  onCleanup(() => clearTimeout(timer));
  return status;
}

export default function QrDesigner(props: { formId: string }) {
  const ed = useEditor();
  const design = () => ed.doc.qr ?? DEFAULT_QR;
  const set = (patch: Partial<QrDesign>) => ed.actions.updateForm({ qr: { ...structuredClone(unwrap(design())), ...patch } });
  const theme = createMemo(() => resolveTheme(ed.doc.theme));
  const style = createMemo(() => resolveQr(design(), theme()));
  const custom = () => design().mode === 'custom';
  const logo = () => (custom() ? safeUrl(design().logo) : undefined);
  const link = shareLink(props.formId);
  const svg = createMemo(() => qrSvg(link, style(), logo()));
  const status = useScanCheck(() => link, style, logo);
  const problems = createMemo(() => colorProblems(style()));

  // `on` is a function, so the selection follows the design after the tile is drawn.
  const tile = (patch: Partial<QrDesign>, label: string, on: () => boolean, role: 'radio' | 'button' = 'radio') => (
    <button type="button" class="fb-tile" role={role} aria-checked={role === 'radio' ? on() : undefined} onClick={() => set(patch)}>
      <span class="fb-mini" style={{ background: '#ffffff', padding: '6px' }} innerHTML={qrSvg(SAMPLE, { ...style(), ...patch, frame: false } as QrStyle)} />
      <span class="fb-tile-name">{label}</span>
    </button>
  );

  // --- Gradient ---
  const colorsNow = () => stops(design());
  const names = () => stopNames(design().gradient, colorsNow().length);
  const setStop = (i: number, v: string) => set({ colors: colorsNow().map((c, j) => (j === i ? v : c)) });
  const setGradient = (gradient: Gradient) => set({ gradient, colors: stops({ ...design(), gradient }) });
  const reverse = () => {
    const c = colorsNow();
    // Corners turn half a circle; a line or circle of colors runs the other way.
    set({ colors: design().gradient === 'corners' ? [c[2]!, c[3]!, c[0]!, c[1]!] : [...c].reverse() });
  };

  async function download(kind: 'svg' | 'png') {
    const file = await finalSvg(link, style(), logo());
    const name = fileName(ed.doc.title);
    kind === 'svg' ? downloadSvg(file, name) : downloadPng(file, name);
  }

  return (
    <div class="fb-wrap">
      <h1 class="fb-title" style={{ 'margin-bottom': '20px' }}>QR code</h1>
      <div class="fb-qrd">
        <div class="fb-qrd-ctl">
          <div class="fb-field">
            <span class="fb-label">Style</span>
            <Seg label="QR style" value={design().mode} onChange={(mode) => set({ mode })}
              options={[{ value: 'default', label: 'Default' }, { value: 'custom', label: 'Custom' }]} />
            <p class="fb-help">{custom() ? 'Shape, colors, logo and frame are yours.' : 'Plain black on white. It is the easiest for every phone to scan.'}</p>
          </div>

          <Show when={custom()}>
            <div class="fb-field">
              <label class="fb-switch">
                Match the form theme
                <input class="fb-toggle" type="checkbox" role="switch" checked={design().matchTheme} onChange={(e) => set({ matchTheme: e.currentTarget.checked })} />
              </label>
              <p class="fb-help">{design().matchTheme ? 'Uses the light colors of the form theme, so the code stays dark on light.' : 'Pick your own colors below.'}</p>
            </div>
            <Show when={!design().matchTheme}>
              <div style={{ display: 'flex', gap: '16px', 'flex-wrap': 'wrap' }}>
                <Show when={design().gradient === 'none'}><ColorField label="Code" value={design().fg} onChange={(fg) => set({ fg })} /></Show>
                <Show when={!design().eyeGradient}><ColorField label="Corners" value={design().eye} onChange={(eye) => set({ eye })} /></Show>
                <ColorField label="Background" value={design().bg} onChange={(bg) => set({ bg })} />
              </div>
            </Show>

            <div class="fb-field">
              <span class="fb-label">Gradient</span>
              <Seg small label="Gradient type" value={design().gradient} onChange={setGradient}
                options={[{ value: 'none', label: 'None' }, { value: 'linear', label: 'Linear' }, { value: 'radial', label: 'Radial' }, { value: 'corners', label: 'Four corners' }]} />
            </div>
            <Show when={design().gradient !== 'none'}>
              <Show when={!design().matchTheme} fallback={<p class="fb-help">The gradient uses the theme colors. Turn off "Match the form theme" to pick your own.</p>}>
                <Switch>
                  <Match when={design().gradient === 'corners'}>
                    <div style={{ display: 'grid', 'grid-template-columns': '1fr 1fr', gap: '12px' }} role="group" aria-label="Corner colors">
                      <ColorField label="Top left" value={colorsNow()[0]!} onChange={(v) => setStop(0, v)} />
                      <ColorField label="Top right" value={colorsNow()[1]!} onChange={(v) => setStop(1, v)} />
                      <ColorField label="Bottom left" value={colorsNow()[3]!} onChange={(v) => setStop(3, v)} />
                      <ColorField label="Bottom right" value={colorsNow()[2]!} onChange={(v) => setStop(2, v)} />
                    </div>
                  </Match>
                  <Match when={true}>
                    <div class="fb-field">
                      <span class="fb-label">{design().gradient === 'radial' ? 'Colors, centre to edge' : 'Colors, start to end'}</span>
                      <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap', 'align-items': 'center' }}>
                        <Index each={colorsNow()}>
                          {(c, i) => (
                            <span style={{ display: 'inline-flex', 'flex-direction': 'column', 'align-items': 'center', gap: '4px' }}>
                              <span style={{ display: 'inline-flex', 'align-items': 'center', gap: '2px' }}>
                                <label class="fb-swatch-btn">
                                  <span style={{ background: c() }} />
                                  <input type="color" value={c()} aria-label={`${names()[i]} color`} onInput={(e) => setStop(i, e.currentTarget.value)} />
                                </label>
                                <button type="button" class="fb-btn fb-btn--ghost fb-btn--sm fb-btn--icon" aria-label={`Remove ${names()[i]!.toLowerCase()} color`} disabled={colorsNow().length <= 2}
                                  onClick={() => set({ colors: colorsNow().filter((_, j) => j !== i) })}><Icon name="x" size="sm" /></button>
                              </span>
                              <span class="fb-cap">{names()[i]} · <span style={{ 'font-family': 'var(--font-mono)' }}>{c().toUpperCase()}</span></span>
                            </span>
                          )}
                        </Index>
                        <Show when={colorsNow().length < MAX_STOPS}>
                          <button type="button" class="fb-add" onClick={() => set({ colors: [...colorsNow(), colorsNow().at(-1)!] })}><Icon name="plus" size="sm" /> Add color</button>
                        </Show>
                      </div>
                    </div>
                  </Match>
                </Switch>
                <div><button type="button" class="fb-btn fb-btn--ghost fb-btn--sm" onClick={reverse}><Icon name="refresh" size="sm" />Reverse colors</button></div>
              </Show>
              <Show when={design().gradient === 'linear'}>
                <div class="fb-field">
                  <span class="fb-label">Direction</span>
                  <div style={{ display: 'flex', gap: '4px', 'flex-wrap': 'wrap' }} role="group" aria-label="Quick directions">
                    <For each={[[0, 'arrow-right', 'Left to right'], [90, 'chev-down', 'Top to bottom'], [180, 'arrow-left', 'Right to left'], [270, 'upload', 'Bottom to top']] as const}>
                      {([a, icon, name]) => (
                        <button type="button" class="fb-btn fb-btn--secondary fb-btn--sm" aria-pressed={design().angle === a} onClick={() => set({ angle: a })}>
                          <Icon name={icon} size="sm" />{name}
                        </button>
                      )}
                    </For>
                  </div>
                </div>
                <Range label="Angle" min={0} max={359} value={design().angle} format={(v) => `${v}°`} onInput={(angle) => set({ angle })} />
              </Show>
              <label class="fb-switch">
                Corners use the gradient too
                <input class="fb-toggle" type="checkbox" role="switch" checked={design().eyeGradient} onChange={(e) => set({ eyeGradient: e.currentTarget.checked })} />
              </label>
            </Show>

            <div class="fb-field">
              <span class="fb-label">Gradient presets</span>
              <div class="fb-tiles" style={{ '--tile': '92px' }} role="group" aria-label="Gradient presets">
                <For each={GRADIENT_PRESETS}>
                  {(p) => tile({ gradient: p.gradient, colors: p.colors, angle: p.angle ?? design().angle, matchTheme: false }, p.name, () => false, 'button')}
                </For>
              </div>
            </div>

            <div class="fb-field">
              <span class="fb-label">Dot shape</span>
              <div class="fb-tiles" style={{ '--tile': '92px' }} role="radiogroup" aria-label="Dot shape">
                <For each={DOT_STYLES}>{(d) => tile({ dots: d }, LABELS[d]!, () => design().dots === d)}</For>
              </div>
            </div>
            <div class="fb-field">
              <span class="fb-label">Corner frame</span>
              <div class="fb-eyes" role="radiogroup" aria-label="Corner frame">
                <For each={EYE_FRAMES}>
                  {(d) => (
                    <button type="button" class="fb-eye" role="radio" aria-checked={design().eyeFrame === d} aria-label={`${LABELS[d]} frame`} onClick={() => set({ eyeFrame: d })}>
                      <svg viewBox="0 0 32 32" aria-hidden="true" innerHTML={EYE_FRAME_SVG[d]! + EYE_DOT_SVG[design().eyeDot]!} />
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div class="fb-field">
              <span class="fb-label">Corner dot</span>
              <div class="fb-eyes" role="radiogroup" aria-label="Corner dot">
                <For each={EYE_DOTS}>
                  {(d) => (
                    <button type="button" class="fb-eye" role="radio" aria-checked={design().eyeDot === d} aria-label={`${LABELS[d]} dot`} onClick={() => set({ eyeDot: d })}>
                      <svg viewBox="0 0 32 32" aria-hidden="true" innerHTML={EYE_FRAME_SVG[design().eyeFrame]! + EYE_DOT_SVG[d]!} />
                    </button>
                  )}
                </For>
              </div>
            </div>

            <div class="fb-field">
              <span class="fb-label">Center logo</span>
              <MediaPicker url={design().logo} accept="image/png,image/jpeg,image/gif,image/webp" what="a logo" limits="square PNG works best · up to 5 MB"
                onChange={(url) => set({ logo: url || undefined })} />
              <p class="fb-help">Logos use high error correction (30%) so the code still scans.</p>
            </div>
            <Show when={design().logo}>
              <Range label="Logo size" min={10} max={25} value={design().logoSize} format={(v) => `${v}% of the code`} onInput={(logoSize) => set({ logoSize })} />
            </Show>

            <div class="fb-field">
              <label class="fb-switch">
                Frame with a caption
                <input class="fb-toggle" type="checkbox" role="switch" checked={design().frame} onChange={(e) => set({ frame: e.currentTarget.checked })} />
              </label>
              <Show when={design().frame}>
                <input class="fb-input" aria-label="Caption" value={design().caption} maxLength={30} onInput={(e) => set({ caption: e.currentTarget.value })} />
                <ColorField label="Card color" value={frameColorOf(style())} onChange={(frameColor) => set({ frameColor })}>
                  <p class="fb-help">
                    The caption turns white or near-black to stay readable.{' '}
                    <Show when={design().frameColor}>
                      <button type="button" class="fb-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}
                        onClick={() => set({ frameColor: undefined })}>Use the code color</button>
                    </Show>
                  </p>
                </ColorField>
              </Show>
            </div>
            <Range label="Quiet zone" min={1} max={6} value={design().margin} format={(v) => `${v} ${v === 1 ? 'module' : 'modules'}`} onInput={(margin) => set({ margin })}
              help="The empty margin scanners need. Keep 2 or more." />
          </Show>
        </div>

        <div class="fb-qrd-prev">
          <div class="fb-qrd-stage"><div innerHTML={svg()} role="img" aria-label="QR code for the form link" style={{ width: '100%' }} /></div>
          <Switch>
            <Match when={status() === 'checking'}><p class="fb-loading" role="status"><span class="fb-spin" aria-hidden="true" />Checking that phones can scan it…</p></Match>
            <Match when={status() === 'ok'}>
              <div class="fb-banner fb-banner--ok" role="status"><Icon name="check" /><span><b>Scannable.</b> A QR reader decoded this design.</span></div>
            </Match>
            <Match when={status() === 'fail'}>
              <div class="fb-banner fb-banner--err" role="alert"><Icon name="alert" /><span><b>A QR reader could not decode this design.</b> Try more contrast, a smaller logo or a simpler shape.</span></div>
            </Match>
          </Switch>
          <For each={problems()}>{(p) => <div class="fb-banner fb-banner--warn" role="status"><Icon name="warn" /><span>{p}</span></div>}</For>
          <Show when={custom() && design().margin < 2}>
            <div class="fb-banner fb-banner--warn" role="status"><Icon name="warn" /><span><b>Small quiet zone.</b> Some scanners need 2 or more modules of margin.</span></div>
          </Show>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" class="fb-btn fb-btn--primary" style={{ flex: 1 }} onClick={() => download('png')}><Icon name="download" />Download PNG</button>
            <button type="button" class="fb-btn fb-btn--secondary" style={{ flex: 1 }} onClick={() => download('svg')}><Icon name="download" />Download SVG</button>
          </div>
          <p class="fb-help" style={{ 'text-align': 'center' }}>Save the form to use this design in the share dialog.</p>
        </div>
      </div>
    </div>
  );
}
