import { expect, test } from 'bun:test';
import { captionColorOf, colorProblems, DEFAULT_QR, frameColorOf, GRADIENT_PRESETS, parseQr, resolveQr, stopNames, stops } from '../../shared/qr';
import { resolveTheme } from '../../shared/themes';
import { logoHref } from './logos';
import { qrSvg } from './render';

const ocean = resolveTheme({ preset: 'ocean', mode: 'dark' });

test('default mode is plain black on white, whatever the custom fields say', () => {
  const s = resolveQr({ ...DEFAULT_QR, fg: '#ff0000', dots: 'dots' }, ocean);
  expect([s.fg, s.bg, s.dots, s.eyeFrame]).toEqual(['#000000', '#ffffff', 'square', 'square']);
});

test('"match theme" uses the light palette, even for a form shown in dark mode', () => {
  const s = resolveQr({ ...DEFAULT_QR, mode: 'custom', matchTheme: true, fg: '#ff0000' }, ocean);
  expect([s.fg, s.eye, s.bg]).toEqual([ocean.light.text, ocean.light.accent, ocean.light.surface]);
  expect(colorProblems(s)).toEqual([]);
});

test('low contrast and light-on-dark codes are flagged', () => {
  const base = resolveQr({ ...DEFAULT_QR, mode: 'custom', matchTheme: false }, ocean);
  expect(colorProblems({ ...base, fg: '#dddddd' })[0]).toContain('code color');
  expect(colorProblems({ ...base, fg: '#ffffff', eye: '#ffffff', bg: '#000000' })).toContain('Light code on a dark background: many phone scanners cannot read it.');
});

test('parseQr clamps numbers and drops unsafe logo links', () => {
  const q = parseQr({ mode: 'custom', dots: 'stars', logo: 'javascript:alert(1)', logoSize: 90, margin: 0, caption: 'x'.repeat(50) })!;
  expect([q.dots, q.logo, q.logoSize, q.margin, q.caption.length]).toEqual(['rounded', undefined, 25, 1, 30]);
});

test('renderer: every style makes valid SVG; a logo clears a centre area and embeds the image', () => {
  for (const dots of ['square', 'rounded', 'dots', 'liquid'] as const) {
    const svg = qrSvg('https://example.com/f/abc', { ...resolveQr({ ...DEFAULT_QR, mode: 'custom' }, ocean), dots });
    expect(svg).toStartWith('<svg');
    expect(svg).not.toContain('NaN');
  }
  const s = resolveQr({ ...DEFAULT_QR, mode: 'custom', dots: 'square', frame: true, caption: 'Scan <me>' }, ocean);
  const plain = qrSvg('https://example.com/f/abc', s);
  const withLogo = qrSvg('https://example.com/f/abc', s, 'data:image/png;base64,AAAA');
  expect(withLogo).toContain('<image href="data:image/png;base64,AAAA"');
  expect(plain).toContain('Scan &#60;me&#62;'); // caption text is escaped
  expect(plain).not.toContain('<image');
});

test('gradient presets all read well on white', () => {
  for (const p of GRADIENT_PRESETS) {
    const s = { ...resolveQr({ ...DEFAULT_QR, mode: 'custom', matchTheme: false, eyeGradient: true }, ocean), gradient: p.gradient, colors: p.colors };
    expect([p.name, colorProblems(s)]).toEqual([p.name, []]);
  }
});

test('gradients: 2-4 colors for lines and circles, exactly 4 for corners; old saves still load', () => {
  expect(stops({ gradient: 'corners', colors: ['#111111', '#222222'], fg: '#000000' })).toEqual(['#111111', '#222222', '#111111', '#222222']);
  expect(stops({ gradient: 'linear', colors: ['#111111'], fg: '#000000' })).toEqual(['#111111', '#111111']);
  expect(parseQr({ fg: '#000000', fg2: '#4F46E5', gradient: 'radial' })!.colors).toEqual(['#000000', '#4f46e5']);
  expect(parseQr({ colors: ['#111111', 'red', '#222222', '#333333', '#444444', '#555555'], angle: -90 })!).toMatchObject({ colors: ['#111111', '#222222', '#333333', '#444444'], angle: 270 });
});

test('renderer: angle gradient and four-corner blend', () => {
  const base = resolveQr({ ...DEFAULT_QR, mode: 'custom', matchTheme: false }, ocean);
  const lin = qrSvg('https://example.com/f/abc', { ...base, gradient: 'linear', angle: 90, colors: ['#111111', '#222222', '#333333'] });
  expect(lin).toContain('<stop offset="0.5" stop-color="#222222"/>');
  expect(lin).toMatch(/x1="(-?[\d.]+)" y1="-?[\d.]+" x2="\1"/); // 90 degrees runs straight down: x1 equals x2
  const corners = qrSvg('https://example.com/f/abc', { ...base, gradient: 'corners', colors: ['#111111', '#222222', '#333333', '#444444'], eyeGradient: true });
  expect(corners).toContain('<mask');
  expect(corners.match(/mask="url\(#/g)!.length).toBe(3); // code, corner frames and corner dots
});

test('frame card color: own choice or the code color; the caption stays readable', () => {
  const base = { ...resolveQr({ ...DEFAULT_QR, mode: 'custom', matchTheme: false, fg: '#111111', bg: '#ffffff', frame: true, caption: 'Scan me' }, ocean) };
  expect(frameColorOf(base)).toBe('#111111');
  expect(captionColorOf(base)).toBe('#ffffff');
  const yellow = { ...base, frameColor: '#ffd60a' };
  expect(captionColorOf(yellow)).toBe('#111111'); // white on yellow would be unreadable
  expect(qrSvg('https://example.com/f/abc', yellow)).toContain('fill="#ffd60a"');
  expect(parseQr({ frameColor: 'red' })!.frameColor).toBeUndefined();
});

test('warnings name each gradient color as the controls do, with its hex', () => {
  const base = resolveQr({ ...DEFAULT_QR, mode: 'custom', matchTheme: false, bg: '#ffffff', eye: '#111111' }, ocean);
  const corners = colorProblems({ ...base, gradient: 'corners', colors: ['#c2410c', '#be185d', '#23b6e7', '#414210'] });
  expect(corners).toEqual(['The bottom right gradient color (#23B6E7) is too close to the background (#FFFFFF). Use a darker color, at least 4:1 against it.']);
  expect(stopNames('linear', 3)).toEqual(['Start', 'Middle', 'End']);
  expect(stopNames('radial', 2)).toEqual(['Centre', 'Edge']);
});

test('ready-made logos: kept by parseQr, drawn in the code color; unknown ones and unsafe links are dropped', () => {
  expect(parseQr({ mode: 'custom', logo: 'preset:heart' })!.logo).toBe('preset:heart');
  expect(parseQr({ mode: 'custom', logo: 'preset:evil' })!.logo).toBeUndefined();
  const s = { fg: '#123456', bg: '#fafafa', gradient: 'none' as const, colors: ['#123456', '#654321'] };
  const href = logoHref('preset:star', s)!;
  expect(href.startsWith('data:image/svg+xml,')).toBe(true);
  expect(decodeURIComponent(href)).toContain('stroke="#123456"');
  expect(decodeURIComponent(logoHref('preset:star', { ...s, gradient: 'linear' })!)).toContain('stroke="#123456"'); // first gradient color
  expect(logoHref('/uploads/abcdefghij0123456789.png', s)).toBe('/uploads/abcdefghij0123456789.png');
  expect(logoHref('javascript:alert(1)', s)).toBeUndefined();
});
