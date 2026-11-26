// Landing page at "/": Paper by default, or Arcade when the owner picks it in Settings → Appearance.
// On a hosted site (MODE=hosted) the first button is "Create a free account"; "Self-host it" comes second.
import { createEffect, createResource, lazy, Match, Switch } from 'solid-js';
import type { LandingThemeId } from '../../shared/devSettings';
import { themeRootScrollbar } from '../ui/scrollbar';
import { introOnce } from './shared';

const LandingPaper = lazy(() => import('./LandingPaper'));
const LandingArcade = lazy(() => import('./LandingArcade'));

type Site = { landing: LandingThemeId; hosted: boolean };

async function site(): Promise<Site> {
  try {
    const r = await fetch('/api/site');
    const s = r.ok ? await r.json() : {};
    return { landing: s.landing === 'arcade' ? 'arcade' : 'paper', hosted: s.mode === 'hosted' };
  } catch {
    return { landing: 'paper', hosted: false }; // server not reachable: show the default
  }
}

export default function Landing() {
  const [s] = createResource(site);
  const intro = introOnce();
  createEffect(() => { const t = s()?.landing; if (t) themeRootScrollbar(t); }); // page scrollbar in the landing look
  // Nothing shows until the look is known, so the wrong page never flashes.
  return (
    <Switch>
      <Match when={s()?.landing === 'arcade'}><LandingArcade intro={intro} hosted={s()!.hosted} /></Match>
      <Match when={s()}><LandingPaper intro={intro} hosted={s()!.hosted} /></Match>
    </Switch>
  );
}
