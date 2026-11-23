// The right panel (Inspector): settings for the selected block, section or the whole form.
import { createMemo, createUniqueId, For, Index, Match, Show, Switch, type JSX } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { questionsBefore } from '../../shared/logic';
import { isQuestion, KIND_LABELS, optionsOf, type Block, type Condition, type Op, type Rule, type Section } from '../../shared/schema';
import { Icon } from '../ui/icons';
import DesignSettings from './DesignSettings';
import { locate, useEditor } from './editorStore';
import MediaPicker from './MediaPicker';

/** Label + control + optional hint, with the label tied to the control. */
function Field(props: { label: string; hint?: string; children: (id: string) => JSX.Element }) {
  const id = createUniqueId();
  return (
    <div class="fb-field">
      <label class="fb-label" for={id}>{props.label}</label>
      {props.children(id)}
      <Show when={props.hint}><p class="fb-help">{props.hint}</p></Show>
    </div>
  );
}

const Toggle = (props: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
  <label class="fb-switch">
    {props.label}
    <input class="fb-toggle" type="checkbox" role="switch" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.currentTarget.checked)} />
  </label>
);

export default function Inspector() {
  const ed = useEditor();
  const loc = createMemo(() => {
    const id = ed.selected();
    return id ? locate(ed.doc, id) : null;
  });
  return (
    <aside class="fb-insp" aria-label="Settings">
      <Switch fallback={<FormSettings />}>
        <Match when={loc()?.block}>{(b) => <BlockSettings block={b()} />}</Match>
        <Match when={loc() && !loc()!.row && loc()!.section}>
          {(s) => <SectionSettings section={s()} index={ed.doc.sections.findIndex((x) => x.id === s().id)} />}
        </Match>
      </Switch>
    </aside>
  );
}

function FormSettings() {
  const ed = useEditor();
  return (
    <>
      <div class="fb-insp-s">
        <div class="fb-insp-t">Form</div>
        <Field label="Title">{(id) => <input class="fb-input" id={id} value={ed.doc.title} maxLength={200} onInput={(e) => ed.actions.updateForm({ title: e.currentTarget.value })} />}</Field>
        <Field label="Description" hint="Shown at the top of the first page.">
          {(id) => <textarea class="fb-textarea" id={id} rows={3} value={ed.doc.description ?? ''} onInput={(e) => ed.actions.updateForm({ description: e.currentTarget.value })} />}
        </Field>
        <Field label="Thank-you message" hint="Shown after someone submits the form.">
          {(id) => <textarea class="fb-textarea" id={id} rows={2} value={ed.doc.thankYou ?? ''} onInput={(e) => ed.actions.updateForm({ thankYou: e.currentTarget.value })} />}
        </Field>
        <p class="fb-help">Select a section or a block on the canvas to edit it.</p>
      </div>
      <DesignSettings />
    </>
  );
}

function SectionSettings(props: { section: Section; index: number }) {
  const ed = useEditor();
  const up = (patch: Partial<Section>) => ed.actions.updateSection(props.section.id, patch);
  return (
    <>
      <div class="fb-insp-s">
        <div class="fb-insp-t">Section {props.index + 1}</div>
        <Field label="Title (optional)">{(id) => <input class="fb-input" id={id} value={props.section.title ?? ''} maxLength={500} onInput={(e) => up({ title: e.currentTarget.value })} />}</Field>
        <Toggle label="Start a new page" checked={props.index === 0 || props.section.newPage} disabled={props.index === 0} onChange={(v) => up({ newPage: v })} />
        <p class="fb-help">{props.index === 0 ? 'The first section always starts page 1.' : 'Off: this section shows on the same page as the section above.'}</p>
      </div>
      <RuleEditor targetId={props.section.id} rule={props.section.showIf} onChange={(showIf) => up({ showIf })} subject="section" />
      <div class="fb-insp-s">
        <button class="fb-btn fb-btn--danger-ghost" onClick={() => confirm('Delete this section and all its blocks?') && ed.actions.removeSection(props.section.id)}>
          <Icon name="trash" />Delete section
        </button>
      </div>
    </>
  );
}

