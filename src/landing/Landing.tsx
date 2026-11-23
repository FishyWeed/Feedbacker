// Landing page at "/": Paper by default, or Arcade when the owner picks it in Settings → Appearance.
import { createEffect, createResource, lazy, Match, Switch } from 'solid-js';
import type { LandingThemeId } from '../../shared/devSettings';
import { themeRootScrollbar } from '../ui/scrollbar';
import { introOnce } from './shared';

const LandingPaper = lazy(() => import('./LandingPaper'));
const LandingArcade = lazy(() => import('./LandingArcade'));

async function landingTheme(): Promise<LandingThemeId> {
  try {
    const r = await fetch('/api/landing');
    return r.ok ? ((await r.json()).theme as LandingThemeId) : 'paper';
  } catch {
    return 'paper'; // server not reachable: show the default
  }
}

export default function Landing() {
  const [theme] = createResource(landingTheme);
  const intro = introOnce();
  createEffect(() => { const t = theme(); if (t) themeRootScrollbar(t); }); // page scrollbar in the landing look
  // Nothing shows until the theme is known, so the wrong page never flashes.
  return (
    <Switch>
      <Match when={theme() === 'arcade'}><LandingArcade intro={intro} /></Match>
      <Match when={theme()}><LandingPaper intro={intro} /></Match>
    </Switch>
  );
}
