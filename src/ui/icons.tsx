// Icon set from the Feedbacker design system (components/Icons): 24 grid, 1.75 stroke, currentColor.
// Generated from the design system preview. Inner SVG markup is static and trusted.
import type { BlockKind } from '../../shared/schema';

export const ICONS = {
  'plus': "<path d=\"M12 5v14M5 12h14\"/>",
  'minus': "<path d=\"M5 12h14\"/>",
  'x': "<path d=\"M6 6l12 12M18 6L6 18\"/>",
  'check': "<path d=\"M5 12.5l4.5 4.5L19 7\"/>",
  'grip': "<g fill=\"currentColor\" stroke=\"none\"><circle cx=\"9\" cy=\"6\" r=\"1.4\"/><circle cx=\"15\" cy=\"6\" r=\"1.4\"/><circle cx=\"9\" cy=\"12\" r=\"1.4\"/><circle cx=\"15\" cy=\"12\" r=\"1.4\"/><circle cx=\"9\" cy=\"18\" r=\"1.4\"/><circle cx=\"15\" cy=\"18\" r=\"1.4\"/></g>",
  'trash': "<path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3\"/>",
  'chev-left': "<path d=\"M15 6l-6 6 6 6\"/>",
  'chev-right': "<path d=\"M9 6l6 6-6 6\"/>",
  'chev-down': "<path d=\"M6 9l6 6 6-6\"/>",
  'arrow-left': "<path d=\"M19 12H5M11 6l-6 6 6 6\"/>",
  'arrow-right': "<path d=\"M5 12h14M13 6l6 6-6 6\"/>",
  'search': "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M20 20l-3.5-3.5\"/>",
  'upload': "<path d=\"M12 16V4M7 9l5-5 5 5M4 20h16\"/>",
  'download': "<path d=\"M12 4v12M7 11l5 5 5-5M4 20h16\"/>",
  'link': "<path d=\"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1\"/>",
  'copy': "<rect x=\"8\" y=\"8\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2\"/>",
  'share': "<path d=\"M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 7l-4-4-4 4M12 3v13\"/>",
  'external': "<path d=\"M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5\"/>",
  'qr': "<rect x=\"3.5\" y=\"3.5\" width=\"6.5\" height=\"6.5\" rx=\"1\"/><rect x=\"14\" y=\"3.5\" width=\"6.5\" height=\"6.5\" rx=\"1\"/><rect x=\"3.5\" y=\"14\" width=\"6.5\" height=\"6.5\" rx=\"1\"/><path d=\"M14 14h3v3M20.5 14v.01M14 20.5h6.5M17 17v3.5\"/>",
  'eye': "<path d=\"M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/>",
  'pen': "<path d=\"M4 20h4L19 9l-4-4L4 16z\"/><path d=\"M13.5 6.5l4 4\"/>",
  'palette': "<path d=\"M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.6-.4-1-.4-1.6 0-.8.7-1.4 1.5-1.4H17a4 4 0 0 0 4-4c0-5.2-4-9.4-9-9.4z\"/><g fill=\"currentColor\" stroke=\"none\"><circle cx=\"7.5\" cy=\"11.5\" r=\"1.3\"/><circle cx=\"10\" cy=\"7.5\" r=\"1.3\"/><circle cx=\"14.5\" cy=\"7.5\" r=\"1.3\"/></g>",
  'image': "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"2\"/><path d=\"M21 16l-5-5L5 20\"/>",
  'video': "<rect x=\"3\" y=\"5\" width=\"13\" height=\"14\" rx=\"2\"/><path d=\"M16 10l5-3v10l-5-3\"/>",
  'sun': "<circle cx=\"12\" cy=\"12\" r=\"4\"/><path d=\"M12 2.5v2M12 19.5v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.5 12h2M19.5 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4\"/>",
  'moon': "<path d=\"M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z\"/>",
  'monitor': "<rect x=\"3\" y=\"4\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M8 20h8M12 16v4\"/>",
  'lock': "<rect x=\"5\" y=\"11\" width=\"14\" height=\"10\" rx=\"2\"/><path d=\"M8 11V7a4 4 0 0 1 8 0v4\"/>",
  'branch': "<circle cx=\"6\" cy=\"5\" r=\"2\"/><circle cx=\"6\" cy=\"19\" r=\"2\"/><circle cx=\"18\" cy=\"7\" r=\"2\"/><path d=\"M6 7v10M18 9c0 4.5-6 3.5-11 8\"/>",
  'columns': "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M9 5v14M15 5v14\"/>",
  'inbox': "<path d=\"M4 13h4l2 3h4l2-3h4M4 13l2.5-8h11L20 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z\"/>",
  'refresh': "<path d=\"M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7\"/>",
  'alert': "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7.5v5.5M12 16.5v.01\"/>",
  'warn': "<path d=\"M12 4l9.5 16h-19z\"/><path d=\"M12 10v4M12 17v.01\"/>",
  'info': "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 11v5.5M12 7.5v.01\"/>",
  'file-x': "<path d=\"M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z\"/><path d=\"M14 3v5h5M10 13l4 4M14 13l-4 4\"/>",
  'short': "<path d=\"M5 6h14M12 6v13\"/>",
  'long': "<path d=\"M4 6h16M4 10h16M4 14h16M4 18h10\"/>",
  'mail': "<rect x=\"3\" y=\"5\" width=\"18\" height=\"14\" rx=\"2\"/><path d=\"M3.5 7l8.5 6 8.5-6\"/>",
  'hash': "<path d=\"M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16\"/>",
  'radio': "<circle cx=\"12\" cy=\"12\" r=\"8\"/><circle cx=\"12\" cy=\"12\" r=\"3\" fill=\"currentColor\" stroke=\"none\"/>",
  'checkbox': "<rect x=\"4\" y=\"4\" width=\"16\" height=\"16\" rx=\"3\"/><path d=\"M8 12l3 3 5-6\"/>",
  'dropdown': "<rect x=\"3\" y=\"6\" width=\"18\" height=\"12\" rx=\"2\"/><path d=\"M13.5 11l2.5 2.5 2.5-2.5\"/>",
  'star': "<path d=\"M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z\"/>",
  'scale': "<path d=\"M4 19v-4M9 19v-8M14 19V8M19 19V4\"/>",
  'toggle': "<rect x=\"2\" y=\"7\" width=\"20\" height=\"10\" rx=\"5\"/><circle cx=\"17\" cy=\"12\" r=\"2.5\"/>",
  'calendar': "<rect x=\"3\" y=\"5\" width=\"18\" height=\"16\" rx=\"2\"/><path d=\"M3 10h18M8 3v4M16 3v4\"/>",
  'heading': "<path d=\"M6 4v16M18 4v16M6 12h12\"/>",
  'paragraph': "<path d=\"M13 4v16M17 4v16M19 4H9.5a4.5 4.5 0 0 0 0 9H13\"/>",
  'divider': "<path d=\"M3 12h18\"/><path d=\"M7 6h10M7 18h10\" opacity=\".45\"/>",
  'button': "<rect x=\"3\" y=\"8\" width=\"18\" height=\"8\" rx=\"4\"/><path d=\"M8 12h8\"/>",
  // Added for the app, same rules as the set (24 grid, 1.75 stroke, round caps). Not in the design system yet.
  'gear': "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1\"/>",
  'sort': "<path d=\"M7 4v16M3.5 16.5L7 20l3.5-3.5M17 20V4M13.5 7.5L17 4l3.5 3.5\"/>",
  'filter': "<path d=\"M3.5 5h17l-6.5 8v6l-4-2v-4z\"/>",
  'type': "<path d=\"M4 7V5h16v2M12 5v14M9 19h6\"/>",
} as const;
export type IconName = keyof typeof ICONS;

/** Decorative by default (aria-hidden). Icon-only buttons need their own aria-label. */
export function Icon(props: { name: IconName; size?: 'sm' | 'lg'; class?: string }) {
  return (
    <svg class={`fb-i${props.size ? ` fb-i--${props.size}` : ''}${props.class ? ` ${props.class}` : ''}`} viewBox="0 0 24 24" aria-hidden="true" innerHTML={ICONS[props.name]} />
  );
}

/** Each block type always uses the same icon: palette, block badge and summary. */
export const KIND_ICON: Record<BlockKind, IconName> = {
  short_text: 'short', long_text: 'long', email: 'mail', number: 'hash', single_choice: 'radio', multi_choice: 'checkbox',
  dropdown: 'dropdown', rating: 'star', scale: 'scale', yes_no: 'toggle', date: 'calendar',
  heading: 'heading', paragraph: 'paragraph', image: 'image', divider: 'divider', button: 'button',
};
