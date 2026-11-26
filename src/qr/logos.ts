// Ready-made QR center logos: line art on the design system's 24 grid, drawn in the code's color on a rounded plate in
// the code's background color, so a logo always matches its code. Turned into a data URL, so files keep it.
// No .tsx imports here, so the tests can load it; the star, check, mail, link and calendar match src/ui/icons.tsx.
import { presetLogo, stops, type QrLogoId, type QrStyle } from '../../shared/qr';

const ART: Record<QrLogoId, string> = {
  // The Feedbacker mark (src/ui/kit.tsx LogoMark), redrawn on the 24 grid.
  feedbacker: '<rect x="3.6" y="12.6" width="16.8" height="8.4" rx="1.6"/><rect x="6" y="3.6" width="12" height="7.5" rx="1.9" fill="currentColor" stroke="none" transform="rotate(-10 12 7.4)"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  chat: '<path d="M4 5.5h16v10.5H10l-5 4v-4H4z"/><path d="M8 10h8M8 13h5"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4 4 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="2.6"/>',
  'thumbs-up': '<path d="M7.5 10.5v9h-3v-9zM7.5 10.5l3.8-6.5a1.8 1.8 0 0 1 2.5 1.8L13.3 9.5h5.1a1.9 1.9 0 0 1 1.9 2.3l-1.4 6.2a1.9 1.9 0 0 1-1.9 1.5H7.5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  wifi: '<path d="M3.5 9.5a12.5 12.5 0 0 1 17 0M6.5 13a8 8 0 0 1 11 0M9.5 16.4a3.6 3.6 0 0 1 5 0"/><path d="M12 19.5h.01" stroke-width="2.8"/>',
};

/** One preset as SVG markup in `color` on `plate`. */
export function presetSvg(id: QrLogoId, color: string, plate: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${plate}"/>`
    + `<g transform="translate(4 4)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:${color}">${ART[id]}</g></svg>`;
}

/**
 * What the renderer embeds for a design's logo: a preset as a data URL in the code's color, or the uploaded image's
 * URL. Anything else (for example a javascript: link) gives no logo.
 */
export function logoHref(logo: string | undefined, s: Pick<QrStyle, 'fg' | 'bg' | 'gradient' | 'colors'>): string | undefined {
  const id = presetLogo(logo);
  if (!id) return logo && /^(https?:\/\/|\/uploads\/)/i.test(logo.trim()) ? logo.trim() : undefined; // same rule as safeUrl in FormView
  const color = s.gradient === 'none' ? s.fg : stops(s)[0]!;
  return `data:image/svg+xml,${encodeURIComponent(presetSvg(id, color, s.bg))}`;
}
