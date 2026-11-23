// Small Solid components that output the Feedbacker design system markup, so bundle.css styles them unchanged.
import { createSignal, createUniqueId, For, onCleanup, onMount, Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { fontById, GROUPS, optionsFor, stackOf, type FontRole } from '../../shared/fonts';
import { isHex } from '../../shared/themes';
import { devTheme } from '../admin/appearance';
import { Icon, type IconName } from './icons';

/** Scrolls to a section on the page without changing the URL. Smooth unless the visitor asks for less motion. */
export function scrollToId(id: string) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const el = document.getElementById(id);
  el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  el?.focus({ preventScroll: true });
}

/**
 * The "Falling" mark: a block dropping into its dashed slot. Ink = --text, block = --accent, so it follows the dev theme.
 * `small` is the drawing for 32px and below (solid slot, no ticks, 115% fill). The regular drawing (40px and up)
 * takes a motion: drop (page loading), loading (inline busy), saved (one-shot "it's in"), intro (landing hero, once).
 * All motion stops under prefers-reduced-motion (bundle.css). Arcade squares the corners (app.css).
 */
export function LogoMark(props: { size: number; small?: boolean; motion?: 'drop' | 'loading' | 'saved' | 'intro' }) {
  return (
    <svg class={props.motion ? `fb-logo fbm--${props.motion}` : 'fb-logo'} viewBox="0 0 64 64" width={props.size} height={props.size} aria-hidden="true" style={{ display: 'block', overflow: 'visible' }}>
      {props.small ? (
        <g transform="translate(32 32) scale(1.15) translate(-32 -32)">
          <rect class="fbm-slot" x="9.5" y="33.5" width="45" height="22" rx="4" fill="none" stroke="var(--text)" stroke-width="3.5" />
          <rect class="fbm-block" x="16" y="9" width="32" height="20" rx="5" fill="var(--accent)" transform="rotate(-10 32 19)" />
        </g>
      ) : (
        <>
          <rect class="fbm-slot" x="9.25" y="33.25" width="45.5" height="22.5" rx="4" fill="none" stroke="var(--text)" stroke-width="2.5" stroke-dasharray="5 3.5" stroke-linecap="round" />
          <rect class="fbm-block" x="16" y="9" width="32" height="20" rx="5" fill="var(--accent)" transform="rotate(-10 32 19)" />
          <path class="fbm-ticks" d="M8 12H4M9 19H6" stroke="var(--text)" stroke-width="3" stroke-linecap="round" />
        </>
      )}
    </svg>
  );
}

/** Brand link: the small mark at 30px and the wordmark. The block lifts on hover (bundle.css). Links to the landing page. */
export function Brand(props: { href?: string; intro?: boolean }) {
  return (
    <a class="fb-brand" href={props.href ?? '/'}>
      <span class="fb-mark"><LogoMark size={30} small={!props.intro} motion={props.intro ? 'intro' : undefined} /></span>
      {props.intro
        ? <span class="fbm-word is-intro" aria-label="Feedbacker">{[...'Feedbacker'].map((ch, i) => <span aria-hidden="true" style={{ '--i': i }}>{ch}</span>)}</span>
        : 'Feedbacker'}
    </a>
  );
}

