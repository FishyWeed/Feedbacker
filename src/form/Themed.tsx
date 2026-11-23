// Wraps a form in its theme and draws its background, with the design system classes:
// `.fb-pub.fb-theme-<id>[data-mode]` and `.fbg.fbg--<id>` (bundle.css).
import { createMemo, For, Match, onMount, Switch, type JSX } from 'solid-js';
import type { FormDoc } from '../../shared/schema';
import { BACKGROUNDS, DEFAULT_BACKGROUND, resolveTheme, type BackgroundId, type FormBackground, type ResolvedTheme, type ThemeMode } from '../../shared/themes';
import { typographyVars } from '../../shared/typography';
import { safeUrl } from './FormView';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The themed public page (`fb-pub`). `page` makes it fill the window with the background fixed behind it. */
export function Themed(props: { doc: FormDoc; mode?: ThemeMode; page?: boolean; class?: string; children: JSX.Element }) {
  const theme = createMemo(() => resolveTheme(props.doc.theme));
  const vars = createMemo(() => ({ ...theme().vars, ...typographyVars(props.doc.typography, theme().font) }));
  return (
    <div class={`fb-pub ${theme().className}${props.page ? ' is-page' : ''}${props.class ? ` ${props.class}` : ''}`}
      data-mode={props.mode ?? props.doc.theme?.mode ?? 'auto'} data-align={props.doc.typography?.align ?? 'left'} style={vars()}>
      <Backdrop bg={props.doc.background} theme={theme()} />
      {props.children}
    </div>
  );
}

/** The background layer: an animated preset, plain, a solid color, or uploaded media with fade and blur. */
export function Backdrop(props: { bg?: FormBackground; theme: ResolvedTheme }) {
  const bg = () => props.bg ?? DEFAULT_BACKGROUND;
  const preset = () => (bg().kind === 'theme' ? props.theme.background : bg().kind === 'preset' ? (bg().preset ?? props.theme.background) : null);
  const media = () => ({ '--bg-fade': String((bg().dim ?? 0) / 100), '--bg-blur': `${bg().blur ?? 0}px` });
  return (
    <Switch fallback={<span class="fbg fbg--plain" aria-hidden="true" />}>
      <Match when={preset()}>{(id) => <Preset id={id()} />}</Match>
      <Match when={bg().kind === 'color' && bg().color}>
        {(c) => <span class="fbg fbg--solid" style={{ '--bg-solid': c() }} aria-hidden="true" />}
      </Match>
      <Match when={bg().kind === 'image' && safeUrl(bg().url)}>
        {(u) => <span class="fbg fbg--media" style={media()} aria-hidden="true"><img src={u()} alt="" /></span>}
      </Match>
      <Match when={bg().kind === 'video' && safeUrl(bg().url)}>
        {(u) => <span class="fbg fbg--media" style={media()} aria-hidden="true"><BgVideo src={u()} /></span>}
      </Match>
    </Switch>
  );
}

function BgVideo(props: { src: string }) {
  let video!: HTMLVideoElement;
  // Browsers play a video on their own only when it is muted. The property must be set, not only the attribute.
  onMount(() => {
    video.muted = true;
    if (!reducedMotion()) video.play().catch(() => {});
  });
  return <video ref={video} src={props.src} muted loop playsinline preload={reducedMotion() ? 'metadata' : 'auto'} />;
}

/** An animated background: `.fbg--<id>` with the number of particle elements its CSS expects. */
export function Preset(props: { id: BackgroundId }) {
  const count = () => BACKGROUNDS.find((b) => b.id === props.id)?.particles ?? 0;
  return (
    <span class={`fbg fbg--${props.id}`} aria-hidden="true">
      <For each={Array.from({ length: count() })}>{() => <i />}</For>
    </span>
  );
}
