// Owner (dev mode) appearance: dev theme, color mode and fonts. Separate from form themes.
import { fontById, type FontRole } from './fonts';

export const DEV_THEMES = [
  { id: 'default', name: 'Default', idea: 'Cobalt on cool paper' },
  { id: 'workbench', name: 'Workbench', idea: 'Graphite and signal orange' },
  { id: 'blueprint', name: 'Blueprint', idea: 'Navy ink on drafting blue' },
  { id: 'arcade', name: 'Arcade', idea: 'Neo-brutalist frames, lime on violet' },
  { id: 'ink', name: 'Ink', idea: 'Black and white only' },
  { id: 'dusk', name: 'Dusk', idea: 'Violet-blue night glass' },
  { id: 'paper', name: 'Paper', idea: 'Bone paper, black type, rust pin' },
] as const;
export type DevThemeId = (typeof DEV_THEMES)[number]['id'];

/** Looks for the public landing page at "/" (design system: LandingPaper, LandingArcade). */
export const LANDING_THEMES = [
  { id: 'paper', name: 'Paper', idea: 'Editorial and calm' },
  { id: 'arcade', name: 'Arcade', idea: 'Loud pixel type, lime on violet' },
] as const;
export type LandingThemeId = (typeof LANDING_THEMES)[number]['id'];

export type DevSettings = {
  devTheme: DevThemeId;
  landing: LandingThemeId;
  mode: 'auto' | 'light' | 'dark';
  fonts: Record<FontRole, string>;
};

export const DEFAULT_DEV_SETTINGS: DevSettings = { devTheme: 'default', landing: 'paper', mode: 'auto', fonts: { ui: 'system', heading: 'system', label: 'system' } };

const fontFor = (role: FontRole, id: unknown, fallback: string) =>
  typeof id === 'string' && fontById(id)?.roles.includes(role) ? id : fallback;

/** Checks settings sent by the browser. Unknown values fall back to the defaults. */
export function parseDevSettings(x: any): DevSettings {
  const d = DEFAULT_DEV_SETTINGS;
  if (!x || typeof x !== 'object') return d;
  const f = x.fonts ?? {};
  return {
    devTheme: DEV_THEMES.some((t) => t.id === x.devTheme) ? x.devTheme : d.devTheme,
    landing: LANDING_THEMES.some((t) => t.id === x.landing) ? x.landing : d.landing,
    mode: ['auto', 'light', 'dark'].includes(x.mode) ? x.mode : d.mode,
    // "system" is offered for headings and the interface; labels default to it too even though it is not tagged "label".
    fonts: { ui: fontFor('ui', f.ui, 'system'), heading: fontFor('heading', f.heading, 'system'), label: f.label === 'system' ? 'system' : fontFor('label', f.label, 'system') },
  };
}