function BlockSettings(props: { block: Block }) {
  const ed = useEditor();
  const b = () => props.block;
  const up = (patch: Partial<Block>) => ed.actions.updateBlock(b().id, patch);
  const k = () => b().kind;
  const labelName = () => (isQuestion(b()) ? 'Question' : k() === 'image' ? 'Alt text' : k() === 'button' ? 'Button text' : 'Text');
  const hasChoices = () => ['single_choice', 'multi_choice', 'dropdown'].includes(k());
  const canOther = () => k() === 'single_choice' || k() === 'multi_choice';
  const options = () => b().options ?? [];
  return (
    <>
      <div class="fb-insp-s">
        <div class="fb-insp-t">
          {KIND_LABELS[k()]}
          <Show when={b().required}><span class="fb-badge fb-badge--req">Required</span></Show>
        </div>
        <Show when={k() !== 'divider' && k() !== 'paragraph'}>
          <Field label={labelName()} hint={k() === 'image' ? 'Read aloud by screen readers.' : undefined}>
            {(id) => <input class="fb-input" id={id} value={b().label ?? ''} maxLength={500} onInput={(e) => up({ label: e.currentTarget.value })} />}
          </Field>
        </Show>
        <Show when={isQuestion(b()) || k() === 'paragraph'}>
          <Field label={k() === 'paragraph' ? 'Text' : 'Hint'}>
            {(id) => (
              <textarea class="fb-textarea" id={id} rows={k() === 'paragraph' ? 5 : 2} placeholder={k() === 'paragraph' ? undefined : 'Optional help under the question'}
                value={b().text ?? ''} onInput={(e) => up({ text: e.currentTarget.value })} />
            )}
          </Field>
        </Show>
        <Show when={['short_text', 'long_text', 'email', 'number'].includes(k())}>
          <Field label="Placeholder (optional)">{(id) => <input class="fb-input" id={id} value={b().placeholder ?? ''} maxLength={200} onInput={(e) => up({ placeholder: e.currentTarget.value })} />}</Field>
        </Show>
        <Show when={isQuestion(b())}>
          <Toggle label="Required" checked={!!b().required} onChange={(v) => up({ required: v || undefined })} />
        </Show>
      </div>

      <Show when={hasChoices()}>
        <div class="fb-insp-s">
          <div class="fb-insp-t">Options</div>
          <Index each={options()}>
            {(o, i) => (
              <div class="fb-opt">
                <input class="fb-input" value={o()} maxLength={200} aria-label={`Option ${i + 1}`}
                  onInput={(e) => up({ options: options().map((x, j) => (j === i ? e.currentTarget.value : x)) })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && i === options().length - 1) { e.preventDefault(); up({ options: [...options(), `Option ${options().length + 1}`] }); } }} />
                <button class="fb-btn fb-btn--ghost fb-btn--sm fb-btn--icon" aria-label={`Remove option ${o()}`} disabled={options().length <= 1}
                  onClick={() => up({ options: options().filter((_, j) => j !== i) })}><Icon name="x" size="sm" /></button>
              </div>
            )}
          </Index>
          <div>
            <button class="fb-add" disabled={options().length >= 100} onClick={() => up({ options: [...options(), `Option ${options().length + 1}`] })}>
              <Icon name="plus" size="sm" /> Add option
            </button>
          </div>
          <Show when={canOther()}>
            <Toggle label={'Add an "Other" option'} checked={!!b().other} onChange={(v) => up({ other: v || undefined })} />
            <Show when={b().other}>
              <Field label="Other option label" hint="People who pick it type their own answer.">
                {(id) => <input class="fb-input" id={id} value={b().otherLabel ?? 'Other'} maxLength={100} onInput={(e) => up({ otherLabel: e.currentTarget.value })} />}
              </Field>
            </Show>
          </Show>
          <p class="fb-help">Rules use the option text. If you rename an option, check the rules that use it.</p>
        </div>
      </Show>

      <Show when={k() === 'rating'}>
        <div class="fb-insp-s">
          <Field label="Number of stars">
            {(id) => (
              <div class="fb-select">
                <select id={id} value={b().max ?? 5} onChange={(e) => up({ max: Number(e.currentTarget.value) })}>
                  <For each={[3, 4, 5, 6, 7, 8, 9, 10]}>{(n) => <option value={n}>{n}</option>}</For>
                </select>
                <Icon name="chev-down" />
              </div>
            )}
          </Field>
        </div>
      </Show>
      <Show when={k() === 'scale'}>
        <div class="fb-insp-s">
          <div class="fb-input-row">
            <Field label="From">
              {(id) => (
                <div class="fb-select">
                  <select id={id} value={b().min ?? 1} onChange={(e) => up({ min: Number(e.currentTarget.value) })}><option value={0}>0</option><option value={1}>1</option></select>
                  <Icon name="chev-down" />
                </div>
              )}
            </Field>
            <Field label="To">
              {(id) => (
                <div class="fb-select">
                  <select id={id} value={b().max ?? 10} onChange={(e) => up({ max: Number(e.currentTarget.value) })}>
                    <For each={[2, 3, 4, 5, 6, 7, 8, 9, 10]}>{(n) => <option value={n}>{n}</option>}</For>
                  </select>
                  <Icon name="chev-down" />
                </div>
              )}
            </Field>
          </div>
        </div>
      </Show>
      <Show when={k() === 'image'}>
        <div class="fb-insp-s">
          <div class="fb-insp-t">Image</div>
          <MediaPicker url={b().url} accept="image/png,image/jpeg,image/gif,image/webp" what="an image" limits="PNG, JPG, GIF or WebP · up to 5 MB" onChange={(url) => up({ url })} />
        </div>
      </Show>
      <Show when={k() === 'button'}>
        <div class="fb-insp-s">
          <Field label="When clicked">
            {(id) => (
              <div class="fb-select">
                <select id={id} value={b().action ?? 'next'} onChange={(e) => up({ action: e.currentTarget.value as Block['action'] })}>
                  <option value="next">Go to the next page (or submit on the last page)</option>
                  <option value="back">Go to the previous page</option>
                  <option value="submit">Submit the form</option>
                  <option value="link">Open a link</option>
                </select>
                <Icon name="chev-down" />
              </div>
            )}
          </Field>
          <Show when={b().action === 'link'}>
            <Field label="Link" hint="Starts with https:// or http://">{(id) => <input class="fb-input" id={id} type="url" value={b().url ?? ''} maxLength={2000} onInput={(e) => up({ url: e.currentTarget.value })} />}</Field>
          </Show>
          <p class="fb-help">If a page has a Next, Back or Submit button block, the default page buttons are hidden on that page.</p>
        </div>
      </Show>

      <RuleEditor targetId={b().id} rule={b().showIf} onChange={(showIf) => up({ showIf })} subject="question" />
      <div class="fb-insp-s">
        <button class="fb-btn fb-btn--danger-ghost" onClick={() => ed.actions.removeBlock(b().id)}><Icon name="trash" />Delete block</button>
      </div>
    </>
  );
}

