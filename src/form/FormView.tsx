// Renders a form for people to answer, with the design system's public-form markup (fb-fcard-pub, fb-q, ...).
// The public page and the editor preview both use it.
import { createMemo, createSignal, For, Index, Match, Show, Switch, untrack } from 'solid-js';
import { createStore, unwrap } from 'solid-js/store';
import { checkAnswers, visibleIds, visiblePages } from '../../shared/logic';
import { isQuestion, optionsOf, otherLabelOf, type Answer, type Answers, type Block, type ButtonAction, type FormDoc } from '../../shared/schema';
import { ApiError } from '../api';
import { Icon } from '../ui/icons';
import { LogoMark } from '../ui/kit';

// Allow web links and files uploaded to this server. Blocks `javascript:` and other schemes.
export const safeUrl = (u?: string) => (u && /^(https?:\/\/|\/uploads\/)/i.test(u.trim()) ? u.trim() : undefined);

const STAR_PATH = 'M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z';

type Props = {
  doc: FormDoc;
  onSubmit: (answers: Answers) => Promise<unknown>;
  /** Editor preview: inputs work, Submit is disabled. */
  preview?: boolean;
};

export default function FormView(props: Props) {
  const [answers, setAnswers] = createStore<Answers>({});
  const [errors, setErrors] = createSignal<Record<string, string>>({});
  const [page, setPage] = createSignal(0);
  const [status, setStatus] = createSignal<'filling' | 'sending' | 'done'>('filling');
  const [formError, setFormError] = createSignal('');
  let card!: HTMLElement;

  const visible = createMemo(() => visibleIds(props.doc, { ...answers }));
  const pages = createMemo(() => visiblePages(props.doc, visible()));
  const pageIndex = () => Math.max(0, Math.min(page(), pages().length - 1));
  const current = () => pages()[pageIndex()] ?? [];
  const isLast = () => pageIndex() >= pages().length - 1;
  const pct = () => Math.round(((pageIndex() + 1) / Math.max(1, pages().length)) * 100);
  const questionIds = (sections: FormDoc['sections']) =>
    sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks.filter(isQuestion).map((b) => b.id))));
  // If the owner put Next / Back / Submit buttons on this page, do not add the default ones.
  const hasOwnNav = () =>
    current().some((s) => s.rows.some((r) => r.columns.some((c) => c.blocks.some((b) => b.kind === 'button' && b.action !== 'link' && visible().has(b.id)))));

  const setAnswer = (id: string, v: Answer | undefined) => {
    setAnswers(id, v as Answer);
    if (errors()[id]) setErrors(({ [id]: _, ...rest }) => rest);
  };

  // All errors appear at once; focus jumps to the first one.
  const showErrors = (errs: Record<string, string>) => {
    setErrors(errs);
    const first = pages().findIndex((p) => questionIds(p).some((id) => errs[id]));
    if (first >= 0) setPage(first);
    queueMicrotask(() => card?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  };

  const toTop = () => card?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  function next() {
    const r = checkAnswers(props.doc, unwrap(answers));
    const ids = questionIds(current());
    const errs = r.ok ? {} : Object.fromEntries(Object.entries(r.errors).filter(([id]) => ids.includes(id)));
    if (Object.keys(errs).length) return showErrors(errs);
    setErrors({});
    setPage(pageIndex() + 1);
    toTop();
  }

  function back() {
    setPage(Math.max(0, pageIndex() - 1));
    toTop();
  }

  async function submit() {
    if (status() === 'sending' || props.preview) return;
    const r = checkAnswers(props.doc, unwrap(answers));
    if (!r.ok) return showErrors(r.errors);
    setStatus('sending');
    setFormError('');
    try {
      await props.onSubmit(r.answers);
      setStatus('done');
      toTop();
    } catch (e) {
      setStatus('filling');
      if (e instanceof ApiError && e.errors) showErrors(e.errors);
      setFormError(e instanceof Error ? e.message : 'Your answers were not sent. Check your connection and try again.');
    }
  }

  function again() {
    setAnswers((a) => Object.fromEntries(Object.keys(a).map((k) => [k, undefined])) as unknown as Answers);
    setErrors({});
    setPage(0);
    setStatus('filling');
  }

  const onAction = (a: ButtonAction) => (a === 'back' ? back() : a === 'submit' || isLast() ? submit() : next());
  const sending = () => status() === 'sending';

  return (
    <main ref={card} class="fb-fcard-pub">
      <Show
        when={status() !== 'done'}
        fallback={
          <div class="fb-done" style={{ display: 'flex', 'flex-direction': 'column' }} role="status">
            <LogoMark size={64} motion="saved" />
            <h1 class="fb-pub-title">{props.doc.thankYou || 'Thanks — your answers are in.'}</h1>
            <p class="fb-pub-desc">You can close this page.</p>
            <button type="button" class="fb-link" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }} onClick={again}>
              Submit another response
            </button>
          </div>
        }
      >
        <header class="fb-pub-head">
          <h1 class="fb-pub-title">{props.doc.title}</h1>
          <Show when={pageIndex() === 0 && props.doc.description}>
            <p class="fb-pub-desc">{props.doc.description}</p>
          </Show>
        </header>
        <Show when={pages().length > 1}>
          <div class="fb-prog">
            <div class="fb-prog-l"><span>Page {pageIndex() + 1} of {pages().length}</span><span>{pct()}%</span></div>
            <div class="fb-prog-t" role="progressbar" aria-valuemin="1" aria-valuemax={pages().length} aria-valuenow={pageIndex() + 1}
              aria-label={`Page ${pageIndex() + 1} of ${pages().length}`}>
              <span style={{ width: `${pct()}%` }} />
            </div>
          </div>
        </Show>
        <For each={current()}>
          {(section) => (
            <>
              <Show when={section.title}><h2 class="fb-pub-sec">{section.title}</h2></Show>
              <For each={section.rows}>
                {(row) => (
                  <div class="fb-cols" style={{ '--n': row.columns.length, gap: '16px 24px' }}>
                    <For each={row.columns}>
                      {(col) => (
                        <div class="fb-pub-col">
                          <For each={col.blocks}>
                            {(b) => (
                              <Show when={visible().has(b.id)}>
                                <BlockView block={b} value={answers[b.id]} error={errors()[b.id]} onChange={(v) => setAnswer(b.id, v)} onAction={onAction} />
                              </Show>
                            )}
                          </For>
                        </div>
                      )}
                    </For>
                  </div>
                )}
              </For>
            </>
          )}
        </For>
        <Show when={formError()}>
          <div class="fb-banner fb-banner--err" role="alert"><Icon name="alert" /><span>{formError()}</span></div>
        </Show>
        <Show when={!hasOwnNav()}>
          <nav class="fb-nav">
            <Show when={pageIndex() > 0} fallback={<span />}>
              <button type="button" class="fb-btn fb-btn--secondary" onClick={back}><Icon name="arrow-left" />Back</button>
            </Show>
            <Show
              when={isLast()}
              fallback={<button type="button" class="fb-btn fb-btn--primary" onClick={next}>Next<Icon name="arrow-right" /></button>}
            >
              <button type="button" class="fb-btn fb-btn--primary" classList={{ 'is-loading': sending() }} aria-busy={sending()}
                disabled={props.preview} title={props.preview ? 'Preview — answers are not saved' : undefined} onClick={submit}>
                <Show when={sending()} fallback="Submit"><span class="fb-spin" aria-hidden="true" />Sending…</Show>
              </button>
            </Show>
          </nav>
        </Show>
      </Show>
    </main>
  );
}

