// Dev-mode settings: dev theme, color mode, landing page look (admin only), fonts and the account. Each account has its own;
// none of this changes how forms look to visitors.
import { createResource, createSignal, For, Show } from 'solid-js';
import { api, ApiError, SIGNED_OUT } from '../api';
import { DEV_THEMES, LANDING_THEMES } from '../../shared/devSettings';
import { FONT_OPTIONS } from '../../shared/fonts';
import { PAIRINGS } from '../../shared/fonts';
import { Icon } from '../ui/icons';
import { FontSelect, scrollToId, Seg } from '../ui/kit';
import { devSettings, devTheme, updateAppearance } from './appearance';
import { signOut, TopBar } from './FormsList';
import { Link } from './router';

type Me = { email: string; admin: boolean };

export default function Settings() {
  const [me] = createResource(() => api<Me>('/me'));
  const [error, setError] = createSignal('');
  const [saved, setSaved] = createSignal(false);
  const s = devSettings;
  async function set(patch: Parameters<typeof updateAppearance>[0]) {
    const err = await updateAppearance(patch);
    setError(err ?? '');
    setSaved(!err);
    setTimeout(() => setSaved(false), 1500);
  }
  const fonts = () => s().fonts;
  const [section, setSection] = createSignal<'appearance' | 'fonts' | 'account'>('appearance');
  const go = (id: 'appearance' | 'fonts' | 'account') => { setSection(id); scrollToId(id); };

  return (
    <div class="fb-app is-settings" data-dev-theme={devTheme()} style={{ "min-height": "100vh" }}>
      <TopBar ticker={[
        `Dev theme: ${DEV_THEMES.find((t) => t.id === s().devTheme)?.name}`,
        `Color mode: ${{ auto: 'Auto', light: 'Light', dark: 'Dark' }[s().mode]}`,
        `Landing page: ${LANDING_THEMES.find((t) => t.id === s().landing)?.name}`,
        `Interface font: ${FONT_OPTIONS.find((f) => f.id === s().fonts.ui)?.name ?? 'System'}`,
      ]} />
      <div class="fb-settings">
        <nav aria-label="Settings">
          <button type="button" aria-current={section() === 'appearance' ? 'page' : undefined} onClick={() => go('appearance')}><Icon name="palette" size="sm" />Appearance</button>
          <button type="button" aria-current={section() === 'fonts' ? 'page' : undefined} onClick={() => go('fonts')}><Icon name="type" size="sm" />Fonts</button>
          <button type="button" aria-current={section() === 'account' ? 'page' : undefined} onClick={() => go('account')}><Icon name="lock" size="sm" />Account</button>
          <Link href="/admin"><Icon name="arrow-left" size="sm" />Back to forms</Link>
        </nav>
        <main>
          <h1 class="fb-title">Settings</h1>
          <p class="fb-help" style={{ margin: '6px 0 20px' }}>Only you see dev mode. These choices don't change how your forms look.</p>
          <Show when={error()}><div class="fb-banner fb-banner--err" role="alert" style={{ 'margin-bottom': '16px' }}><Icon name="alert" /><span>{error()}</span></div></Show>
          <div class="fb-sr" role="status">{saved() ? 'Saved' : ''}</div>

          <section class="fb-card" id="appearance" tabIndex={-1} style={{ padding: '4px 24px' }}>
            <div class="fb-set-row">
              <div><h3>Dev mode theme</h3><p>Colors and shapes of the editor, forms list and responses. Applies at once.</p></div>
              <div class="fb-tiles" style={{ '--tile': '168px' }} role="radiogroup" aria-label="Dev mode theme">
                <For each={DEV_THEMES}>
                  {(t) => (
                    <button type="button" class="fb-tile" role="radio" aria-checked={s().devTheme === t.id} data-dev-theme={t.id}
                      style={{ background: 'var(--surface)', color: 'var(--text)' }} onClick={() => set({ devTheme: t.id })}>
                      <span class="fb-mini-ed" aria-hidden="true">
                        <span class="p"><i /><i style={{ width: '70%' }} /><i /><i style={{ width: '60%' }} /></span>
                        <span class="c"><b /><b class="sel" /><u /></span>
                        <span class="ins"><i /><i style={{ width: '50%' }} /></span>
                      </span>
                      <span class="fb-tile-name">{t.name}<span class="fb-tile-sub">{t.idea}</span></span>
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div class="fb-set-row">
              <div><h3>Color mode</h3><p>Auto follows this device.</p></div>
              <div>
                <Seg label="Color mode" value={s().mode} onChange={(mode) => set({ mode })}
                  options={[{ value: 'auto', label: 'Auto', icon: 'monitor' }, { value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }]} />
              </div>
            </div>
            <Show when={me()?.admin}>
            <div class="fb-set-row">
              <div><h3>Landing page</h3><p>The look of the public page at "/". Visitors see it; your forms keep their own themes.</p></div>
              <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'align-items': 'flex-start' }}>
                <Seg label="Landing page" value={s().landing} onChange={(landing) => set({ landing })}
                  options={LANDING_THEMES.map((t) => ({ value: t.id, label: t.name }))} />
                <span class="fb-help">{LANDING_THEMES.find((t) => t.id === s().landing)?.idea} · <a class="fb-link" href="/" target="_blank" rel="noopener">Open the landing page</a></span>
              </div>
            </div>
            </Show>
          </section>

          <h2 class="fb-h" id="fonts" tabIndex={-1} style={{ margin: '28px 0 12px' }}>Fonts</h2>
          <section class="fb-card" style={{ padding: '4px 24px' }}>
            <div class="fb-set-row">
              <div><h3>Pairing presets</h3><p>Interface, headings and labels in one click. Each suits a dev theme.</p></div>
              <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap', 'align-content': 'flex-start' }}>
                <For each={PAIRINGS}>
                  {(p) => (
                    <button type="button" class="fb-btn fb-btn--secondary fb-btn--sm" title={`${p.why} Suits the ${p.devTheme} theme.`}
                      aria-pressed={fonts().ui === p.ui && fonts().heading === p.heading && fonts().label === p.label}
                      onClick={() => set({ fonts: { ui: p.ui, heading: p.heading, label: p.label } })}>{p.name}</button>
                  )}
                </For>
              </div>
            </div>
            <div class="fb-set-row">
              <div><h3>Interface</h3><p>Body text and controls. Only fonts that read well at 14–16px.</p></div>
              <FontSelect label="Interface font" role="ui" value={fonts().ui} onChange={(ui) => set({ fonts: { ...fonts(), ui } })} />
            </div>
            <div class="fb-set-row">
              <div><h3>Headings</h3><p>Page, panel and dialog titles.</p></div>
              <FontSelect label="Heading font" role="heading" value={fonts().heading} onChange={(heading) => set({ fonts: { ...fonts(), heading } })} />
            </div>
            <div class="fb-set-row">
              <div><h3>Labels</h3><p>Badges, row headers, panel titles and status text.</p></div>
              <FontSelect label="Label font" role="label" value={fonts().label === 'system' ? '' : fonts().label} emptyLabel="System UI (same as interface)"
                onChange={(label) => set({ fonts: { ...fonts(), label: label || 'system' } })} />
            </div>
            <p class="fb-help" style={{ padding: '0 0 18px' }}>Self-hosted: a web font downloads only when chosen. "No download" options are instant.</p>
          </section>
          <h2 class="fb-h" id="account" tabIndex={-1} style={{ margin: '28px 0 12px' }}>Account</h2>
          <section class="fb-card" style={{ padding: '4px 24px' }}>
            <div class="fb-set-row">
              <div><h3>Email</h3><p>You sign in with this address.</p></div>
              <div><b>{me()?.email}</b></div>
            </div>
            <ChangePassword />
            <div class="fb-set-row">
              <div><h3>Sign out</h3><p>Ends your session on this device. Your forms keep collecting answers.</p></div>
              <div><button type="button" class="fb-btn fb-btn--danger" onClick={signOut}>Sign out</button></div>
            </div>
            <DeleteAccount />
          </section>
        </main>
      </div>
    </div>
  );
}

