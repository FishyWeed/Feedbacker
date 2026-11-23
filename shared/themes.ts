// Form themes and backgrounds, from the Feedbacker design system (Themes.md, Backgrounds.md).
// The design system's bundle.css holds the CSS: `.fb-theme-<id>` classes and `.fbg--<id>` backgrounds.
// This file holds the data the app needs: names, palettes (for tests and QR colors), checks and the custom-accent rule.
import { THEME_DATA } from './themes.data';

export type Palette = {
  bg: string; surface: string; surface2: string; border: string;
  text: string; muted: string; accent: string; danger: string;
};
export type FontId = 'system' | 'serif' | 'rounded' | 'mono';
export type RadiusId = 'sharp' | 'soft' | 'round';
export type ThemeMode = 'auto' | 'light' | 'dark';
export type ThemeDef = { id: string; name: string; font: string; radius: string; background: string; light: Palette; dark: Palette };

export const THEMES = THEME_DATA as (ThemeDef & { font: FontId; radius: RadiusId; background: BackgroundId })[];

/** Backgrounds and how many particle elements (<i>) each needs (Backgrounds.md). */
export const BACKGROUNDS = [
  { id: 'mist', name: 'Mist', particles: 3 },
  { id: 'aurora', name: 'Aurora', particles: 3 },
  { id: 'waves', name: 'Waves', particles: 3 },
  { id: 'sunrise', name: 'Sunrise', particles: 3 },
  { id: 'bokeh', name: 'Fireflies', particles: 10 },
  { id: 'stars', name: 'Stars', particles: 12 },
  { id: 'scanlines', name: 'Scanlines', particles: 3 },
  { id: 'pixels', name: 'Pixel clouds', particles: 10 },
  { id: 'ticker', name: 'Ticker', particles: 3 },
  { id: 'paper', name: 'Paper grain', particles: 3 },
  { id: 'gridglow', name: 'Grid glow', particles: 3 },
  { id: 'telemetry', name: 'Telemetry', particles: 10 },
  { id: 'petals', name: 'Petals', particles: 5 },
  { id: 'confetti', name: 'Confetti', particles: 10 },
  { id: 'swirl', name: 'Swirl', particles: 9 },
  { id: 'bubbles', name: 'Doodles', particles: 7 },
  { id: 'orbits', name: 'Orbits', particles: 8 },
  { id: 'crosshair', name: 'Crosshair', particles: 7 },
  { id: 'enso', name: 'Enso', particles: 5 },
] as const;
export type BackgroundId = (typeof BACKGROUNDS)[number]['id'];

export const FONTS: Record<FontId, { name: string }> = {
  system: { name: 'System' }, serif: { name: 'Serif' }, rounded: { name: 'Rounded' }, mono: { name: 'Mono' },
};
export const RADII: Record<RadiusId, { name: string }> = {
  sharp: { name: 'Sharp' }, soft: { name: 'Soft' }, round: { name: 'Round' },
};

export type CustomTheme = { accent: string; font: FontId; radius: RadiusId };
/** `preset` is a theme id or 'custom'. */
export type FormTheme = { preset: string; mode: ThemeMode; custom?: CustomTheme };
/** 'theme' = the background that matches the theme. */
export type FormBackground = {
  kind: 'theme' | 'none' | 'preset' | 'color' | 'image' | 'video';
  preset?: BackgroundId; color?: string; url?: string;
  dim?: number; // 0-90, percent of the theme background color laid over the media ("Fade into theme color")
  blur?: number; // 0-20 px, uploaded media only
};

export const DEFAULT_THEME: FormTheme = { preset: 'default', mode: 'auto' };
export const DEFAULT_BACKGROUND: FormBackground = { kind: 'theme' };

// --- Color math: sRGB, WCAG contrast and OKLCH (Björn Ottosson's OKLab) ---
export const isHex = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map(toLinear);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};
/** Text on a filled color: #FFFFFF or #111111, whichever contrasts more. */
export const onColor = (hex: string) => (contrast(hex, '#ffffff') >= contrast(hex, '#111111') ? '#ffffff' : '#111111');

