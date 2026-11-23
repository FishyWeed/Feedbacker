import { createEffect, createMemo, createResource, Match, onCleanup, Switch } from 'solid-js';
import { api, ApiError, SIGNED_OUT } from '../api';
import Editor from './Editor';
import FormsList from './FormsList';
import Login from './Login';
import Responses from './Responses';
import Settings from './Settings';
import { applyAppearance, devTheme, loadAppearance } from './appearance';
import { path } from './router';
import { Icon } from '../ui/icons';
import { Loading } from '../ui/kit';

export default function AdminApp() {
  const [me, { refetch }] = createResource(() =>
    api('/me').then(() => true, (e) => (e instanceof ApiError && e.status === 401 ? false : Promise.reject(e))),
  );
  applyAppearance();
  createEffect(() => { if (me() === true) loadAppearance(); });
  // Any 401 later (for example an expired session) sends the owner back to the sign-in page.
  const onSignedOut = () => refetch();
  window.addEventListener(SIGNED_OUT, onSignedOut);
  onCleanup(() => window.removeEventListener(SIGNED_OUT, onSignedOut));

  const route = createMemo(() => {
    const p = path();
    const r = p.match(/^\/admin\/forms\/([\w-]+)\/responses\/?$/);
    if (r) return { view: 'responses', id: r[1]! };
    const e = p.match(/^\/admin\/forms\/([\w-]+)\/?$/);
    if (e) return { view: 'editor', id: e[1]! };
    if (/^\/admin\/settings\/?$/.test(p)) return { view: 'settings', id: '' };
    return { view: 'list', id: '' };
  });

  return (
    <Switch fallback={<Loading />}>
      <Match when={me.error}>
        <div class="fb-wrap"><div class="fb-banner fb-banner--err" role="alert"><Icon name="alert" /><span><b>Can't reach the server.</b> Check that it is running, then reload this page.</span></div></div>
      </Match>
      <Match when={me.state === 'ready' && me() === false}>
        <div data-dev-theme={devTheme()} style={{ 'min-height': '100vh', background: 'var(--bg)' }}><Login onDone={refetch} /></div>
      </Match>
      <Match when={me.state === 'ready' && me() === true}>
        <Switch fallback={<FormsList />}>
          <Match when={route().view === 'editor' && route().id} keyed>{(id) => <Editor id={id} />}</Match>
          <Match when={route().view === 'responses' && route().id} keyed>{(id) => <Responses id={id} />}</Match>
          <Match when={route().view === 'settings'}><Settings /></Match>
        </Switch>
      </Match>
    </Switch>
  );
}
