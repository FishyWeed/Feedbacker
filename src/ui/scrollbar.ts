// Scrollbars follow the theme (app.css): each scroll area reads --border-strong from its themed wrapper.
// The page scrollbar belongs to <html>, which sits outside those wrappers, so this copies the theme's
// thumb color onto <html> as --root-sb-thumb. It runs again when the light/dark mode changes.

let current: string | null = null;

export function themeRootScrollbar(devTheme: string | null) {
  current = devTheme;
  const root = document.documentElement;
  if (!devTheme) return root.style.removeProperty('--root-sb-thumb');
  const probe = document.createElement('div');
  probe.dataset.devTheme = devTheme;
  probe.hidden = true;
  document.body.append(probe);
  root.style.setProperty('--root-sb-thumb', getComputedStyle(probe).getPropertyValue('--border-strong').trim());
  probe.remove();
}

// The mode is written to <html data-theme>; recompute after it changes (by index.html or appearance.ts).
new MutationObserver(() => { if (current) themeRootScrollbar(current); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
