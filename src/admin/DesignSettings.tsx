// Theme and background pickers (ThemeGallery, BackgroundGallery, CustomTheme, PreviewTile).
// They are separate: any theme works with any background.
import { createMemo, createSignal, For, Show, type JSX } from 'solid-js';
import { unwrap } from 'solid-js/store';
import {
  BACKGROUNDS, contrast, customAccents, DEFAULT_BACKGROUND, DEFAULT_THEME, FONTS, RADII, resolveTheme, THEMES,
  type FontId, type FormBackground, type FormTheme, type RadiusId, type ThemeMode,
} from '../../shared/themes';
import { Backdrop } from '../form/Themed';
import { Icon } from '../ui/icons';
import { ColorField, FontSelect, Range, Seg } from '../ui/kit';
import { PAIRINGS } from '../../shared/fonts';
import { DEFAULT_TYPOGRAPHY, LINE_HEIGHTS, SIZES, type FormTypography } from '../../shared/typography';
import { useEditor } from './editorStore';
import MediaPicker from './MediaPicker';

const plain = <T,>(x: T): T => structuredClone(unwrap(x));
const DEFAULT_CUSTOM = { accent: '#2952cc', font: 'system' as FontId, radius: 'soft' as RadiusId };
const ACCENT_PRESETS = [
  ['Cobalt', '#2952cc'], ['Ocean', '#0a65a0'], ['Teal', '#0b7a62'], ['Pine', '#2e6a39'],
  ['Ember', '#b83d0b'], ['Plum', '#7d1d3f'], ['Violet', '#5b2ee6'], ['Ink', '#111111'],
] as const;

/** A live mini preview: the real theme tokens and background, optionally with a tiny form card. */
function Mini(props: { theme: FormTheme; bg: FormBackground; mode: ThemeMode; card?: string; children?: JSX.Element }) {
  const r = createMemo(() => resolveTheme(props.theme));
  return (
    <span class={`fb-mini ${r().className}`} data-mode={props.mode === 'auto' ? undefined : props.mode} style={r().vars}>
      <Backdrop bg={props.bg} theme={r()} />
      <Show when={props.card}>
        <span class="fb-mini-card"><b>{props.card}</b><i /><i /><u /></span>
      </Show>
      {props.children}
    </span>
  );
}

