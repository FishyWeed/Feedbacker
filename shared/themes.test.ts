import { expect, test } from 'bun:test';
import { BACKGROUNDS, contrast, customAccents, onColor, parseBackground, parseTheme, resolveTheme, THEMES } from './themes';

test('19 themes, each with a known background', () => {
  expect(THEMES.length).toBe(19);
  const ids = BACKGROUNDS.map((b) => b.id) as string[];
  for (const t of THEMES) expect([t.id, ids.includes(t.background)]).toEqual([t.id, true]);
});

test('every premade theme meets WCAG AA in light and dark mode', () => {
  const problems: string[] = [];
  for (const t of THEMES) {
    for (const [mode, p] of [['light', t.light], ['dark', t.dark]] as const) {
      const check = (what: string, a: string, b: string, min: number) => {
        const c = contrast(a, b);
        if (c < min) problems.push(`${t.id} ${mode} ${what}: ${c.toFixed(2)} < ${min}`);
      };
      check('text on card', p.text, p.surface, 4.5);
      check('muted on card', p.muted, p.surface, 4.5);
      check('text on page', p.text, p.bg, 4.5);
      check('button text on accent', onColor(p.accent), p.accent, 4.5);
      check('accent on card', p.accent, p.surface, 3);
      check('error text on card', p.danger, p.surface, 4.5);
    }
  }
  expect(problems).toEqual([]);
});

// The design system's table (Themes.md, "Custom theme"). The table does not name its sRGB gamut mapping;
// we use CSS Color 4 mapping, so a channel can differ by a few shades. The contrast guarantees are exact.
const close = (a: string, b: string) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 32);
test.each([
  ['#2952cc', '#2952cc', '#83a8fd'],
  ['#f7d046', '#b29108', '#f7d046'],
  ['#00c2cb', '#1ba2a9', '#00c2cb'],
  ['#e11d48', '#e11d48', '#fd7e86'],
  ['#111111', '#111111', '#ababab'],
  ['#ff9500', '#d67e12', '#f9992e'],
])('custom accent %s → light %s, dark %s', (pick, light, dark) => {
  const a = customAccents(pick);
  expect(contrast(a.light, '#ffffff')).toBeGreaterThanOrEqual(3);
  expect(contrast(a.dark, '#161a22')).toBeGreaterThanOrEqual(4.5);
  expect([a.light, close(a.light, light)]).toEqual([a.light, true]);
  expect([a.dark, close(a.dark, dark)]).toEqual([a.dark, true]);
});

test('custom themes start from Default and set accent variables for both modes', () => {
  const r = resolveTheme({ preset: 'custom', mode: 'auto', custom: { accent: '#f7d046', font: 'serif', radius: 'round' } });
  expect(r.className).toBe('fb-theme-default fb-custom');
  expect(r.vars['--cl-on-accent']).toBe(onColor(r.vars['--cl-accent']!));
  expect(r.vars['--font']).toBe('var(--font-serif)');
});

test('theme and background data from the editor is checked', () => {
  expect(parseTheme({ preset: 'nope', mode: 'x' })).toEqual({ preset: 'default', mode: 'auto', custom: undefined });
  expect(parseTheme({ preset: 'zen', mode: 'dark' })?.preset).toBe('zen');
  expect(parseBackground({ kind: 'video', url: 'javascript:alert(1)', dim: 500, blur: -3 }))
    .toEqual({ kind: 'video', preset: undefined, color: undefined, url: undefined, dim: 90, blur: 0 });
  expect(parseBackground({ kind: 'preset', preset: 'enso' })?.preset).toBe('enso');
});
