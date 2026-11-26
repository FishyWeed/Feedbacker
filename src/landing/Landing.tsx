// Landing page at "/": Paper by default, or Arcade when the owner picks it in Settings → Appearance.
// While sign-up is open, the first button is "Create a free account"; "Self-host it" comes second. Someone who is
// signed in sees "Dashboard" instead of "Sign in", and no sign-up button.
import { createEffect, createResource, lazy, Match, Switch } from 'solid-js';
import type { LandingThemeId } from '../../shared/devSettings';
import { themeRootScrollbar } from '../ui/scrollbar';
import { introOnce } from './shared';

const LandingPaper = lazy(() => import('./LandingPaper'));
const LandingArcade = lazy(() => import('./LandingArcade'));

type Site = { landing: LandingThemeId; signup: boolean; signedIn: boolean };

async function site(): Promise<Site> {
  try {
    // /api/me only says whether the session cookie is valid (200) or not (401).
    const [r, me] = await Promise.all([fetch('/api/site'), fetch('/api/me').catch(() => null)]);
    const s = r.ok ? await r.json() : {};
    return { landing: s.landing === 'arcade' ? 'arcade' : 'paper', signup: s.signup === true, signedIn: me?.ok === true };
  } catch {
    return { landing: 'paper', signup: false, signedIn: false }; // server not reachable: show the default
  }
}

export default function Landing() {
  const [s] = createResource(site);
  const intro = introOnce();
  createEffect(() => { const t = s()?.landing; if (t) themeRootScrollbar(t); }); // page scrollbar in the landing look
  // Nothing shows until the look is known, so the wrong page never flashes.
  return (
    <Switch>
      <Match when={s()?.landing === 'arcade'}><LandingArcade intro={intro} signup={s()!.signup && !s()!.signedIn} signedIn={s()!.signedIn} /></Match>
      <Match when={s()}><LandingPaper intro={intro} signup={s()!.signup && !s()!.signedIn} signedIn={s()!.signedIn} /></Match>
    </Switch>
  );
}