export default function DesignSettings() {
  const ed = useEditor();
  const theme = () => ed.doc.theme ?? DEFAULT_THEME;
  const bg = () => ed.doc.background ?? DEFAULT_BACKGROUND;
  const setTheme = (patch: Partial<FormTheme>) => ed.actions.updateForm({ theme: { ...plain(theme()), ...patch } });
  const setBg = (patch: Partial<FormBackground>) => ed.actions.updateForm({ background: { ...plain(bg()), ...patch } });
  const custom = () => theme().custom ?? DEFAULT_CUSTOM;
  const setCustom = (patch: Partial<typeof DEFAULT_CUSTOM>) => setTheme({ preset: 'custom', custom: { ...plain(custom()), ...patch } });
  const accents = createMemo(() => customAccents(custom().accent));
  const isMedia = () => bg().kind === 'image' || bg().kind === 'video';
  const matchName = () => BACKGROUNDS.find((b) => b.id === resolveTheme(theme()).background)?.name ?? '';
  const [tab, setTab] = createSignal<'theme' | 'background' | 'typography'>('theme');
  const typo = () => ed.doc.typography ?? DEFAULT_TYPOGRAPHY;
  const setTypo = (patch: Partial<FormTypography>) => ed.actions.updateForm({ typography: { ...plain(typo()), ...patch } });
  const themeFontName = () => FONTS[resolveTheme(theme()).font].name;
  const keepMedia = () => ({ url: bg().url, dim: bg().dim, blur: bg().blur, color: bg().color });

  return (
    <>
      {/* Color mode, then the Theme / Background switch: stays at the top of the panel while the tiles scroll. */}
      <div class="fb-insp-s fb-design-bar" id="design">
        <div class="fb-field">
          <span class="fb-label">Color mode</span>
          <Seg small label="Color mode" value={theme().mode} onChange={(mode) => setTheme({ mode })}
            options={[{ value: 'auto', label: 'Auto', icon: 'monitor' }, { value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }]} />
          <p class="fb-help">Auto follows each visitor's device. Every theme has a light and a dark version.</p>
        </div>
        <Seg label="Show" value={tab()} onChange={setTab}
          options={[{ value: 'theme', label: 'Theme' }, { value: 'background', label: 'Background' }, { value: 'typography', label: 'Typography' }]} />
      </div>

      <Show when={tab() === 'theme'}>
      <div class="fb-insp-s">
        <div class="fb-insp-t">Theme</div>
        <div class="fb-tiles" style={{ '--tile': '120px' }} role="radiogroup" aria-label="Theme">
          <For each={THEMES}>
            {(t) => (
              <button type="button" class="fb-tile" role="radio" aria-checked={theme().preset === t.id} onClick={() => setTheme({ preset: t.id })}>
                <Mini theme={{ preset: t.id, mode: 'auto' }} bg={{ kind: 'theme' }} mode={theme().mode} card={`Aa ${t.name}`} />
                <span class="fb-tile-name">{t.name}<span class="fb-tile-sub">{FONTS[t.font].name} · {RADII[t.radius].name.toLowerCase()}</span></span>
              </button>
            )}
          </For>
          <button type="button" class="fb-tile" role="radio" aria-checked={theme().preset === 'custom'} onClick={() => setCustom({})}>
            <Show when={theme().preset === 'custom'} fallback={
              <span class="fb-mini" style={{ display: 'grid', 'place-items': 'center', background: 'var(--surface2)', border: '1.5px dashed var(--border-strong)' }}><Icon name="palette" /></span>
            }>
              <Mini theme={plain(theme())} bg={{ kind: 'none' }} mode={theme().mode} card="Aa Custom" />
            </Show>
            <span class="fb-tile-name">Custom<span class="fb-tile-sub">Your color, font, corners</span></span>
          </button>
        </div>

        <Show when={theme().preset === 'custom'}>
          <div class="fb-card fb-card--flat" style={{ padding: '16px', display: 'flex', 'flex-direction': 'column', gap: '16px', background: 'var(--surface2)' }}>
            <ColorField label="Accent color" value={custom().accent} onChange={(accent) => setCustom({ accent })}>
              <div class="fb-presets" role="radiogroup" aria-label="Accent presets">
                <For each={ACCENT_PRESETS}>
                  {([name, hex]) => (
                    <button type="button" class="fb-preset" role="radio" aria-checked={custom().accent === hex} aria-label={name} style={{ background: hex }} onClick={() => setCustom({ accent: hex })} />
                  )}
                </For>
              </div>
              <Show when={accents().lightChanged}>
                <div class="fb-banner fb-banner--warn" role="status">
                  <Icon name="warn" />
                  <span>
                    <b>Too light to read on white ({contrast(custom().accent, '#ffffff').toFixed(1)}:1).</b> In light mode buttons and links will use{' '}
                    <code>{accents().light.toUpperCase()}</code>.{' '}
                    <button type="button" class="fb-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }}
                      onClick={() => setCustom({ accent: accents().light })}>Use {accents().light.toUpperCase()} as my color</button>
                  </span>
                </div>
              </Show>
            </ColorField>
            <div class="fb-field">
              <span class="fb-label">Font</span>
              <Seg small label="Font" value={custom().font} onChange={(font) => setCustom({ font })}
                options={(Object.keys(FONTS) as FontId[]).map((f) => ({ value: f, label: FONTS[f].name }))} />
            </div>
            <div class="fb-field">
              <span class="fb-label">Corners</span>
              <Seg small label="Corners" value={custom().radius} onChange={(radius) => setCustom({ radius })}
                options={(Object.keys(RADII) as RadiusId[]).map((r) => ({ value: r, label: RADII[r].name }))} />
            </div>
          </div>
        </Show>

      </div>
      </Show>

      <Show when={tab() === 'background'}>
      <div class="fb-insp-s">
        <div class="fb-insp-t">Background</div>
        <div class="fb-tiles" style={{ '--tile': '120px' }} role="radiogroup" aria-label="Background">
          <button type="button" class="fb-tile" role="radio" aria-checked={bg().kind === 'theme'} onClick={() => setBg({ kind: 'theme', ...keepMedia() })}>
            <Mini theme={plain(theme())} bg={{ kind: 'theme' }} mode={theme().mode} />
            <span class="fb-tile-name">Match theme<span class="fb-tile-sub">{matchName()}</span></span>
          </button>
          <For each={BACKGROUNDS}>
            {(b) => (
              <button type="button" class="fb-tile" role="radio" aria-checked={bg().kind === 'preset' && bg().preset === b.id}
                onClick={() => setBg({ kind: 'preset', preset: b.id, ...keepMedia() })}>
                <Mini theme={plain(theme())} bg={{ kind: 'preset', preset: b.id }} mode={theme().mode} />
                <span class="fb-tile-name">{b.name}<span class="fb-tile-sub">{b.particles} particles</span></span>
              </button>
            )}
          </For>
          <button type="button" class="fb-tile" role="radio" aria-checked={bg().kind === 'none'} onClick={() => setBg({ kind: 'none', ...keepMedia() })}>
            <Mini theme={plain(theme())} bg={{ kind: 'none' }} mode={theme().mode} />
            <span class="fb-tile-name">Plain<span class="fb-tile-sub">Theme background</span></span>
          </button>
          <button type="button" class="fb-tile" role="radio" aria-checked={bg().kind === 'color'} onClick={() => setBg({ kind: 'color', ...keepMedia(), color: bg().color ?? '#e8d5b5' })}>
            <span class="fb-mini" style={{ background: bg().color ?? '#e8d5b5' }} />
            <span class="fb-tile-name">Solid color<span class="fb-tile-sub">{(bg().color ?? '#e8d5b5').toUpperCase()}</span></span>
          </button>
          <button type="button" class="fb-tile" role="radio" aria-checked={isMedia()}
            onClick={() => setBg({ ...keepMedia(), kind: /\.(mp4|webm)(\?|$)/i.test(bg().url ?? '') ? 'video' : 'image', dim: bg().dim ?? 40 })}>
            <Show when={isMedia() && bg().url} fallback={
              <span class="fb-mini" style={{ display: 'grid', 'place-items': 'center', background: 'var(--surface2)', border: '1.5px dashed var(--border-strong)', color: 'var(--muted)' }}><Icon name="upload" /></span>
            }>
              <Mini theme={plain(theme())} bg={plain(bg())} mode={theme().mode} />
            </Show>
            <span class="fb-tile-name">Image or video<span class="fb-tile-sub">Upload or link</span></span>
          </button>
        </div>

        <Show when={bg().kind === 'color'}>
          <ColorField label="Background color" value={bg().color ?? '#e8d5b5'} onChange={(color) => setBg({ color })} />
        </Show>
        <Show when={isMedia()}>
          <MediaPicker url={bg().url} accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm" what="an image or video"
            limits="PNG, JPG, GIF, WebP up to 5 MB · MP4, WebM up to 25 MB"
            onChange={(url, type) => setBg({ url: url || undefined, kind: type.startsWith('video/') || /\.(mp4|webm)(\?|$)/i.test(url) ? 'video' : 'image' })} />
          <Range label="Fade into theme color" min={0} max={90} step={5} value={bg().dim ?? 40} format={(v) => `${v}%`} onInput={(dim) => setBg({ dim })} />
          <Range label="Blur" min={0} max={20} value={bg().blur ?? 0} format={(v) => `${v} px`} onInput={(blur) => setBg({ blur })}
            help="Videos play muted and loop. Visitors who ask for less motion see the first frame." />
        </Show>
        <p class="fb-help">The form card always sits on the theme color, so text stays readable on any background. In Preview, "Show as" checks light and dark.</p>
      </div>
      </Show>

      <Show when={tab() === 'typography'}>
      <div class="fb-insp-s">
        <div class="fb-insp-t">Fonts</div>
        <p class="fb-help">Self-hosted web fonts download only when chosen. "No download" options are instant.</p>
        <FontSelect label="Questions and answers" role="ui" value={typo().body ?? ''} emptyLabel={`Theme font (${themeFontName()})`}
          onChange={(v) => setTypo({ body: v || undefined })} sample="How was your visit today?" />
        <FontSelect label="Title and headings" role="heading" value={typo().heading ?? ''} emptyLabel="Same as questions"
          onChange={(v) => setTypo({ heading: v || undefined })} />
        <div class="fb-field">
          <span class="fb-label">Pairing presets</span>
          <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}>
            <For each={PAIRINGS}>
              {(p) => (
                <button type="button" class="fb-btn fb-btn--secondary fb-btn--sm" aria-pressed={typo().body === p.ui && typo().heading === p.heading}
                  title={p.why} onClick={() => setTypo({ body: p.ui, heading: p.heading })}>{p.name}</button>
              )}
            </For>
          </div>
        </div>
      </div>
      <div class="fb-insp-s">
        <div class="fb-insp-t">Text formatting</div>
        <div class="fb-field">
          <span class="fb-label">Text size</span>
          <Seg small label="Text size" value={typo().size} onChange={(size) => setTypo({ size })}
            options={(Object.keys(SIZES) as FormTypography['size'][]).map((k) => ({ value: k, label: SIZES[k].name }))} />
          <p class="fb-help">Answers never go below 16px, so phones do not zoom in.</p>
        </div>
        <div class="fb-field">
          <span class="fb-label">Line height</span>
          <Seg small label="Line height" value={typo().lineHeight} onChange={(lineHeight) => setTypo({ lineHeight })}
            options={(Object.keys(LINE_HEIGHTS) as FormTypography['lineHeight'][]).map((k) => ({ value: k, label: LINE_HEIGHTS[k].name }))} />
        </div>
        <div class="fb-field">
          <span class="fb-label">Heading weight</span>
          <Seg small label="Heading weight" value={typo().headingWeight} onChange={(headingWeight) => setTypo({ headingWeight })}
            options={[{ value: 'bold', label: 'Bold' }, { value: 'regular', label: 'Regular' }]} />
        </div>
        <div class="fb-field">
          <span class="fb-label">Heading case</span>
          <Seg small label="Heading case" value={typo().headingCase} onChange={(headingCase) => setTypo({ headingCase })}
            options={[{ value: 'normal', label: 'As typed' }, { value: 'upper', label: 'UPPERCASE' }]} />
        </div>
        <div class="fb-field">
          <span class="fb-label">Title alignment</span>
          <Seg small label="Title alignment" value={typo().align} onChange={(align) => setTypo({ align })}
            options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }]} />
        </div>
        <div><button type="button" class="fb-btn fb-btn--ghost fb-btn--sm" onClick={() => ed.actions.updateForm({ typography: undefined })}><Icon name="refresh" size="sm" />Reset typography</button></div>
      </div>
      </Show>
    </>
  );
}