/** Change the password. Every other device is signed out; this one stays signed in. */
function ChangePassword() {
  const [msg, setMsg] = createSignal<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = createSignal(false);
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const f = new FormData(form);
    setBusy(true);
    try {
      await api('/account/password', 'PUT', { current: f.get('current'), next: f.get('next') });
      form.reset();
      setMsg({ ok: true, text: 'Password changed. Other devices are signed out.' });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'The password did not change.' });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form class="fb-set-row" onSubmit={submit} novalidate>
      <div><h3>Password</h3><p>At least 8 characters. Changing it signs out your other devices.</p></div>
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '10px', 'max-width': '340px' }}>
        <div class="fb-field"><label class="fb-label" for="pw-now">Current password</label>
          <input class="fb-input" id="pw-now" name="current" type="password" autocomplete="current-password" required /></div>
        <div class="fb-field"><label class="fb-label" for="pw-new">New password</label>
          <input class="fb-input" id="pw-new" name="next" type="password" autocomplete="new-password" minLength={8} required /></div>
        <div><button class="fb-btn fb-btn--secondary" classList={{ 'is-loading': busy() }} aria-busy={busy()}>Change password</button></div>
        <Show when={msg()}>{(m) => <p class={m().ok ? 'fb-help' : 'fb-err'} role="status"><Icon name={m().ok ? 'check' : 'alert'} size="sm" />{m().text}</p>}</Show>
      </div>
    </form>
  );
}

/** Delete the account, with every form, answer and uploaded file. Asks for the password first. */
function DeleteAccount() {
  const [open, setOpen] = createSignal(false);
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  async function submit(e: SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/account', 'DELETE', { password: new FormData(e.currentTarget as HTMLFormElement).get('password') });
      location.assign('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The account was not deleted.');
      if (err instanceof ApiError && err.status === 401) window.dispatchEvent(new Event(SIGNED_OUT));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div class="fb-set-row">
      <div><h3>Delete account</h3><p>Deletes your account, every form, every answer and every uploaded file. You cannot undo this.</p></div>
      <Show when={open()} fallback={<div><button type="button" class="fb-btn fb-btn--danger-ghost" onClick={() => setOpen(true)}><Icon name="trash" size="sm" />Delete my account…</button></div>}>
        <form onSubmit={submit} novalidate style={{ display: 'flex', 'flex-direction': 'column', gap: '10px', 'max-width': '340px' }}>
          <div class="fb-field"><label class="fb-label" for="del-pw">Type your password to confirm</label>
            <input class="fb-input" id="del-pw" name="password" type="password" autocomplete="current-password" required autofocus aria-invalid={error() ? true : undefined} /></div>
          <Show when={error()}><p class="fb-err" role="alert"><Icon name="alert" size="sm" />{error()}</p></Show>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button class="fb-btn fb-btn--danger" classList={{ 'is-loading': busy() }} aria-busy={busy()}>Delete everything</button>
            <button type="button" class="fb-btn fb-btn--secondary" onClick={() => { setOpen(false); setError(''); }}>Cancel</button>
          </div>
        </form>
      </Show>
    </div>
  );
}
