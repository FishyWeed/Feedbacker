// Sign-in page. Single mode (self-hosted): the owner's username and password from .env.
// Hosted mode: sign in with an email, or create an account (/admin/signup opens that tab).
import { createResource, createSignal, Show } from 'solid-js';
import { api, ApiError } from '../api';
import { Icon } from '../ui/icons';
import { Brand, Seg } from '../ui/kit';

export default function Login(props: { onDone: () => void }) {
  const [site] = createResource(() => api<{ mode: 'single' | 'hosted' }>('/site').catch(() => ({ mode: 'single' as const })));
  const hosted = () => site()?.mode === 'hosted';
  const [tab, setTab] = createSignal<'in' | 'up'>(/^\/admin\/signup\/?$/.test(location.pathname) ? 'up' : 'in');
  const signUp = () => hosted() && tab() === 'up';
  const [error, setError] = createSignal('');
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string>>({});
  const [busy, setBusy] = createSignal(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      if (signUp()) await api('/signup', 'POST', { email: f.get('email'), password: f.get('password') });
      else if (hosted()) await api('/login', 'POST', { email: f.get('email'), password: f.get('password') });
      else await api('/login', 'POST', { username: f.get('username'), password: f.get('password') });
      if (location.pathname !== '/admin') history.replaceState(null, '', '/admin');
      props.onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
    } finally {
      setBusy(false);
    }
  }
  const invalid = (name: string) => (fieldErrors()[name] || (error() && !Object.keys(fieldErrors()).length) ? true : undefined);

  return (
    <main class="fb-signin">
      <Show when={site()}>
        <form class="fb-card" onSubmit={submit} novalidate>
          <Brand />
          <div>
            <h1 class="fb-title" style={{ 'font-size': '24px', 'line-height': '30px' }}>
              {signUp() ? 'Create your account' : hosted() ? 'Sign in' : 'Sign in to dev mode'}
            </h1>
            <p class="fb-lock" style={{ margin: '6px 0 0' }}><Icon name="lock" size="sm" />
              {hosted() ? 'Your forms and answers are private to your account.' : 'Only the owner can open dev mode.'}
            </p>
          </div>
          <Show when={hosted()}>
            <Seg label="Account" value={tab()} onChange={(t) => { setTab(t); setError(''); setFieldErrors({}); }}
              options={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Create account' }]} />
          </Show>
          <Show when={hosted()} fallback={
            <div class="fb-field">
              <label class="fb-label" for="s1">Username</label>
              <input class="fb-input" id="s1" name="username" autocomplete="username" required autofocus aria-invalid={invalid('username')} aria-describedby={error() ? 's-err' : undefined} />
            </div>
          }>
            <div class="fb-field">
              <label class="fb-label" for="s1">Email</label>
              <input class="fb-input" id="s1" name="email" type="email" autocomplete="email" required autofocus aria-invalid={invalid('email')} aria-describedby={error() ? 's-err' : undefined} />
              <Show when={fieldErrors().email}><span class="fb-err"><Icon name="alert" size="sm" />{fieldErrors().email}</span></Show>
            </div>
          </Show>
          <div class="fb-field">
            <label class="fb-label" for="s2">Password</label>
            <input class="fb-input" id="s2" name="password" type="password" autocomplete={signUp() ? 'new-password' : 'current-password'} required minLength={signUp() ? 8 : undefined}
              aria-invalid={invalid('password')} aria-describedby={signUp() ? 's-hint' : error() ? 's-err' : undefined} />
            <Show when={signUp()}><span class="fb-help" id="s-hint">At least 8 characters. There is no password reset by email, so keep it somewhere safe.</span></Show>
            <Show when={fieldErrors().password}><span class="fb-err"><Icon name="alert" size="sm" />{fieldErrors().password}</span></Show>
          </div>
          <Show when={error() && !Object.keys(fieldErrors()).length}>
            <p class="fb-err" id="s-err" role="alert"><Icon name="alert" size="sm" />{error()}</p>
          </Show>
          <Show when={Object.keys(fieldErrors()).length}><p class="fb-sr" role="alert">{error()}</p></Show>
          <button class="fb-btn fb-btn--primary fb-btn--lg fb-btn--block" classList={{ 'is-loading': busy() }} aria-busy={busy()}>
            <Show when={busy()} fallback={signUp() ? 'Create account' : 'Sign in'}>
              <span class="fb-spin" aria-hidden="true" />{signUp() ? 'Creating your account…' : 'Signing in…'}
            </Show>
          </button>
        </form>
      </Show>
    </main>
  );
}
