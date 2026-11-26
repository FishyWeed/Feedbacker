// Scan check, SVG and PNG files for QR codes. Browser only.
import type { QrStyle } from '../../shared/qr';
import { qrSvg } from './render';

const dataUrls = new Map<string, Promise<string | undefined>>();

/** The logo as a data URL, so it is kept when the SVG becomes an image or a file. */
export function inlineLogo(url: string | undefined): Promise<string | undefined> {
  if (!url || url.startsWith('data:')) return Promise.resolve(url); // presets are data URLs already
  if (!dataUrls.has(url)) {
    dataUrls.set(url, fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('Logo not found'))))
      .then((b) => new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(b); }))
      .catch(() => undefined));
  }
  return dataUrls.get(url)!;
}

/** Final SVG for files and checks, with the logo embedded. */
export async function finalSvg(text: string, style: QrStyle, logo?: string) {
  return qrSvg(text, style, await inlineLogo(logo));
}

async function rasterize(svg: string, width: number): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = Math.round((width * img.naturalHeight) / img.naturalWidth);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decodes the drawn code like a phone would. True only if it reads back exactly `expected`.
 * A phone camera sees a softer, smaller image than the SVG, so it also tries smaller sizes.
 */
export async function canScan(svg: string, expected: string): Promise<boolean> {
  const { default: jsQR } = await import('jsqr');
  for (const width of [480, 300, 200]) {
    const canvas = await rasterize(svg, width);
    const img = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    if (jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data === expected) return true;
  }
  return false;
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const downloadSvg = (svg: string, name: string) => download(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);

export async function downloadPng(svg: string, name: string, width = 1024) {
  const canvas = await rasterize(svg, width);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (blob) download(blob, `${name}.png`);
}

export const fileName = (title: string) => `${(title || 'form').replace(/[^\w-]+/g, '-').toLowerCase()}-qr`;
