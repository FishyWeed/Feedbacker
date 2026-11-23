import { createSignal, Show } from 'solid-js';
import { api } from '../api';
import { Icon } from '../ui/icons';
import { Brand } from '../ui/kit';

export default function Login(props: { onDone: () => void }) {
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    setBusy(true);
    setError('');
    try {
      await api('/login', 'POST', { username: f.get('username'), password: f.get('password') });
      props.onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main class="fb-signin">
      <form class="fb-card" onSubmit={submit} novalidate>
        <Brand />
        <div>
          <h1 class="fb-title" style={{ 'font-size': '24px', 'line-height': '30px' }}>Sign in to dev mode</h1>
          <p class="fb-lock" style={{ margin: '6px 0 0' }}><Icon name="lock" size="sm" />Only the owner can open dev mode.</p>
        </div>
        <div class="fb-field">
          <label class="fb-label" for="s1">Username</label>
          <input class="fb-input" id="s1" name="username" autocomplete="username" required autofocus aria-invalid={error() ? true : undefined} aria-describedby={error() ? 's-err' : undefined} />
        </div>
        <div class="fb-field">
          <label class="fb-label" for="s2">Password</label>
          <input class="fb-input" id="s2" name="password" type="password" autocomplete="current-password" required aria-invalid={error() ? true : undefined} aria-describedby={error() ? 's-err' : undefined} />
        </div>
        <Show when={error()}>
          <p class="fb-err" id="s-err" role="alert"><Icon name="alert" size="sm" />{error()}</p>
        </Show>
        <button class="fb-btn fb-btn--primary fb-btn--lg fb-btn--block" classList={{ 'is-loading': busy() }} aria-busy={busy()}>
          <Show when={busy()} fallback="Sign in"><span class="fb-spin" aria-hidden="true" />Signing in…</Show>
        </button>
      </form>
    </main>
  );
}
