// Sign-in page: sign in with an email, or create an account (/admin/signup opens that tab). When the server closes
// sign-up (SIGNUP=closed), only sign-in shows.
import { createResource, createSignal, Show } from 'solid-js';
import { api, ApiError } from '../api';
import { Icon } from '../ui/icons';
import { Brand, Seg } from '../ui/kit';

export default function Login(props: { onDone: () => void }) {
  const [site] = createResource(() => api<{ signup: boolean }>('/site').catch(() => ({ signup: false })));
  const [tab, setTab] = createSignal<'in' | 'up'>(/^\/admin\/signup\/?$/.test(location.pathname) ? 'up' : 'in');
  const signUp = () => !!site()?.signup && tab() === 'up';
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
      await api(signUp() ? '/signup' : '/login', 'POST', { email: f.get('email'), password: f.get('password') });
      if (location.pathname !== '/admin') history.replaceState(null, '', '/admin');
      props.onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
      if (err instanceof ApiError && err.errors) setFieldErrors(err.errors);
    } finally {
      setBusy(false);
    }
  }
  const hasFieldErrors = () => Object.keys(fieldErrors()).length > 0;
  const invalid = (name: string) => (fieldErrors()[name] || (error() && !hasFieldErrors()) ? true : undefined);

  return (
    <main class="fb-signin">
      <Show when={site()}>
        <form class="fb-card" onSubmit={submit} novalidate>
          <Brand />
          <div>
            <h1 class="fb-title" style={{ 'font-size': '24px', 'line-height': '30px' }}>{signUp() ? 'Create your account' : 'Sign in'}</h1>
            <p class="fb-lock" style={{ margin: '6px 0 0' }}><Icon name="lock" size="sm" />Your forms and answers are private to your account.</p>
          </div>
          <Show when={site()!.signup}>
            <Seg label="Account" value={tab()} onChange={(t) => { setTab(t); setError(''); setFieldErrors({}); }}
              options={[{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Create account' }]} />
          </Show>
          <div class="fb-field">
            <label class="fb-label" for="s1">Email</label>
            <input class="fb-input" id="s1" name="email" type="email" autocomplete="email" required autofocus aria-invalid={invalid('email')} aria-describedby={error() ? 's-err' : undefined} />
            <Show when={fieldErrors().email}><span class="fb-err"><Icon name="alert" size="sm" />{fieldErrors().email}</span></Show>
          </div>
          <div class="fb-field">
            <label class="fb-label" for="s2">Password</label>
            <input class="fb-input" id="s2" name="password" type="password" autocomplete={signUp() ? 'new-password' : 'current-password'} required minLength={signUp() ? 8 : undefined}
              aria-invalid={invalid('password')} aria-describedby={signUp() ? 's-hint' : error() ? 's-err' : undefined} />
            <Show when={signUp()}><span class="fb-help" id="s-hint">At least 8 characters. There is no password reset by email, so keep it somewhere safe.</span></Show>
            <Show when={fieldErrors().password}><span class="fb-err"><Icon name="alert" size="sm" />{fieldErrors().password}</span></Show>
          </div>
          <Show when={error() && !hasFieldErrors()}>
            <p class="fb-err" id="s-err" role="alert"><Icon name="alert" size="sm" />{error()}</p>
          </Show>
          <Show when={hasFieldErrors()}><p class="fb-sr" role="alert">{error()}</p></Show>
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