type SegOption<T extends string> = { value: T; label: string; icon?: IconName };
/** Segmented control: a radiogroup of buttons; the selected one has aria-checked (bundle.css shows it). */
export function Seg<T extends string>(props: { label: string; options: readonly SegOption<T>[]; value: T; onChange: (v: T) => void; small?: boolean }) {
  return (
    <div class="fb-seg" classList={{ 'fb-seg--sm': props.small }} role="radiogroup" aria-label={props.label}>
      <For each={props.options}>
        {(o) => (
          <button type="button" role="radio" aria-checked={props.value === o.value} onClick={() => props.onChange(o.value)}>
            <Show when={o.icon}>{(i) => <Icon name={i()} size="sm" />}</Show>
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

/** Range slider with the value always printed (RangeSlider). */
export function Range(props: {
  label: string; min: number; max: number; step?: number; value: number; format: (v: number) => string;
  onInput: (v: number) => void; disabled?: boolean; help?: string;
}) {
  const id = createUniqueId();
  const pct = () => `${((props.value - props.min) / Math.max(1, props.max - props.min)) * 100}%`;
  return (
    <div class="fb-field">
      <label class="fb-label" for={id}>{props.label}</label>
      <div class="fb-range">
        <input id={id} type="range" min={props.min} max={props.max} step={props.step ?? 1} value={props.value} disabled={props.disabled}
          style={{ '--val': pct() }} onInput={(e) => props.onInput(Number(e.currentTarget.value))} />
        <output for={id}>{props.format(props.value)}</output>
      </div>
      <Show when={props.help}><p class="fb-help">{props.help}</p></Show>
    </div>
  );
}

/** Color picker: swatch button plus a mono hex field (ColorField). */
export function ColorField(props: { label: string; value: string; onChange: (hex: string) => void; disabled?: boolean; children?: JSX.Element }) {
  let hexInput!: HTMLInputElement;
  return (
    <div class="fb-field">
      <span class="fb-label">{props.label}</span>
      <div class="fb-color">
        <label class="fb-swatch-btn">
          <span style={{ background: props.value }} />
          <input type="color" value={props.value} disabled={props.disabled} aria-label={`Pick ${props.label.toLowerCase()}`}
            onInput={(e) => props.onChange(e.currentTarget.value)} />
        </label>
        <input ref={hexInput} class="fb-input fb-input--mono" value={props.value.toUpperCase()} maxLength={7} disabled={props.disabled}
          aria-label={`${props.label} hex value`} style={{ width: 'calc(7ch + 34px)', 'flex': 'none' }}
          onInput={(e) => { const v = e.currentTarget.value.trim(); if (isHex(v)) props.onChange(v.toLowerCase()); }}
          onBlur={() => { hexInput.value = props.value.toUpperCase(); }} />
      </div>
      {props.children}
    </div>
  );
}

/** Modal dialog with scrim (Modal). Esc closes, focus moves inside and returns to the opener. */
export function Modal(props: { title: string; onClose: () => void; children: JSX.Element; footer?: JSX.Element; wide?: boolean }) {
  const id = createUniqueId();
  let box!: HTMLDivElement;
  const opener = document.activeElement as HTMLElement | null;
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') props.onClose();
    if (e.key !== 'Tab') return;
    // Keep focus inside the dialog.
    const items = [...box.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
    if (!items.length) return;
    const [first, last] = [items[0]!, items[items.length - 1]!];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  onMount(() => {
    document.addEventListener('keydown', onKey);
    (box.querySelector<HTMLElement>('input, select, textarea') ?? box.querySelector<HTMLElement>('.fb-modal-f button, .fb-modal-h button'))?.focus();
  });
  onCleanup(() => {
    document.removeEventListener('keydown', onKey);
    opener?.focus?.();
  });
  return (
    <Portal>
      <div class="fb-scrim is-fixed" data-dev-theme={devTheme()} onClick={(e) => e.target === e.currentTarget && props.onClose()}>
        <div ref={box} class="fb-modal" classList={{ 'fb-modal--wide': props.wide }} role="dialog" aria-modal="true" aria-labelledby={id}>
          <div class="fb-modal-h">
            <h2 class="fb-h" id={id}>{props.title}</h2>
            <button type="button" class="fb-btn fb-btn--ghost fb-btn--icon" aria-label="Close" onClick={props.onClose}><Icon name="x" /></button>
          </div>
          <div class="fb-modal-b">{props.children}</div>
          <Show when={props.footer}><div class="fb-modal-f">{props.footer}</div></Show>
        </div>
      </div>
    </Portal>
  );
}

/** Empty state: icon disc, a title that states the fact, one sentence of next step, at most one button. */
export function Empty(props: { icon: IconName; title: string; text: string; children?: JSX.Element }) {
  return (
    <div class="fb-empty">
      <div class="fb-empty-ic"><Icon name={props.icon} /></div>
      <h3>{props.title}</h3>
      <p>{props.text}</p>
      {props.children}
    </div>
  );
}

/** Save state in words (StatusText). */
export function SaveStatus(props: { saving: boolean; dirty: boolean; error: string; onRetry: () => void }) {
  return (
    <Show
      when={!props.error}
      fallback={
        <span class="fb-status fb-status--err" role="alert">
          <Icon name="alert" size="sm" />Couldn't save ·{' '}
          <button type="button" class="fb-link" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit' }} onClick={props.onRetry}>Retry</button>
        </span>
      }
    >
      <Show when={!props.saving} fallback={<span class="fb-status" role="status"><span class="fb-spin" aria-hidden="true" />Saving…</span>}>
        <Show when={props.dirty} fallback={<span class="fb-status fb-status--ok" role="status"><Icon name="check" size="sm" />All changes saved</span>}>
          <span class="fb-status fb-status--dirty" role="status">Unsaved changes</span>
        </Show>
      </Show>
    </Show>
  );
}

/** Loading text with spinner. */
export const Loading = (props: { text?: string }) => (
  <p class="fb-loading" role="status" style={{ padding: '24px' }}><LogoMark size={20} motion="loading" />{props.text ?? 'Loading…'}</p>
);

/**
 * Font picker for one role (Settings → Fonts): a listbox where every option is drawn in its own font,
 * grouped like the design system (No download · Sans · Serif · Rounded · Mono · Pixel & display),
 * with only the fonts suited to the role. `emptyLabel` adds a first option for "no choice" (value '').
 * Web fonts load only while the list is open or once chosen.
 * Keyboard: Enter, Space or arrows open; arrows, Home and End move; Enter picks; Esc or Tab closes.
 */
export function FontSelect(props: { label: string; role: FontRole; value: string; onChange: (id: string) => void; emptyLabel?: string; sample?: string }) {
  const id = createUniqueId();
  const opts = optionsFor(props.role);
  const groups = GROUPS.map(([name, test]) => [name, opts.filter(test)] as const).filter(([, list]) => list.length);
  // Flat list in display order: '' is the "no choice" option.
  const flat = [...(props.emptyLabel ? [''] : []), ...groups.flatMap(([, list]) => list.map((f) => f.id))];
  const nameOf = (v: string) => (v ? fontById(v)?.name ?? v : props.emptyLabel ?? '');
  const stack = (v: string) => (v ? stackOf(v) : 'inherit');
  const [open, setOpen] = createSignal(false);
  const [focus, setFocus] = createSignal(props.value);
  let box!: HTMLDivElement;
  let trigger!: HTMLButtonElement;
  let list: HTMLDivElement | undefined;

  const show = () => {
    setFocus(props.value);
    setOpen(true);
    queueMicrotask(() => list?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }));
  };
  const close = (refocus = true) => { setOpen(false); if (refocus) trigger.focus(); };
  const pick = (v: string) => { props.onChange(v); close(); };
  const move = (step: number | 'first' | 'last') => {
    const i = flat.indexOf(focus());
    const n = step === 'first' ? 0 : step === 'last' ? flat.length - 1 : Math.max(0, Math.min(flat.length - 1, i + step));
    setFocus(flat[n]!);
    list?.querySelector(`[data-v="${flat[n]}"]`)?.scrollIntoView({ block: 'nearest' });
  };
  const onKey = (e: KeyboardEvent) => {
    if (!open()) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    const keys: Record<string, () => void> = {
      ArrowDown: () => move(1), ArrowUp: () => move(-1), Home: () => move('first'), End: () => move('last'),
      PageDown: () => move(8), PageUp: () => move(-8), Enter: () => pick(focus()), ' ': () => pick(focus()), Escape: () => close(),
    };
    if (e.key === 'Tab') return close(false);
    if (keys[e.key]) { e.preventDefault(); keys[e.key]!(); }
  };
  const onDoc = (e: MouseEvent) => { if (open() && !box.contains(e.target as Node)) close(false); };
  onMount(() => document.addEventListener('mousedown', onDoc));
  onCleanup(() => document.removeEventListener('mousedown', onDoc));

  const option = (v: string) => (
    <div id={`${id}-${v || 'none'}`} data-v={v} role="option" aria-selected={props.value === v} class="fb-font-opt"
      classList={{ 'is-focus': focus() === v }} style={{ 'font-family': stack(v) }}
      onMouseEnter={() => setFocus(v)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(v)}>
      <span>{nameOf(v)}</span>
      <Show when={props.value === v}><Icon name="check" size="sm" /></Show>
    </div>
  );

  return (
    <div class="fb-field" ref={box} style={{ position: 'relative' }}>
      <span class="fb-label" id={`${id}-l`}>{props.label}</span>
      <div style={{ position: 'relative' }}>
      <button ref={trigger} type="button" class="fb-font-trigger" aria-haspopup="listbox" aria-expanded={open()}
        aria-labelledby={`${id}-l ${id}-v`} aria-controls={`${id}-list`}
        aria-activedescendant={open() ? `${id}-${focus() || 'none'}` : undefined}
        onClick={() => (open() ? close() : show())} onKeyDown={onKey}>
        <span id={`${id}-v`} style={{ 'font-family': stack(props.value) }}>{nameOf(props.value)}</span>
        <Icon name="chev-down" />
      </button>
      <Show when={open()}>
        <div ref={list} id={`${id}-list`} role="listbox" aria-labelledby={`${id}-l`} class="fb-menu fb-font-list">
          <Show when={props.emptyLabel}>{option('')}</Show>
          <For each={groups}>
            {([name, items]) => (
              <div role="group" aria-label={name}>
                <span class="fb-cap fb-menu-t" aria-hidden="true">{name}</span>
                <For each={items}>{(f) => option(f.id)}</For>
              </div>
            )}
          </For>
        </div>
      </Show>
      </div>
      <span style={{ 'font-family': stack(props.value), 'font-size': props.role === 'label' ? '13px' : '17px', 'white-space': 'nowrap', overflow: 'hidden', 'text-overflow': 'ellipsis' }}>
        {props.sample ?? (props.role === 'label' ? 'ROW · 2 COLUMNS · REQUIRED' : 'Tell us about your visit')}
      </span>
      <Show when={props.value && fontById(props.value)?.note}><p class="fb-help">{fontById(props.value)!.note}</p></Show>
    </div>
  );
}

/** A button that opens a menu of choices (fb-menu). Closes on a choice, Esc or a click outside. */
export function MenuButton<T extends string>(props: {
  label: string; icon: IconName; value: T; options: readonly { value: T; label: string }[]; onChange: (v: T) => void; prefix?: string;
}) {
  const [open, setOpen] = createSignal(false);
  let box!: HTMLDivElement;
  const current = () => props.options.find((o) => o.value === props.value)?.label ?? '';
  const onDoc = (e: MouseEvent) => { if (!box.contains(e.target as Node)) setOpen(false); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
  onMount(() => { document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); });
  onCleanup(() => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); });
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button type="button" class="fb-btn fb-btn--secondary fb-btn--sm" aria-haspopup="menu" aria-expanded={open()} onClick={() => setOpen(!open())}>
        <Icon name={props.icon} size="sm" />{props.prefix ?? props.label}: {current()}<Icon name="chev-down" size="sm" />
      </button>
      <Show when={open()}>
        <div class="fb-menu" role="menu" aria-label={props.label} style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, 'z-index': 20 }}>
          <For each={props.options}>
            {(o) => (
              <button type="button" role="menuitemradio" aria-checked={o.value === props.value} onClick={() => { props.onChange(o.value); setOpen(false); }}>
                <span style={{ width: '16px', display: 'inline-grid' }}><Show when={o.value === props.value}><Icon name="check" size="sm" /></Show></span>
                {o.label}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

/**
 * Status ticker (design system: Ticker). Decorative, so aria-hidden: every fact in it also shows on the page.
 * The loop moves by -50%, so the list repeats an even number of times to fill at least twice the bar width.
 * Stops under prefers-reduced-motion (bundle.css).
 */
export function Ticker(props: { items: string[]; reverse?: boolean; ink?: boolean }) {
  const all = () => {
    const items = props.items.filter(Boolean);
    const copies = 2 * Math.max(2, Math.ceil(8 / Math.max(1, items.length)));
    return Array.from({ length: copies }, () => items).flat();
  };
  return (
    <div class="fb-ticker" classList={{ 'is-rev': props.reverse, 'is-ink': props.ink }} aria-hidden="true">
      <span><For each={all()}>{(t) => <b>{t}</b>}</For></span>
    </div>
  );
}