// --- Conditional logic ---

const OP_LABELS: Record<Op, string> = {
  equals: 'is', not_equals: 'is not', contains: 'contains', answered: 'is not empty',
  not_answered: 'is empty', gt: 'is more than', lt: 'is less than',
};

function opsFor(q: Block | undefined): Op[] {
  switch (q?.kind) {
    case 'multi_choice': return ['contains', 'not_equals', 'answered', 'not_answered'];
    case 'single_choice': case 'dropdown': case 'yes_no': case 'date': return ['equals', 'not_equals', 'answered', 'not_answered'];
    case 'number': case 'rating': case 'scale': return ['equals', 'not_equals', 'gt', 'lt', 'answered', 'not_answered'];
    default: return ['equals', 'not_equals', 'contains', 'answered', 'not_answered'];
  }
}
const isNumeric = (q?: Block) => q?.kind === 'number' || q?.kind === 'rating' || q?.kind === 'scale';
const choicesOf = (q?: Block) => (['single_choice', 'multi_choice', 'dropdown', 'yes_no'].includes(q?.kind ?? '') ? optionsOf(q!) : null);
const defaultValue = (q?: Block) => (choicesOf(q) ? choicesOf(q)![0] ?? '' : isNumeric(q) ? (q!.kind === 'scale' ? q!.min ?? 1 : 1) : '');
const conditionFor = (q: Block): Condition => ({ q: q.id, op: opsFor(q)[0]!, value: defaultValue(q) });

function Sel(props: { label: string; value: string; onChange: (v: string) => void; children: JSX.Element }) {
  return (
    <div class="fb-select">
      <select aria-label={props.label} value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)}>{props.children}</select>
      <Icon name="chev-down" />
    </div>
  );
}

