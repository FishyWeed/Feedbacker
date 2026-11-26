// QR code design saved with each form. "default" is plain black on white; "custom" uses every field below.
import { contrast, isHex, onColor, type ResolvedTheme } from './themes';

export const DOT_STYLES = ['square', 'rounded', 'dots', 'liquid'] as const;
export const EYE_FRAMES = ['square', 'rounded', 'circle'] as const;
export const EYE_DOTS = ['square', 'rounded', 'circle'] as const;
export const GRADIENTS = ['none', 'linear', 'radial', 'corners'] as const;
export type DotStyle = (typeof DOT_STYLES)[number];
export type EyeFrame = (typeof EYE_FRAMES)[number];
export type EyeDot = (typeof EYE_DOTS)[number];
/** linear: along `angle`; radial: from the centre out; corners: one color per corner (top left, top right, bottom right, bottom left). */
export type Gradient = (typeof GRADIENTS)[number];

export const MAX_STOPS = 4;

/** Ready-made center logos. They are drawn in the code's color on its background (src/qr/logos.ts). */
export const QR_LOGOS = [
  { id: 'feedbacker', name: 'Feedbacker' }, { id: 'star', name: 'Star' }, { id: 'heart', name: 'Heart' },
  { id: 'chat', name: 'Chat' }, { id: 'smile', name: 'Smile' }, { id: 'thumbs-up', name: 'Thumbs up' },
  { id: 'check', name: 'Check' }, { id: 'mail', name: 'Mail' }, { id: 'link', name: 'Link' },
  { id: 'calendar', name: 'Calendar' }, { id: 'wifi', name: 'Wi-Fi' },
] as const;
export type QrLogoId = (typeof QR_LOGOS)[number]['id'];
export const presetLogo = (logo?: string): QrLogoId | undefined => {
  const id = logo?.startsWith('preset:') ? logo.slice(7) : '';
  return QR_LOGOS.find((l) => l.id === id)?.id;
};

export type QrDesign = {
  mode: 'default' | 'custom';
  matchTheme: boolean; // use the form theme colors instead of fg/eye/bg/colors
  dots: DotStyle;
  eyeFrame: EyeFrame;
  eyeDot: EyeDot;
  fg: string; // code color when there is no gradient
  gradient: Gradient;
  colors: string[]; // gradient colors: 2-4 for linear and radial, 4 for corners
  angle: number; // linear only, 0-359 degrees; 0 = left to right, 90 = top to bottom
  eye: string; // corner color
  eyeGradient: boolean; // corners use the gradient too
  bg: string;
  logo?: string; // "preset:<id>" (QR_LOGOS), or the URL of an uploaded image
  logoSize: number; // 10-25 % of the code width
  margin: number; // quiet zone, 1-6 modules
  frame: boolean;
  frameColor?: string; // card behind the caption; unset = the code color
  caption: string;
};

/** What the renderer draws. */
export type QrStyle = Omit<QrDesign, 'mode' | 'matchTheme'>;

export const DEFAULT_QR: QrDesign = {
  mode: 'default', matchTheme: true, dots: 'rounded', eyeFrame: 'rounded', eyeDot: 'rounded',
  fg: '#111111', gradient: 'none', colors: ['#111111', '#4f46e5'], angle: 45, eye: '#111111', eyeGradient: false,
  bg: '#ffffff', logoSize: 20, margin: 2, frame: false, caption: 'Scan me',
};

/** One-click gradients. Every color reads at 4:1 or better on white (a test checks this). */
export const GRADIENT_PRESETS: { name: string; gradient: Gradient; colors: string[]; angle?: number }[] = [
  { name: 'Ocean', gradient: 'linear', angle: 45, colors: ['#0e7490', '#1d4ed8'] },
  { name: 'Sunset', gradient: 'linear', angle: 45, colors: ['#c2410c', '#be185d'] },
  { name: 'Berry', gradient: 'linear', angle: 135, colors: ['#7c3aed', '#be185d'] },
  { name: 'Forest', gradient: 'linear', angle: 90, colors: ['#166534', '#0f766e'] },
  { name: 'Fire', gradient: 'linear', angle: 0, colors: ['#b91c1c', '#c2410c', '#a16207'] },
  { name: 'Night', gradient: 'radial', colors: ['#1e3a8a', '#111827'] },
  { name: 'Neon', gradient: 'corners', colors: ['#7c3aed', '#2563eb', '#0f766e', '#be185d'] },
  { name: 'Rainbow', gradient: 'corners', colors: ['#dc2626', '#a16207', '#15803d', '#2563eb'] },
];

const PLAIN: QrStyle = {
  dots: 'square', eyeFrame: 'square', eyeDot: 'square', fg: '#000000', gradient: 'none', colors: ['#000000', '#000000'],
  angle: 0, eye: '#000000', eyeGradient: false, bg: '#ffffff', logoSize: 20, margin: 2, frame: false, caption: '',
};

/** Gradient colors with the right count: exactly 4 for corners, 2-4 otherwise. */
export function stops(s: Pick<QrStyle, 'gradient' | 'colors' | 'fg'>): string[] {
  const c = s.colors.length ? s.colors : [s.fg];
  if (s.gradient === 'corners') return [0, 1, 2, 3].map((i) => c[i] ?? c[i % c.length]!);
  return c.length >= 2 ? c.slice(0, MAX_STOPS) : [c[0]!, c[0]!];
}