type Oklch = { L: number; C: number; h: number };
export function toOklch(hex: string): Oklch {
  const [r, g, b] = rgb(hex).map(toLinear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: Math.atan2(B, A) };
}
function oklchToLinear({ L, C, h }: Oklch): number[] {
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
const inGamut = (lin: number[]) => lin.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

const clipHex = (lin: number[]) =>
  '#' + lin.map((c) => Math.round(Math.min(1, Math.max(0, fromLinear(Math.max(0, c)))) * 255).toString(16).padStart(2, '0')).join('');
const deltaEOK = (a: Oklch, b: Oklch) =>
  Math.hypot(a.L - b.L, a.C * Math.cos(a.h) - b.C * Math.cos(b.h), a.C * Math.sin(a.h) - b.C * Math.sin(b.h));

/**
 * OKLCH to hex with the CSS Color 4 gamut-mapping algorithm: lower chroma (same lightness and hue)
 * until clipping to sRGB changes the color by less than a just-noticeable difference (0.02 deltaEOK).
 */
export function fromOklch(o: Oklch): string {
  if (o.L >= 1) return '#ffffff';
  if (o.L <= 0) return '#000000';
  if (inGamut(oklchToLinear(o))) return clipHex(oklchToLinear(o));
  const JND = 0.02;
  const EPS = 0.0001;
  const clip = (c: Oklch) => clipHex(oklchToLinear(c));
  let current = { ...o };
  let clipped = clip(current);
  if (deltaEOK(toOklch(clipped), current) < JND) return clipped;
  let [min, max, minInGamut] = [0, o.C, true];
  while (max - min > EPS) {
    const chroma = (min + max) / 2;
    current = { ...o, C: chroma };
    if (minInGamut && inGamut(oklchToLinear(current))) { min = chroma; continue; }
    clipped = clip(current);
    const e = deltaEOK(toOklch(clipped), current);
    if (e < JND) {
      if (JND - e < EPS) return clipped;
      minInGamut = false;
      min = chroma;
    } else max = chroma;
  }
  return clipped;
}

const LIGHT_SURFACE = '#ffffff';
const DARK_SURFACE = '#161a22';

/**
 * The custom-accent rule from Themes.md:
 * light: lower OKLCH lightness in 0.01 steps until the accent reaches 3:1 on white;
 * dark: same hue, lightness at least 0.74, chroma at most 0.16, then raise lightness until 4.5:1 on #161A22.
 */
export function customAccents(accent: string): { light: string; dark: string; lightChanged: boolean; lightRatio: number } {
  const o = toOklch(accent);
  let light = accent.toLowerCase();
  for (let L = o.L; contrast(light, LIGHT_SURFACE) < 3 && L > 0; L -= 0.01) light = fromOklch({ ...o, L: Math.max(0, L - 0.01) });
  let L = Math.max(o.L, 0.74);
  const C = Math.min(o.C, 0.16);
  let dark = fromOklch({ L, C, h: o.h });
  while (contrast(dark, DARK_SURFACE) < 4.5 && L < 1) dark = fromOklch({ L: (L += 0.01), C, h: o.h });
  return { light, dark, lightChanged: light !== accent.toLowerCase(), lightRatio: contrast(accent, LIGHT_SURFACE) };
}

export type ResolvedTheme = {
  /** CSS class(es) for the theme. Custom themes start from Default's neutrals. */
  className: string;
  /** Inline CSS variables (custom themes only). */
  vars: Record<string, string>;
  light: Palette; dark: Palette; font: FontId; radius: RadiusId; background: BackgroundId;
};

export function resolveTheme(t: FormTheme | undefined): ResolvedTheme {
  if (t?.preset === 'custom' && t.custom) {
    const base = THEMES[0]!;
    const a = customAccents(t.custom.accent);
    return {
      className: 'fb-theme-default fb-custom',
      vars: {
        '--cl-accent': a.light, '--cl-on-accent': onColor(a.light),
        '--cd-accent': a.dark, '--cd-on-accent': onColor(a.dark),
        '--font': `var(--font-${t.custom.font})`,
        '--radius': `var(--radius-${t.custom.radius})`,
        '--radius-ctl': t.custom.radius === 'sharp' ? 'var(--radius-sharp)' : `var(--radius-ctl-${t.custom.radius})`,
      },
      light: { ...base.light, accent: a.light }, dark: { ...base.dark, accent: a.dark },
      font: t.custom.font, radius: t.custom.radius, background: base.background,
    };
  }
  const def = THEMES.find((x) => x.id === t?.preset) ?? THEMES[0]!;
  return { className: `fb-theme-${def.id}`, vars: {}, light: def.light, dark: def.dark, font: def.font, radius: def.radius, background: def.background };
}

// --- Checks for data saved by the editor ---
const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : undefined);
const THEME_IDS = [...THEMES.map((t) => t.id), 'custom'];
const BG_IDS: readonly string[] = BACKGROUNDS.map((b) => b.id);

export function parseTheme(x: any): FormTheme | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const preset = pick(x.preset, THEME_IDS, 'default');
  const mode = pick<ThemeMode>(x.mode, ['auto', 'light', 'dark'], 'auto');
  const c = x.custom;
  const custom = c && isHex(c.accent)
    ? { accent: c.accent.toLowerCase(), font: pick<FontId>(c.font, ['system', 'serif', 'rounded', 'mono'], 'system'), radius: pick<RadiusId>(c.radius, ['sharp', 'soft', 'round'], 'soft') }
    : undefined;
  if (preset === 'custom' && !custom) return { preset: 'default', mode };
  return { preset, mode, custom };
}

export function parseBackground(x: any): FormBackground | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const kind = pick<FormBackground['kind']>(x.kind, ['theme', 'none', 'preset', 'color', 'image', 'video'], 'theme');
  const url = typeof x.url === 'string' && /^(https?:\/\/|\/uploads\/)/i.test(x.url) ? x.url.slice(0, 2000) : undefined;
  return {
    kind,
    preset: BG_IDS.includes(x.preset) ? x.preset : undefined,
    color: isHex(x.color) ? x.color : undefined,
    url,
    dim: num(x.dim, 0, 90),
    blur: num(x.blur, 0, 20),
  };
}
