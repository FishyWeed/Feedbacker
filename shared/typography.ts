// Form typography: fonts and text formatting for the public form. Unset fonts use the theme's font.
import { fontById, stackOf } from './fonts';

export type FormTypography = {
  body?: string; // font id (Interface role) for questions, answers and paragraphs
  heading?: string; // font id (Headings role) for the title, sections and heading blocks
  size: 'm' | 'l' | 'xl';
  lineHeight: 'tight' | 'normal' | 'relaxed';
  headingWeight: 'regular' | 'bold';
  headingCase: 'normal' | 'upper';
  align: 'left' | 'center';
};

export const DEFAULT_TYPOGRAPHY: FormTypography = { size: 'm', lineHeight: 'normal', headingWeight: 'bold', headingCase: 'normal', align: 'left' };

// Sizes only go up: form text never goes below 16px.
export const SIZES = { m: { name: 'Default', scale: 1 }, l: { name: 'Large', scale: 1.08 }, xl: { name: 'Extra large', scale: 1.16 } } as const;
export const LINE_HEIGHTS = { tight: { name: 'Tight', value: 1.35 }, normal: { name: 'Normal', value: 1.5 }, relaxed: { name: 'Relaxed', value: 1.7 } } as const;

/** CSS custom properties for the public form (`.fb-pub`). `themeFont` is the theme's font id. */
export function typographyVars(t: FormTypography | undefined, themeFont: string): Record<string, string> {
  const x = t ?? DEFAULT_TYPOGRAPHY;
  const body = x.body && fontById(x.body) ? stackOf(x.body) : stackOf(themeFont);
  const heading = x.heading && fontById(x.heading) ? stackOf(x.heading) : body;
  return {
    '--font': body,
    '--font-heading': heading,
    '--fs': String(SIZES[x.size].scale),
    '--lh': String(LINE_HEIGHTS[x.lineHeight].value),
    '--hw': x.headingWeight === 'regular' ? '400' : '700',
    '--hcase': x.headingCase === 'upper' ? 'uppercase' : 'none',
  };
}

const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const font = (id: unknown, role: 'ui' | 'heading') => (typeof id === 'string' && fontById(id)?.roles.includes(role) ? id : undefined);

export function parseTypography(x: any): FormTypography | undefined {
  if (!x || typeof x !== 'object') return undefined;
  const d = DEFAULT_TYPOGRAPHY;
  return {
    body: font(x.body, 'ui'),
    heading: font(x.heading, 'heading'),
    size: pick(x.size, ['m', 'l', 'xl'] as const, d.size),
    lineHeight: pick(x.lineHeight, ['tight', 'normal', 'relaxed'] as const, d.lineHeight),
    headingWeight: pick(x.headingWeight, ['regular', 'bold'] as const, d.headingWeight),
    headingCase: pick(x.headingCase, ['normal', 'upper'] as const, d.headingCase),
    align: pick(x.align, ['left', 'center'] as const, d.align),
  };
}