/**
 * The style to draw. "Match theme" always uses the theme's LIGHT palette: phone scanners read dark codes
 * on a light background far more reliably than the reverse.
 */
export function resolveQr(d: QrDesign | undefined, theme: ResolvedTheme): QrStyle {
  if (!d || d.mode === 'default') return PLAIN;
  const { mode: _m, matchTheme, ...style } = d;
  if (!matchTheme) return style;
  const p = theme.light;
  const accent = contrast(p.accent, p.surface) >= 3 ? p.accent : p.text;
  const colors = d.gradient === 'corners' ? [accent, p.text, accent, p.text] : [p.text, accent];
  return { ...style, fg: p.text, colors, eye: accent, bg: p.surface };
}

/** The frame card color: the owner's choice, else the code color (first gradient color). */
export const frameColorOf = (s: QrStyle) => s.frameColor ?? (s.gradient === 'none' ? s.fg : stops(s)[0]!);
/** Caption text on the card: the background color if it reads well, else white or near-black. */
export const captionColorOf = (s: QrStyle) => {
  const card = frameColorOf(s);
  return contrast(s.bg, card) >= 4.5 ? s.bg : onColor(card);
};

/** Problems that make a code hard to scan, in plain words. Empty when the colors are fine. */
/**
 * Names for the gradient colors, in the order of `stops()`, matching the labels in the designer:
 * corners: top left, top right, bottom right, bottom left; linear: start … end; radial: centre … edge.
 */
export function stopNames(gradient: Gradient, count: number): string[] {
  if (gradient === 'corners') return ['Top left', 'Top right', 'Bottom right', 'Bottom left'];
  const [first, last] = gradient === 'radial' ? ['Centre', 'Edge'] : ['Start', 'End'];
  const middle = count === 3 ? ['Middle'] : count === 4 ? ['Second', 'Third'] : [];
  return [first, ...middle, last];
}

/** Problems that make a code hard to scan, in plain words. Each names the color as the controls do, with its hex. */
export function colorProblems(s: QrStyle): string[] {
  const out: string[] = [];
  const bg = s.bg.toUpperCase();
  const tooClose = (name: string, c: string) =>
    `The ${name} color (${c.toUpperCase()}) is too close to the background (${bg}). Use a darker color, at least 4:1 against it.`;
  if (s.gradient === 'none') {
    if (contrast(s.fg, s.bg) < 4) out.push(tooClose('code', s.fg));
  } else {
    const code = stops(s);
    const names = stopNames(s.gradient, code.length);
    code.forEach((c, i) => {
      if (contrast(c, s.bg) < 4) out.push(tooClose(`${names[i]!.toLowerCase()} gradient`, c));
    });
  }
  if (!s.eyeGradient && contrast(s.eye, s.bg) < 4) out.push(tooClose('corner', s.eye));
  const first = s.gradient === 'none' ? s.fg : stops(s)[0]!;
  if (contrast(s.bg, '#ffffff') > contrast(first, '#ffffff')) out.push('Light code on a dark background: many phone scanners cannot read it.');
  return out;
}

const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
const hex = (v: unknown, fallback: string) => (isHex(v) ? v.toLowerCase() : fallback);

export function parseQr(x: any): QrDesign | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const D = DEFAULT_QR;
  const fg = hex(x.fg, D.fg);
  // Older saves had one second color in `fg2`.
  const rawColors = Array.isArray(x.colors) ? x.colors : isHex(x.fg2) ? [fg, x.fg2] : D.colors;
  const colors = rawColors.filter(isHex).slice(0, MAX_STOPS).map((c: string) => c.toLowerCase());
  return {
    mode: pick(x.mode, ['default', 'custom'] as const, 'default'),
    matchTheme: x.matchTheme !== false,
    dots: pick(x.dots, DOT_STYLES, D.dots),
    eyeFrame: pick(x.eyeFrame, EYE_FRAMES, D.eyeFrame),
    eyeDot: pick(x.eyeDot, EYE_DOTS, D.eyeDot),
    fg, eye: hex(x.eye, D.eye), bg: hex(x.bg, D.bg),
    gradient: pick(x.gradient, GRADIENTS, 'none'),
    colors: colors.length ? colors : D.colors,
    angle: ((num(x.angle, -3600, 3600, D.angle) % 360) + 360) % 360,
    eyeGradient: x.eyeGradient === true,
    logo: presetLogo(x.logo) ? x.logo : typeof x.logo === 'string' && /^(https?:\/\/|\/uploads\/)/i.test(x.logo) ? x.logo.slice(0, 2000) : undefined,
    logoSize: num(x.logoSize, 10, 25, D.logoSize),
    margin: num(x.margin, 1, 6, D.margin),
    frame: x.frame === true,
    frameColor: isHex(x.frameColor) ? x.frameColor.toLowerCase() : undefined,
    caption: typeof x.caption === 'string' ? x.caption.slice(0, 30) : D.caption,
  };
}