type BlockProps = {
  block: Block;
  value?: Answer;
  error?: string;
  onChange: (v: Answer | undefined) => void;
  onAction?: (a: ButtonAction) => void;
  /** Editor canvas: smaller, not interactive (bundle.css styles `.fb-bp`). */
  compact?: boolean;
};

/** One block: a question, or content such as a heading, image or button. */
export function BlockView(props: BlockProps) {
  const b = () => props.block;
  return (
    <Switch fallback={<QuestionView {...props} />}>
      <Match when={b().kind === 'heading'}><h2 class="fb-pub-h">{b().label}</h2></Match>
      <Match when={b().kind === 'paragraph'}><p class="fb-pub-p" style={{ 'white-space': 'pre-wrap' }}>{b().text}</p></Match>
      <Match when={b().kind === 'image'}>
        <figure class="fb-pub-img">
          <Show when={safeUrl(b().url)} fallback={<div class="fb-ph" role="img" aria-label={b().label || 'Image'} />}>
            <img src={safeUrl(b().url)} alt={b().label ?? ''} loading="lazy" />
          </Show>
        </figure>
      </Match>
      <Match when={b().kind === 'divider'}><hr class="fb-hr" /></Match>
      <Match when={b().kind === 'button'}>
        <div>
          <Show
            when={b().action === 'link'}
            fallback={
              <button type="button" class={`fb-btn ${b().action === 'back' ? 'fb-btn--secondary' : 'fb-btn--primary'}`}
                tabIndex={props.compact ? -1 : undefined} onClick={() => props.onAction?.(b().action ?? 'next')}>
                <Show when={b().action === 'back'}><Icon name="arrow-left" /></Show>
                {b().label || 'Button'}
                <Show when={b().action === 'next'}><Icon name="arrow-right" /></Show>
              </button>
            }
          >
            <a class="fb-btn fb-btn--primary" href={safeUrl(b().url)} target="_blank" rel="noopener noreferrer" tabIndex={props.compact ? -1 : undefined}>
              {b().label || 'Link'}<Icon name="external" />
            </a>
          </Show>
        </div>
      </Match>
    </Switch>
  );
}

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

