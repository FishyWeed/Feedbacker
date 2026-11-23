// Dev-mode appearance: the owner's dev theme, color mode and fonts. Saved on the server,
// cached in localStorage so the first paint already has them (see index.html).
import { createRoot, createSignal } from 'solid-js';
import { DEFAULT_DEV_SETTINGS, parseDevSettings, type DevSettings } from '../../shared/devSettings';
import { stackOf } from '../../shared/fonts';
import { api } from '../api';
import { themeRootScrollbar } from '../ui/scrollbar';

const KEY = 'fb-dev-settings';
const read = (): DevSettings => {
  try { return parseDevSettings(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return DEFAULT_DEV_SETTINGS; }
};

const dark = matchMedia('(prefers-color-scheme: dark)');

const store = createRoot(() => {
  const [settings, setSettings] = createSignal<DevSettings>(read());
  return { settings, setSettings };
});

export const devSettings = store.settings;
/** The dev theme id. Owner pages put it on their own wrapper (data-dev-theme), never around the form preview. */
export const devTheme = () => store.settings().devTheme;
/** The status ticker runs under the top bar only in the Arcade and Paper dev themes (design system: Ticker). */
export const showTicker = () => devTheme() === 'arcade' || devTheme() === 'paper';

/** Writes color mode, fonts and the page scrollbar color to <html>. */
export function applyAppearance(s = store.settings()) {
  const root = document.documentElement;
  root.dataset.theme = s.mode === 'auto' ? (dark.matches ? 'dark' : 'light') : s.mode;
  root.style.setProperty('--font', stackOf(s.fonts.ui));
  root.style.setProperty('--font-heading', stackOf(s.fonts.heading));
  root.style.setProperty('--label-font', stackOf(s.fonts.label));
  themeRootScrollbar(s.devTheme);
}
dark.addEventListener('change', () => applyAppearance());

function remember(s: DevSettings) {
  store.setSettings(s);
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: settings still apply for this visit */ }
  applyAppearance(s);
}

/** Loads the saved settings after sign-in (the cache may be from another device). */
export async function loadAppearance() {
  remember(parseDevSettings(await api<DevSettings>('/settings').catch(() => store.settings())));
}

/** Applies at once, then saves. A failed save keeps the change for this visit and returns the error. */
export async function updateAppearance(patch: Partial<DevSettings>): Promise<string | null> {
  const next = parseDevSettings({ ...store.settings(), ...patch, fonts: { ...store.settings().fonts, ...patch.fonts } });
  remember(next);
  try {
    remember(await api<DevSettings>('/settings', 'PUT', next));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not save the setting.';
  }
}
