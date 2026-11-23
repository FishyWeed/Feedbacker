// Draws a QR code as SVG from uqr's module grid, in any of the QrStyle shapes and colors.
import { encode } from 'uqr';
import { captionColorOf, frameColorOf, stops, type QrStyle } from '../../shared/qr';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const f = (n: number) => +n.toFixed(3);

/** Rounded rectangle path. */
const rrect = (x: number, y: number, w: number, h: number, r: number) =>
  r <= 0
    ? `M${x} ${y}h${w}v${h}h${-w}z`
    : `M${f(x + r)} ${y}h${f(w - 2 * r)}a${r} ${r} 0 0 1 ${r} ${r}v${f(h - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${r}` +
      `h${f(-(w - 2 * r))}a${r} ${r} 0 0 1 ${-r} ${-r}v${f(-(h - 2 * r))}a${r} ${r} 0 0 1 ${r} ${-r}z`;
/** Circle path (two arcs), so circles can join one path with evenodd holes. */
const circle = (cx: number, cy: number, r: number) => `M${f(cx - r)} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;

/**
 * SVG markup for `text`. `logoHref` must be a data URL when the SVG is saved or turned into a PNG,
 * because an SVG used as an image does not load outside files.
 */
export function qrSvg(text: string, s: QrStyle, logoHref?: string): string {
  const qr = encode(text, { ecc: logoHref ? 'H' : 'M', border: 0 });
  const n = qr.size;
  const isEye = (x: number, y: number) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

  // The logo sits on a clear square. With error correction H, up to about 30% of the code may be missing.
  const logoW = logoHref ? Math.max(3, Math.round((n * s.logoSize) / 100)) : 0;
  const hole = logoW ? logoW + 2 : 0;
  const h0 = Math.floor((n - hole) / 2);
  const inHole = (x: number, y: number) => hole > 0 && x >= h0 && x < h0 + hole && y >= h0 && y < h0 + hole;
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < n && y < n && !!qr.data[y]![x] && !isEye(x, y) && !inHole(x, y);

  let dots = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!on(x, y)) continue;
      switch (s.dots) {
        case 'square': dots += `M${x} ${y}h1v1h-1z`; break;
        case 'rounded': dots += rrect(x + 0.05, y + 0.05, 0.9, 0.9, 0.3); break;
        case 'dots': dots += circle(x + 0.5, y + 0.5, 0.47); break;
        case 'liquid': {
          // Round a corner only where both neighbors on that corner are empty, so modules join into blobs.
          const r = 0.5;
          const tl = !on(x - 1, y) && !on(x, y - 1) ? r : 0;
          const tr = !on(x + 1, y) && !on(x, y - 1) ? r : 0;
          const br = !on(x + 1, y) && !on(x, y + 1) ? r : 0;
          const bl = !on(x - 1, y) && !on(x, y + 1) ? r : 0;
          dots += `M${x + tl} ${y}H${x + 1 - tr}` + (tr ? `a${r} ${r} 0 0 1 ${r} ${r}` : '') +
            `V${y + 1 - br}` + (br ? `a${r} ${r} 0 0 1 ${-r} ${r}` : '') +
            `H${x + bl}` + (bl ? `a${r} ${r} 0 0 1 ${-r} ${-r}` : '') +
            `V${y + tl}` + (tl ? `a${r} ${r} 0 0 1 ${r} ${-r}` : '') + 'z';
          break;
        }
      }
    }
  }

  let eyeFrames = '';
  let eyeDots = '';
  for (const [ex, ey] of [[0, 0], [n - 7, 0], [0, n - 7]] as const) {
    if (s.eyeFrame === 'circle') eyeFrames += circle(ex + 3.5, ey + 3.5, 3.5) + circle(ex + 3.5, ey + 3.5, 2.5);
    else {
      const [ro, ri] = s.eyeFrame === 'rounded' ? [2, 1.2] : [0, 0];
      eyeFrames += rrect(ex, ey, 7, 7, ro) + rrect(ex + 1, ey + 1, 5, 5, ri);
    }
    eyeDots += s.eyeDot === 'circle' ? circle(ex + 3.5, ey + 3.5, 1.5) : rrect(ex + 2, ey + 2, 3, 3, s.eyeDot === 'rounded' ? 0.9 : 0);
  }

  // --- Paint: solid color, or a gradient over the n x n code area ---
  const id = `q${Math.random().toString(36).slice(2, 8)}`;
  const c = stops(s);
  const stopTags = (list: string[]) => list.map((col, i) => `<stop offset="${f(i / (list.length - 1))}" stop-color="${col}"/>`).join('');
  let defs = '';
  if (s.gradient === 'linear') {
    // A line through the centre at `angle`, long enough to reach the far corners.
    const a = (s.angle * Math.PI) / 180;
    const [dx, dy] = [Math.cos(a), Math.sin(a)];
    const half = ((Math.abs(dx) + Math.abs(dy)) * n) / 2;
    const ctr = n / 2;
    defs = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(ctr - dx * half)}" y1="${f(ctr - dy * half)}" x2="${f(ctr + dx * half)}" y2="${f(ctr + dy * half)}">${stopTags(c)}</linearGradient>`;
  } else if (s.gradient === 'radial') {
    defs = `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n / 2}" cy="${n / 2}" r="${f(n * 0.72)}">${stopTags(c)}</radialGradient>`;
  } else if (s.gradient === 'corners') {
    // SVG has no four-corner gradient. Draw the bottom edge blend, then the top edge blend over it,
    // faded from top to bottom by a mask. The result blends the four colors smoothly (bilinear).
    defs =
      `<linearGradient id="${id}t" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${n}" y2="0">${stopTags([c[0]!, c[1]!])}</linearGradient>` +
      `<linearGradient id="${id}b" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${n}" y2="0">${stopTags([c[3]!, c[2]!])}</linearGradient>` +
      `<linearGradient id="${id}v" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${n}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>` +
      `<mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="${n}" height="${n}"><rect width="${n}" height="${n}" fill="url(#${id}v)"/></mask>`;
  }
  const paint = (d: string, evenodd = false) => {
    const rule = evenodd ? ' fill-rule="evenodd"' : '';
    if (s.gradient === 'none') return `<path d="${d}" fill="${s.fg}"${rule}/>`;
    if (s.gradient === 'corners') return `<path d="${d}" fill="url(#${id}b)"${rule}/><path d="${d}" fill="url(#${id}t)" mask="url(#${id}m)"${rule}/>`;
    return `<path d="${d}" fill="url(#${id})"${rule}/>`;
  };
  const eyes = s.eyeGradient
    ? paint(eyeFrames, true) + paint(eyeDots)
    : `<path d="${eyeFrames}" fill="${s.eye}" fill-rule="evenodd"/><path d="${eyeDots}" fill="${s.eye}"/>`;
  const frameColor = frameColorOf(s);

  const m = s.margin;
  const q = n + 2 * m; // code plus quiet zone
  const pad = s.frame ? 1.5 : 0;
  const capH = s.frame && s.caption ? 5 : 0;
  const W = q + 2 * pad;
  const H = q + 2 * pad + capH;

  const logo = logoHref
    ? `<image href="${esc(logoHref)}" x="${f((n - logoW) / 2)}" y="${f((n - logoW) / 2)}" width="${logoW}" height="${logoW}" preserveAspectRatio="xMidYMid meet"/>`
    : '';
  const code =
    `<g transform="translate(${pad + m} ${pad + m})">` +
    paint(dots) +
    eyes +
    logo +
    '</g>';
  const back = s.frame
    ? `<rect width="${W}" height="${H}" rx="2.5" fill="${frameColor}"/><rect x="${pad}" y="${pad}" width="${q}" height="${q}" rx="1.5" fill="${s.bg}"/>` +
      (capH ? `<text x="${W / 2}" y="${f(q + 2 * pad + capH / 2 - 0.6)}" fill="${captionColorOf(s)}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="2.6" font-weight="700" text-anchor="middle" dominant-baseline="middle">${esc(s.caption)}</text>` : '')
    : `<rect width="${W}" height="${H}" fill="${s.bg}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 10}" height="${H * 10}">${defs ? `<defs>${defs}</defs>` : ''}${back}${code}</svg>`;
}