function QuestionView(props: BlockProps) {
  const b = () => props.block;
  const fid = () => `q-${b().id}`;
  const errId = () => `${fid()}-err`;
  const described = () => [b().text && `${fid()}-help`, props.error && errId()].filter(Boolean).join(' ') || undefined;
  const invalid = () => (props.error ? true : undefined);
  const tab = () => (props.compact ? -1 : undefined);
  const str = () => (typeof props.value === 'string' ? props.value : '');
  const label = () => (
    <>
      {b().label || 'Untitled question'}
      <Show when={b().required}>
        <span class="fb-req" aria-hidden="true">*</span>
        <span class="fb-sr"> (required)</span>
      </Show>
    </>
  );
  const help = () => <Show when={b().text}><p class="fb-q-h" id={`${fid()}-help`}>{b().text}</p></Show>;
  const error = () => (
    <Show when={props.error}>
      <p class="fb-err" id={errId()}><Icon name="alert" size="sm" />{props.error}</p>
    </Show>
  );
  const input = (type: string, extra: Record<string, unknown> = {}) => (
    <input class="fb-input" id={fid()} type={type} tabIndex={tab()} aria-invalid={invalid()} aria-describedby={described()}
      required={b().required} placeholder={b().placeholder || (props.compact ? 'Your answer' : undefined)} {...extra} />
  );

  const choices = (type: 'radio' | 'checkbox', two = false) => {
    const opts = () => optionsOf(b());
    // "Other": a choice card that opens a text box. The typed text is the answer (or one of the answers).
    const typedNow = () => {
      const v = props.value;
      if (typeof v === 'string' && !opts().includes(v)) return v;
      return Array.isArray(v) ? v.find((x) => !opts().includes(x)) ?? '' : '';
    };
    const [otherOn, setOtherOn] = createSignal(untrack(typedNow) !== '');
    const [draft, setDraft] = createSignal(untrack(typedNow));
    let otherInput: HTMLInputElement | undefined;
    const picked = () => (Array.isArray(props.value) ? props.value.filter((x) => opts().includes(x)) : []);
    const emitMulti = (known: string[]) => {
      const next = [...opts().filter((x) => known.includes(x)), ...(otherOn() && draft().trim() ? [draft()] : [])];
      props.onChange(next.length ? next : undefined);
    };
    const choose = (o: string, on: boolean) => {
      if (type === 'radio') {
        setOtherOn(false);
        return props.onChange(o);
      }
      const set = new Set(picked());
      on ? set.add(o) : set.delete(o);
      emitMulti([...set]);
    };
    const chooseOther = (on: boolean) => {
      setOtherOn(type === 'radio' ? true : on);
      if (type === 'radio') props.onChange(draft().trim() ? draft() : undefined);
      else emitMulti(picked());
      if (on) queueMicrotask(() => otherInput?.focus());
    };
    const typeOther = (v: string) => {
      setDraft(v);
      if (type === 'radio') props.onChange(v.trim() ? v : undefined);
      else emitMulti(picked());
    };
    return (
      <div class="fb-choices" classList={{ 'fb-choices--2': two }}>
        <Index each={opts()}>
          {(o) => {
            const checked = () => (Array.isArray(props.value) ? props.value.includes(o()) : !otherOn() && props.value === o());
            return (
              <label class="fb-choice">
                <input type={type} name={fid()} checked={checked()} tabIndex={tab()} aria-invalid={invalid()} onChange={(e) => choose(o(), e.currentTarget.checked)} />
                {o()}
              </label>
            );
          }}
        </Index>
        <Show when={b().other}>
          <label class="fb-choice">
            <input type={type} name={fid()} checked={otherOn()} tabIndex={tab()} aria-invalid={invalid()} onChange={(e) => chooseOther(e.currentTarget.checked)} />
            {otherLabelOf(b())}
          </label>
          <Show when={otherOn() || props.compact}>
            <input ref={otherInput} class="fb-input" maxLength={500} tabIndex={tab()} placeholder="Type your answer" value={draft()}
              aria-label={`${otherLabelOf(b())}: your answer`} aria-invalid={invalid()} onInput={(e) => typeOther(e.currentTarget.value)} />
          </Show>
        </Show>
      </div>
    );
  };

  const stars = () => {
    const max = () => b().max ?? 5;
    const val = () => (typeof props.value === 'number' ? props.value : 0);
    return (
      <div class="fb-stars" classList={{ 'fb-stars--err': !!props.error }} role="radiogroup" aria-label={b().label || 'Rating'} aria-describedby={described()}>
        <For each={range(1, max())}>
          {(n) => (
            <button type="button" class="fb-star" classList={{ 'is-on': n <= val() }} role="radio" aria-checked={val() === n}
              aria-label={`${n} of ${max()}`} aria-invalid={n === 1 ? invalid() : undefined} tabIndex={tab()} onClick={() => props.onChange(n)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={STAR_PATH} /></svg>
            </button>
          )}
        </For>
        <Show when={val()}><span class="fb-stars-val">{val()} of {max()}</span></Show>
      </div>
    );
  };

  const scale = () => {
    const nums = () => range(b().min ?? 1, b().max ?? 10);
    return (
      <div class="fb-scale-wrap">
        <div class="fb-scale-box" style={{ '--n': nums().length, '--half': Math.ceil(nums().length / 2) }}>
          <div class="fb-scale" classList={{ 'fb-scale--err': !!props.error }} role="radiogroup" aria-label={b().label || 'Scale'} aria-describedby={described()}>
            <For each={nums()}>
              {(n, i) => (
                <button type="button" class="fb-pill" role="radio" aria-checked={props.value === n} tabIndex={tab()}
                  aria-invalid={i() === 0 ? invalid() : undefined} onClick={() => props.onChange(n)}>{n}</button>
              )}
            </For>
          </div>
        </div>
      </div>
    );
  };

  const control = () => {
    switch (b().kind) {
      case 'long_text':
        return <textarea class="fb-textarea" id={fid()} rows={4} maxLength={10000} tabIndex={tab()} aria-invalid={invalid()} aria-describedby={described()}
          placeholder={b().placeholder || (props.compact ? 'Your answer' : undefined)} value={str()} onInput={(e) => props.onChange(e.currentTarget.value)} />;
      case 'number':
        return input('number', {
          inputmode: 'decimal', value: typeof props.value === 'number' ? props.value : '',
          onInput: (e: InputEvent & { currentTarget: HTMLInputElement }) => props.onChange(Number.isNaN(e.currentTarget.valueAsNumber) ? undefined : e.currentTarget.valueAsNumber),
        });
      case 'date':
        return input('date', { value: str(), onInput: (e: InputEvent & { currentTarget: HTMLInputElement }) => props.onChange(e.currentTarget.value || undefined) });
      case 'dropdown':
        return (
          <div class="fb-select">
            <select id={fid()} tabIndex={tab()} aria-invalid={invalid()} aria-describedby={described()} value={str()} onChange={(e) => props.onChange(e.currentTarget.value || undefined)}>
              <option value="">Choose…</option>
              <Index each={b().options ?? []}>{(o) => <option value={o()}>{o()}</option>}</Index>
            </select>
            <Icon name="chev-down" />
          </div>
        );
      case 'single_choice': return choices('radio');
      case 'yes_no': return choices('radio', true);
      case 'multi_choice': return choices('checkbox');
      case 'rating': return stars();
      case 'scale': return scale();
      default: // short_text, email
        return input(b().kind === 'email' ? 'email' : 'text', {
          autocomplete: b().kind === 'email' ? 'email' : undefined, maxLength: b().kind === 'email' ? 320 : 500,
          value: str(), onInput: (e: InputEvent & { currentTarget: HTMLInputElement }) => props.onChange(e.currentTarget.value),
        });
    }
  };

  const grouped = () => ['single_choice', 'multi_choice', 'yes_no', 'rating', 'scale'].includes(b().kind);
  return (
    <Show
      when={grouped()}
      fallback={
        <div class="fb-q" classList={{ 'is-error': !!props.error }}>
          <label class={props.compact ? 'fb-label' : 'fb-q-l'} for={fid()}>{label()}</label>
          {help()}
          {control()}
          {error()}
        </div>
      }
    >
      <fieldset class="fb-q" classList={{ 'is-error': !!props.error }} aria-describedby={described()}>
        <legend class={props.compact ? 'fb-label' : 'fb-q-l'}>{label()}</legend>
        {help()}
        {control()}
        {error()}
      </fieldset>
    </Show>
  );
}