function RuleEditor(props: { targetId: string; rule?: Rule; onChange: (r: Rule | undefined) => void; subject: 'question' | 'section' }) {
  const ed = useEditor();
  const questions = createMemo(() => questionsBefore(ed.doc, props.targetId));
  const byId = (id: string) => questions().find((q) => q.id === id);
  const plain = () => structuredClone(unwrap(props.rule)) as Rule;
  const setCondition = (i: number, c: Condition) => {
    const r = plain();
    r.conditions[i] = c;
    props.onChange(r);
  };
  const removeCondition = (i: number) => {
    const r = plain();
    r.conditions.splice(i, 1);
    props.onChange(r.conditions.length ? r : undefined);
  };
  return (
    <div class="fb-insp-s">
      <div class="fb-insp-t">
        Show this {props.subject}
        <Show when={props.rule}><span class="fb-badge fb-badge--cond"><Icon name="branch" />Conditional</span></Show>
      </div>
      <Show
        when={props.rule}
        fallback={
          <>
            <p class="fb-help">Always shown.</p>
            <div>
              <button class="fb-add" disabled={!questions().length} onClick={() => props.onChange({ match: 'all', conditions: [conditionFor(questions()[0]!)] })}>
                <Icon name="plus" size="sm" /> Add condition
              </button>
            </div>
            <Show when={!questions().length}>
              <p class="fb-help">Rules can use only questions that come before this {props.subject}. Add a question above it first.</p>
            </Show>
          </>
        }
      >
        {(rule) => (
          <>
            <div class="fb-cond-intro">
              Show this only if
              <Sel label="All or any" value={rule().match} onChange={(v) => props.onChange({ ...plain(), match: v as Rule['match'] })}>
                <option value="all">all</option>
                <option value="any">any</option>
              </Sel>
              of these are true
            </div>
            <Index each={rule().conditions}>
              {(c, i) => {
                const q = () => byId(c().q);
                return (
                  <>
                    <Show when={i > 0}><div class="fb-cond-and">{rule().match === 'any' ? 'or' : 'and'}</div></Show>
                    <div class="fb-cond">
                      <Sel label="Question" value={q() ? c().q : ''} onChange={(v) => { const nq = byId(v); if (nq) setCondition(i, conditionFor(nq)); }}>
                        <Show when={!q()}><option value="">(question was moved or deleted)</option></Show>
                        <For each={questions()}>{(x) => <option value={x.id}>{x.label || 'Untitled question'} ({KIND_LABELS[x.kind]})</option>}</For>
                      </Sel>
                      <button class="fb-btn fb-btn--ghost fb-btn--sm fb-btn--icon" aria-label="Remove condition" style={{ 'grid-row': 'span 3' }} onClick={() => removeCondition(i)}>
                        <Icon name="x" size="sm" />
                      </button>
                      <Sel label="Operator" value={c().op} onChange={(v) => setCondition(i, { ...c(), op: v as Op })}>
                        <For each={opsFor(q())}>{(op) => <option value={op}>{OP_LABELS[op]}</option>}</For>
                      </Sel>
                      <Show when={c().op !== 'answered' && c().op !== 'not_answered'}>
                        <Switch fallback={<input class="fb-input" aria-label="Value" value={String(c().value ?? '')} onInput={(e) => setCondition(i, { ...c(), value: e.currentTarget.value })} />}>
                          <Match when={choicesOf(q())}>
                            {(opts) => (
                              <Sel label="Value" value={String(c().value ?? '')} onChange={(v) => setCondition(i, { ...c(), value: v })}>
                                <For each={opts()}>{(o) => <option value={o}>{o}</option>}</For>
                              </Sel>
                            )}
                          </Match>
                          <Match when={isNumeric(q())}>
                            <input class="fb-input" aria-label="Value" type="number" value={Number(c().value ?? 0)} onInput={(e) => setCondition(i, { ...c(), value: e.currentTarget.valueAsNumber || 0 })} />
                          </Match>
                        </Switch>
                      </Show>
                    </div>
                  </>
                );
              }}
            </Index>
            <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
              <button class="fb-add" disabled={!questions().length} onClick={() => props.onChange({ ...plain(), conditions: [...plain().conditions, conditionFor(questions()[0]!)] })}>
                <Icon name="plus" size="sm" /> Add condition
              </button>
              <button class="fb-btn fb-btn--ghost fb-btn--sm" onClick={() => props.onChange(undefined)}>Always show</button>
            </div>
          </>
        )}
      </Show>
    </div>
  );
}
