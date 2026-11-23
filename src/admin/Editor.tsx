// The form editor, with the design system's Editor, Canvas and Palette markup.
import { batch, createComputed, createContext, createEffect, createMemo, createResource, createSignal, For, Match, on, onCleanup, onMount, Show, Switch, useContext, type JSX } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { CONTENT_KINDS, isQuestion, KIND_LABELS, MAX_COLUMNS, newBlock, QUESTION_KINDS, type Block, type BlockKind, type Column, type FormDoc, type Row, type Section } from '../../shared/schema';
import { THEMES, type ThemeMode } from '../../shared/themes';
import { api } from '../api';
import FormView, { BlockView } from '../form/FormView';
import { Themed } from '../form/Themed';
import { Icon, KIND_ICON } from '../ui/icons';
import { Loading, SaveStatus, Seg, Ticker } from '../ui/kit';
import { createDnd, type Dnd, type Source } from './dnd';
import { createEditor, EditorContext, locate, useEditor, type Dir, type Editor as EditorState, type Movable, type PublishState } from './editorStore';
import { flip, reducedMotion, settle, snapshot } from './motion';
import { isNoopBlockMove, targetKey, type Target } from './moves';
import DesignSettings from './DesignSettings';
import Inspector from './Inspector';
import { devTheme, showTicker } from './appearance';
import QrDesigner from './QrDesigner';
import { plural } from './FormsList';
import { handoff, Link, setLeaveGuard } from './router';
import SharePanel from './SharePanel';

type Level = 'ok' | 'warn' | 'bad';
const LIVE_WORDS: Record<Level, string> = { bad: 'Not published', warn: 'Out of date', ok: 'Up to date' };
/** Tick for green, dot for yellow, cross for red. */
const Mark = (p: { level: Level }) => <>{p.level === 'warn' ? <span class="fb-stdot" aria-hidden="true" /> : <Icon name={p.level === 'ok' ? 'check' : 'x'} size="sm" />}</>;

export default function Editor(props: { id: string }) {
  const [data] = createResource(() => props.id, (id) => api<{ doc: FormDoc } & PublishState>(`/forms/${id}`));
  return (
    <Switch fallback={<Loading text="Loading form…" />}>
      <Match when={data.error}>
        <div class="fb-wrap">
          <div class="fb-banner fb-banner--err" role="alert"><Icon name="alert" /><span><b>Form not found.</b> It may have been deleted.</span></div>
          <p><Link href="/admin" class="fb-btn fb-btn--secondary"><Icon name="arrow-left" />Back to forms</Link></p>
        </div>
      </Match>
      <Match when={data.state === 'ready' && data()}>{(d) => <EditorView id={props.id} initial={d().doc} state={{ publishedAt: d().publishedAt, unpublished: d().unpublished }} />}</Match>
    </Switch>
  );
}

type Mode = 'edit' | 'preview' | 'qr';

function EditorView(props: { id: string; initial: FormDoc; state: PublishState }) {
  const ed = createEditor(props.id, props.initial, props.state);
  const [mode, setMode] = createSignal<Mode>(handoff.editorMode ?? 'edit');
  handoff.editorMode = null;
  const [sharing, setSharing] = createSignal(false);
  const [previewMode, setPreviewMode] = createSignal<ThemeMode>('auto');
  // Theme and background pickers beside the live preview, so every change shows on the real page at once.
  const [themePanel, setThemePanel] = createSignal(true);
  const [saving, setSaving] = createSignal(false);
  const [publishing, setPublishing] = createSignal(false);
  const [error, setError] = createSignal('');
  const [announce, setAnnounce] = createSignal('');
  /** Live region: clear first, so the same sentence is read again. */
  const say = (text: string) => { setAnnounce(''); queueMicrotask(() => setAnnounce(text)); };
  let canvasEl: HTMLDivElement | undefined;

  async function save() {
    if (saving() || !ed.dirty()) return;
    setSaving(true);
    setError('');
    try {
      await ed.save();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (publishing() || saving()) return;
    setPublishing(true);
    setError('');
    try {
      await ed.publish();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish.');
    } finally {
      setPublishing(false);
    }
  }

  const onKey = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      save();
    }
  };
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (ed.dirty()) e.preventDefault();
  };
  onMount(() => {
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onBeforeUnload);
    setLeaveGuard(() => !ed.dirty() || confirm('You have unsaved changes. Leave without saving?'));
  });
  onCleanup(() => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('beforeunload', onBeforeUnload);
    setLeaveGuard(null);
  });

  // Status levels: green (ok), yellow (warn), red (bad). Each also has its own mark, so color is never the only cue.
  const busy = () => saving() || publishing();
  const draftLevel = (): Level => (ed.dirty() ? 'warn' : 'ok');
  const liveLevel = (): Level => (ed.pub().publishedAt === null ? 'bad' : ed.needsPublish() ? 'warn' : 'ok');
  const worst = (): Level => (liveLevel() === 'bad' ? 'bad' : draftLevel() === 'warn' || liveLevel() === 'warn' ? 'warn' : 'ok');

  const openTheme = () => {
    setMode('preview');
    setThemePanel(true);
  };

  return (
    <EditorContext.Provider value={ed}>
      {/* The dev theme wraps the whole editor, except in Preview: there only the bars and panel get it, so the form shows exactly as visitors see it. */}
      <div class="fb-app is-full" data-dev-theme={mode() === 'preview' ? undefined : devTheme()}>
        <header class="fb-top" data-dev-theme={devTheme()}>
          <Link href="/admin" class="fb-btn fb-btn--ghost fb-btn--sm"><Icon name="arrow-left" size="sm" />Forms</Link>
          <span class="fb-divider-v" />
          <input class="fb-top-title" value={ed.doc.title} maxLength={200} aria-label="Form title" onInput={(e) => ed.actions.updateForm({ title: e.currentTarget.value })} />
          <Seg small label="Editor mode" value={mode()} onChange={setMode}
            options={[{ value: 'edit', label: 'Edit', icon: 'pen' }, { value: 'preview', label: 'Preview', icon: 'eye' }, { value: 'qr', label: 'QR code', icon: 'qr' }]} />
          <button class="fb-btn fb-btn--ghost fb-btn--sm" aria-pressed={mode() === 'preview' && themePanel()} onClick={openTheme}><Icon name="palette" size="sm" />Theme</button>
          <span class="fb-top-sp" />
          {/* A save error stays in view, so Retry is one click away. Otherwise the details show on hover or keyboard focus of "Status". */}
          <Show when={!error()} fallback={<SaveStatus saving={false} dirty={ed.dirty()} error={error()} onRetry={save} />}>
            <span class={`fb-btn fb-btn--ghost fb-btn--sm fb-hover-status is-${busy() ? 'busy' : worst()}`} tabIndex={0} aria-describedby="fb-ed-status">
              <Show when={!busy()} fallback={<span class="fb-spin" aria-hidden="true" />}><Mark level={worst()} /></Show>
              Status
              <span id="fb-ed-status" class="fb-menu fb-status-pop" role="status">
                <span class={`fb-stline is-${saving() ? 'busy' : draftLevel()}`}>
                  <Show when={!saving()} fallback={<span class="fb-spin" aria-hidden="true" />}><Mark level={draftLevel()} /></Show>
                  <b>Draft:</b> {saving() ? 'Saving…' : ed.dirty() ? 'Unsaved changes' : 'Saved'}
                </span>
                <span class={`fb-stline is-${publishing() ? 'busy' : liveLevel()}`}>
                  <Show when={!publishing()} fallback={<span class="fb-spin" aria-hidden="true" />}><Mark level={liveLevel()} /></Show>
                  <b>Live:</b> {publishing() ? 'Publishing…' : LIVE_WORDS[liveLevel()]}
                </span>
              </span>
            </span>
          </Show>
          <Link href={`/admin/forms/${props.id}/responses`} class="fb-btn fb-btn--ghost fb-btn--sm"><Icon name="inbox" size="sm" />Responses</Link>
          <button class="fb-btn fb-btn--ghost fb-btn--sm" onClick={() => setSharing(true)}><Icon name="share" size="sm" />Share</button>
          <button class="fb-btn fb-btn--secondary fb-btn--sm" classList={{ 'is-loading': saving() }} aria-busy={saving()}
            disabled={!ed.dirty() || saving() || publishing()} onClick={save} title="Save the draft (Ctrl+S). The live link does not change.">
            <Show when={saving()} fallback="Save draft"><span class="fb-spin" aria-hidden="true" />Saving…</Show>
          </button>
          <button class="fb-btn fb-btn--primary fb-btn--sm" classList={{ 'is-loading': publishing() }} aria-busy={publishing()}
            disabled={!ed.needsPublish() || saving() || publishing()} onClick={publish} title="Save and update the live link">
            <Show when={publishing()} fallback={<><Icon name="upload" size="sm" />Publish</>}><span class="fb-spin" aria-hidden="true" />Publishing…</Show>
          </button>
        </header>
        {/* Status ticker (Arcade and Paper dev themes): the same facts as the Status panel and the canvas. */}
        <Show when={showTicker()}>
          <div data-dev-theme={devTheme()} style={{ flex: 'none' }}>
            <Ticker items={[
              `Draft: ${busy() ? 'Saving…' : ed.dirty() ? 'Unsaved changes' : 'Saved'}`,
              `Live: ${LIVE_WORDS[liveLevel()]}`,
              `Theme: ${THEMES.find((t) => t.id === (ed.doc.theme?.preset ?? 'default'))?.name ?? 'Default'}`,
              plural(ed.doc.sections.length, 'page'),
              plural(ed.doc.sections.flatMap((s) => s.rows.flatMap((r) => r.columns.flatMap((c) => c.blocks.filter(isQuestion)))).length, 'question'),
            ]} />
          </div>
        </Show>
        <Switch>
          <Match when={mode() === 'qr'}>
            <div class="fb-stage" style={{ background: 'var(--bg)' }}><QrDesigner formId={props.id} /></div>
          </Match>
          <Match when={mode() === 'preview'}>
            <div class="fb-stage-bar" data-dev-theme={devTheme()}>
              <span class="fb-help">Show as</span>
              <Seg small label="Preview color mode" value={previewMode()} onChange={setPreviewMode}
                options={[{ value: 'auto', label: 'Form setting' }, { value: 'light', label: 'Light', icon: 'sun' }, { value: 'dark', label: 'Dark', icon: 'moon' }]} />
              <button class="fb-btn fb-btn--secondary fb-btn--sm" aria-pressed={themePanel()} onClick={() => setThemePanel(!themePanel())}>
                <Icon name="palette" size="sm" />{themePanel() ? 'Hide theme panel' : 'Show theme panel'}
              </button>
            </div>
            <div class="fb-preview-split" classList={{ 'has-panel': themePanel() }}>
              <div class="fb-stage">
                <Themed doc={ed.doc} mode={previewMode() === 'auto' ? undefined : previewMode()}>
                  <FormView doc={ed.doc} preview onSubmit={async () => {}} />
                  <span class="fb-foot">Made with Feedbacker</span>
                </Themed>
              </div>
              <Show when={themePanel()}>
                <aside class="fb-insp" aria-label="Theme and background" data-dev-theme={devTheme()}><DesignSettings /></aside>
              </Show>
            </div>
          </Match>
          <Match when={mode() === 'edit'}>
            <DragLayer ed={ed} canvas={() => canvasEl} onAnnounce={say}>
              <div class="fb-ed">
                <Palette />
                <Canvas ref={(el) => (canvasEl = el)} />
                <Inspector />
              </div>
            </DragLayer>
          </Match>
        </Switch>
        <div class="fb-sr" role="status" aria-live="polite">{announce()}</div>
        <Show when={sharing()}>
          <SharePanel id={props.id} title={ed.doc.title} doc={ed.doc} published={ed.pub().publishedAt !== null} onClose={() => setSharing(false)} onCustomize={() => setMode('qr')} />
        </Show>
      </div>
    </EditorContext.Provider>
  );
}

// ---------------------------------------------------------------------------------------------------------------
// Drag and drop (design system: DragAndDrop.md). The engine (dnd.ts) owns the pointer; this part draws every state
// and decides what a drop means. Rules for where things land live in moves.ts.
// ---------------------------------------------------------------------------------------------------------------

type Toast = { id: number; text: string; undo: boolean };
type Grabbed = { kind: Movable; id: string } | null;

type DragUi = {
  dnd: Dnd;
  /** The target to draw: null for a no-op (the block would stay where it is). */
  lit: () => Target | null;
  grabbed: () => Grabbed;
  /** Keyboard moves for a focused block, row handle or section handle. Returns true if it used the key. */
  onMoveKey: (kind: Movable, id: string, e: KeyboardEvent) => boolean;
  /** Runs a change and slides everything that moved (FLIP). */
  withFlip: (fn: () => void) => void;
  /** Copies a block or a section to right after it. */
  duplicate: (id: string) => void;
};
const DragContext = createContext<DragUi>();
const useDrag = () => useContext(DragContext)!;

const blockLabel = (b: Block | undefined) => (b ? b.label?.trim() || KIND_LABELS[b.kind] : 'Block');
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const isControl = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, input, textarea, select, a, label, [contenteditable]');

function DragLayer(props: { ed: EditorState; canvas: () => HTMLElement | undefined; onAnnounce: (s: string) => void; children: JSX.Element }) {
  const ed = props.ed;
  const [toasts, setToasts] = createSignal<Toast[]>([]);
  const [grabbed, setGrabbed] = createSignal<Grabbed>(null);
  let overlayEl: HTMLDivElement | undefined;
  let toastId = 0;
  let endBefore: Map<string, DOMRect> | null = null;
  let releaseRect: DOMRect | null = null;

  const toast = (text: string, undo = false) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, text, undo }].slice(-3)); // at most 3, newest last
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
    props.onAnnounce(text);
  };
  const withFlip = (fn: () => void) => {
    const root = props.canvas();
    const before = root ? snapshot(root) : null;
    fn();
    if (root && before) flip(before, { root });
  };
  const undo = (id?: number) => {
    if (id) setToasts((t) => t.filter((x) => x.id !== id));
    withFlip(() => { if (ed.history.undo()) props.onAnnounce('Move undone.'); });
  };

  const sourceName = (s: Source) =>
    s.type === 'new' ? KIND_LABELS[s.kind]
      : s.type === 'block' ? blockLabel(locate(unwrap(ed.doc), s.id)?.block)
        : s.type === 'row' ? 'Row' : (ed.doc.sections.find((x) => x.id === s.id)?.title?.trim() || 'Section');
  const pageOf = (sectionIndex: number) => sectionIndex + 1; // every section is a page
  const rowPlace = (rowId: string) => {
    for (const [si, s] of ed.doc.sections.entries()) {
      const ri = s.rows.findIndex((r) => r.id === rowId);
      if (ri >= 0) return `page ${pageOf(si)}, row ${ri + 1}`;
    }
    return '';
  };
  const describe = (t: Target): string => {
    if (t.type === 'invalid') return t.reason;
    if (t.type === 'section') return `Position ${t.index + 1} of ${ed.doc.sections.length + 1}.`;
    if (t.type === 'newrow') {
      const si = ed.doc.sections.findIndex((s) => s.id === t.sectionId);
      return `New row, page ${pageOf(si)}, row ${t.index + 1}.`;
    }
    if (t.type === 'side') return `New column ${t.side} of ${blockLabel(locate(unwrap(ed.doc), t.blockId)?.block)}.`;
    const l = locate(unwrap(ed.doc), t.columnId);
    if (!l?.row || !l.column) return '';
    const above = l.column.blocks[t.index - 1];
    return `Row ${l.section.rows.indexOf(l.row) + 1}, column ${l.row.columns.indexOf(l.column) + 1}, ${above ? `below ${blockLabel(above)}` : 'at the top'}.`;
  };

  const dnd: Dnd = createDnd({
    canvas: props.canvas,
    overlay: () => overlayEl,
    onLift: (d) => props.onAnnounce(`${sourceName(d.source)} picked up. Drag to a new place, or press Escape to cancel.`),
    onBeforeEnd: () => {
      const root = props.canvas();
      endBefore = root ? snapshot(root) : null;
      releaseRect = overlayEl?.firstElementChild?.getBoundingClientRect() ?? null;
    },
    onCancel: (d) => {
      void dnd.goHome();
      if (d.source.type === 'new') props.onAnnounce('Add cancelled.');
      else toast('Move cancelled');
    },
    onDrop: (d, t) => {
      const s = d.source;
      // A block dropped where it already is: it flies home, no toast, no undo entry.
      if (s.type === 'block' && isNoopBlockMove(unwrap(ed.doc), s.id, t)) return void dnd.goHome();
      let placed: string | null = null;
      let ok = false;
      batch(() => {
        dnd.clear();
        if (s.type === 'new') ok = !!(placed = ed.actions.addBlockAt(s.kind, t));
        else if (s.type === 'block') { ok = ed.actions.moveBlockTo(s.id, t); placed = s.id; }
        else if (s.type === 'row' && t.type === 'newrow') ok = ed.actions.moveRowTo(s.id, t.sectionId, t.index);
        else if (s.type === 'section' && t.type === 'section') ok = ed.actions.moveSectionTo(s.id, t.index);
      });
      const root = props.canvas();
      if (!ok || !root) return;
      if (s.type === 'new' || s.type === 'block') {
        flip(endBefore ?? new Map(), { root, skip: `b:${placed}` });
        const el = root.querySelector<HTMLElement>(`[data-fb-block="${placed}"]`);
        if (el) { settle(el, releaseRect); el.focus({ preventScroll: true }); }
        ed.select(placed);
        const b = locate(unwrap(ed.doc), placed!)?.block;
        toast(`${blockLabel(b)} ${s.type === 'new' ? 'added to' : 'moved to'} ${ed.placeOf(placed!)}`, true);
      } else if (s.type === 'row') {
        flip(endBefore ?? new Map(), { root });
        toast(`Row moved to ${rowPlace(s.id)}`, true);
      } else {
        // Sections: the outline closes and everything changes, so no FLIP; show the moved one.
        ed.select(s.id);
        queueMicrotask(() => root.querySelector(`[data-fb-section="${s.id}"]`)?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }));
        toast(`${sourceName(s)} moved to position ${ed.doc.sections.findIndex((x) => x.id === s.id) + 1}`, true);
      }
      endBefore = null;
    },
  });

  // What to draw: a block target that would change nothing shows no indicator.
  const lit = createMemo(() => {
    const d = dnd.drag();
    const t = d?.target ?? null;
    if (!d || d.phase !== 'drag' || !t) return null;
    if (d.source.type === 'block' && t.type !== 'invalid' && isNoopBlockMove(unwrap(ed.doc), d.source.id, t)) return null;
    if (d.source.type === 'section' && t.type === 'section') {
      const from = ed.doc.sections.findIndex((x) => x.id === (d.source as { id: string }).id);
      if (t.index === from || t.index === from + 1) return null;
    }
    return t;
  }, null, { equals: (a, b) => targetKey(a) === targetKey(b) });

  // FLIP while dragging: snapshot before the slot moves (createComputed runs before the DOM updates), slide after.
  let before: Map<string, DOMRect> | null = null;
  createComputed(on(() => targetKey(lit()), () => { const root = props.canvas(); before = root ? snapshot(root) : null; }, { defer: true }));
  createEffect(on(() => targetKey(lit()), () => { const root = props.canvas(); if (root && before) flip(before, { root }); before = null; }, { defer: true }));
  // Say where it would land, once the pointer rests (400ms).
  let sayTimer = 0;
  createEffect(on(lit, (t) => { clearTimeout(sayTimer); if (t) sayTimer = window.setTimeout(() => props.onAnnounce(describe(t)), 400); }, { defer: true }));
  createEffect(() => document.body.classList.toggle('fb-nodrop-cursor', lit()?.type === 'invalid'));
  onCleanup(() => { clearTimeout(sayTimer); dnd.clear(); document.body.classList.remove('fb-nodrop-cursor'); });

  // --- Keyboard: Space picks up, arrows move, Space/Enter drops, Esc cancels. Alt+arrows move one step directly. ---
  const ARROW: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
  const placeText = (kind: Movable, id: string) =>
    kind === 'block' ? ed.placeOf(id) : kind === 'row' ? rowPlace(id) : `position ${ed.doc.sections.findIndex((s) => s.id === id) + 1} of ${ed.doc.sections.length}`;
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const nameOf = (kind: Movable, id: string): string => sourceName(kind === 'block' ? { type: 'block', id } : { type: kind, id });
  const refocus = (kind: Movable, id: string) => queueMicrotask(() => {
    const sel = kind === 'block' ? `[data-fb-block="${id}"]` : `[data-fb-handle="${kind}:${id}"]`;
    props.canvas()?.querySelector<HTMLElement>(sel)?.focus({ preventScroll: false });
  });
  function onMoveKey(kind: Movable, id: string, e: KeyboardEvent): boolean {
    const g = grabbed();
    const mine = g?.kind === kind && g.id === id;
    const dir = ARROW[e.key];
    if (mine) {
      if (dir) {
        withFlip(() => props.onAnnounce(ed.actions.nudge(kind, id, dir) ? `${cap(placeText(kind, id))}.` : 'It cannot move further that way.'));
        refocus(kind, id);
      } else if (e.key === ' ' || e.key === 'Enter') {
        ed.grab.drop();
        setGrabbed(null);
        props.onAnnounce(`${nameOf(kind, id)} dropped at ${placeText(kind, id)}.`);
      } else if (e.key === 'Escape') {
        withFlip(() => ed.grab.cancel());
        setGrabbed(null);
        props.onAnnounce('Move cancelled.');
        refocus(kind, id);
      } else {
        // Any other key (Tab, for example) keeps the moves made so far, like a drop.
        if (e.key === 'Tab') { ed.grab.drop(); setGrabbed(null); }
        return false;
      }
      e.preventDefault();
      return true;
    }
    if (e.key === ' ' && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (g) { ed.grab.drop(); }
      ed.grab.start();
      setGrabbed({ kind, id });
      const hint = kind === 'block' ? 'Arrows move it, Space drops, Escape cancels.' : 'Up and down arrows move it, Space drops, Escape cancels.';
      props.onAnnounce(`${nameOf(kind, id)}, picked up. ${placeText(kind, id)}. ${hint}`);
      return true;
    }
    if (e.altKey && dir) {
      e.preventDefault();
      withFlip(() => props.onAnnounce(ed.actions.nudge(kind, id, dir) ? `${nameOf(kind, id)} moved to ${placeText(kind, id)}.` : 'It cannot move further that way.'));
      refocus(kind, id);
      return true;
    }
    return false;
  }

  /** Duplicate a block or a section (Ctrl/Cmd+D on the selection, or its Duplicate button): the copy lands right after it. */
  function duplicate(id: string) {
    const l = locate(unwrap(ed.doc), id);
    if (!l || (l.row && !l.block)) return; // rows and columns have no duplicate
    let copy: string | null = null;
    withFlip(() => { copy = l.block ? ed.actions.duplicateBlock(id) : ed.actions.duplicateSection(id); });
    if (!copy) return;
    if (l.block) { refocus('block', copy); props.onAnnounce(`Duplicated. ${ed.placeOf(copy)}.`); }
    else {
      refocus('section', copy);
      toast(`Section duplicated: position ${ed.doc.sections.findIndex((x) => x.id === copy) + 1}`, true);
    }
  }

  // Undo / redo / duplicate anywhere in the editor, except while typing (text fields keep their own undo).
  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || isTyping(e.target) || dnd.drag()) return;
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'y') {
      e.preventDefault();
      const redo = k === 'y' || e.shiftKey;
      withFlip(() => props.onAnnounce((redo ? ed.history.redo() : ed.history.undo()) ? (redo ? 'Redone.' : 'Undone.') : redo ? 'Nothing to redo.' : 'Nothing to undo.'));
    } else if (k === 'd') {
      const sel = ed.selected();
      if (!sel || !locate(unwrap(ed.doc), sel)) return;
      e.preventDefault();
      duplicate(sel);
    }
  };
  onMount(() => window.addEventListener('keydown', onKey));
  onCleanup(() => window.removeEventListener('keydown', onKey));

  const overlayBlock = createMemo(() => {
    const d = dnd.drag();
    if (!d) return null;
    if (d.source.type === 'new') return newBlock(d.source.kind);
    if (d.source.type === 'block') return locate(unwrap(ed.doc), d.source.id)?.block ?? null;
    return null;
  });

  return (
    <DragContext.Provider value={{ dnd, lit, grabbed, onMoveKey, withFlip, duplicate }}>
      {props.children}
      {/* The copy that follows the pointer (fixed, pointer-events: none). */}
      <Show when={dnd.drag()}>
        {(d) => {
          const w = () => (d().source.type === 'new' ? 240 : Math.min(d().w, 420));
          const dx = () => Math.min(d().dx, w() - 16);
          const dy = () => (d().source.type === 'row' ? 20 : d().source.type === 'section' ? 22 : Math.min(d().dy, 48));
          return (
            <div ref={overlayEl} class="fb-drag-overlay" classList={{ 'is-flyback': d().phase === 'flyback' }}
              style={{ position: 'fixed', left: `${dnd.pointer().x - dx()}px`, top: `${dnd.pointer().y - dy()}px`, '--w': `${w()}px`, 'z-index': 50 }}>
              <Switch>
                <Match when={overlayBlock()}>{(b) => <div class="fb-block"><BlockFace block={b()} /></div>}</Match>
                <Match when={d().source.type === 'row'}>
                  <RowBar id={(d().source as { id: string }).id} />
                </Match>
                <Match when={d().source.type === 'section'}>
                  <SectionBar id={(d().source as { id: string }).id} dragging />
                </Match>
              </Switch>
            </div>
          );
        }}
      </Show>
      {/* Invalid target: the reason next to the pointer, shaken once. */}
      <Show when={lit()?.type === 'invalid' ? (lit() as { reason: string }).reason : ''} keyed>
        {(reason) => (
          <div class="fb-nodrop" role="status" style={{ position: 'fixed', left: `${dnd.pointer().x + 16}px`, top: `${dnd.pointer().y + 18}px`, 'z-index': 51, 'pointer-events': 'none' }}>
            <Icon name="alert" size="sm" />{reason}
          </div>
        )}
      </Show>
      <Show when={grabbed()}>
        {(g) => (
          <div class="fb-keyhint" style={{ position: 'fixed', left: '50%', bottom: '76px', transform: 'translateX(-50%)', 'z-index': 40 }} aria-hidden="true">
            <span class="fb-kbd">↑</span><span class="fb-kbd">↓</span>move
            <Show when={g().kind === 'block'}><span class="fb-kbd">←</span><span class="fb-kbd">→</span>column</Show>
            <span class="fb-kbd">Space</span>drop<span class="fb-kbd">Esc</span>cancel
          </div>
        )}
      </Show>
      <div class="fb-toasts" style={{ position: 'fixed', display: 'flex', 'flex-direction': 'column', gap: '8px', 'align-items': 'center' }}>
        <For each={toasts()}>
          {(t) => (
            <div class="fb-toast" role="status">
              {t.text}
              <Show when={t.undo}><button type="button" class="fb-btn fb-btn--ghost fb-btn--sm" onClick={() => undo(t.id)}>Undo</button></Show>
            </div>
          )}
        </For>
      </div>
    </DragContext.Provider>
  );
}

function Palette() {
  return (
    <nav class="fb-pal" aria-label="Blocks">
      <p class="fb-help" style={{ padding: '0 8px 4px' }}>Drag a block onto the form, or press Enter to add it.</p>
      <div class="fb-pal-g" style={{ 'padding-top': 0 }}>Questions</div>
      <For each={QUESTION_KINDS}>{(k) => <PaletteItem kind={k} />}</For>
      <div class="fb-pal-g">Content</div>
      <For each={CONTENT_KINDS}>{(k) => <PaletteItem kind={k} />}</For>
    </nav>
  );
}

function PaletteItem(props: { kind: BlockKind }) {
  const ed = useEditor();
  const { dnd, withFlip } = useDrag();
  let el!: HTMLButtonElement;
  return (
    <button ref={el} type="button" class="fb-pal-item" classList={{ 'is-source': dnd.drag()?.source.type === 'new' && (dnd.drag()!.source as { kind: BlockKind }).kind === props.kind }}
      onPointerDown={(e) => dnd.press({ type: 'new', kind: props.kind }, e, el)}
      onClick={() => withFlip(() => {
        const id = ed.actions.addBlock(props.kind);
        queueMicrotask(() => document.querySelector(`[data-fb-block="${id}"]`)?.scrollIntoView({ block: 'nearest' }));
      })}>
      <Icon name="grip" class="fb-grip" />
      <Icon name={KIND_ICON[props.kind]} />
      {KIND_LABELS[props.kind]}
    </button>
  );
}

function Canvas(props: { ref: (el: HTMLDivElement) => void }) {
  const ed = useEditor();
  const { dnd } = useDrag();
  const kind = () => dnd.drag()?.source.type;
  return (
    <div ref={props.ref} class="fb-canvas" data-fb-canvas
      classList={{ 'is-dragging-any': kind() === 'new' || kind() === 'block' || kind() === 'row', 'is-scroll-up': dnd.scrolling() === 'up', 'is-scroll-down': dnd.scrolling() === 'down' }}
      onClick={(e) => e.target === e.currentTarget && ed.select(null)}>
      <div class="fb-canvas-inner">
        <div class="fb-sec" classList={{ 'is-selected': ed.selected() === null }} style={{ gap: '8px', padding: '20px' }} onClick={() => ed.select(null)}>
          <input class="fb-top-title" style={{ 'font-size': '22px', height: '40px', 'margin-left': '-8px' }} value={ed.doc.title} aria-label="Form title"
            placeholder="Untitled form" onInput={(e) => ed.actions.updateForm({ title: e.currentTarget.value })} />
          <input class="fb-top-title" style={{ 'font-weight': 400, color: 'var(--muted)', 'margin-left': '-8px' }} value={ed.doc.description ?? ''}
            aria-label="Description" placeholder="Add a short description" onInput={(e) => ed.actions.updateForm({ description: e.currentTarget.value })} />
        </div>
        <Show when={kind() === 'section'} fallback={
          <For each={ed.doc.sections}>
            {(s, i) => (
              <>
                <Show when={i() > 0}><div class="fb-newpage">Page {i() + 1}</div></Show>
                <SectionCard section={s} index={i()} />
              </>
            )}
          </For>
        }>
          <Outline />
        </Show>
        <button class="fb-add fb-add--section" onClick={() => ed.actions.addSection()}><Icon name="plus" />Add section</button>
      </div>
    </div>
  );
}

/** Section drag: every section folds to a 44px bar, so the whole form fits; drop between bars. */
function Outline() {
  const ed = useEditor();
  const { dnd, lit } = useDrag();
  const at = () => { const t = lit(); return t?.type === 'section' ? t.index : -1; };
  const sourceId = () => (dnd.drag()?.source as { id?: string } | undefined)?.id;
  return (
    <div class="fb-outline" data-fb-outline>
      <For each={ed.doc.sections}>
        {(s, i) => (
          <>
            <Show when={at() === i()}><div class="fb-insert" style={{ margin: '4px 0' }} /></Show>
            <div data-fb-secbar={i()} data-fb-flip={`o:${s.id}`}><SectionBar id={s.id} ghost={s.id === sourceId()} /></div>
          </>
        )}
      </For>
      <Show when={at() === ed.doc.sections.length}><div class="fb-insert" style={{ margin: '4px 0' }} /></Show>
    </div>
  );
}

function SectionBar(props: { id: string; ghost?: boolean; dragging?: boolean }) {
  const ed = useEditor();
  const index = () => ed.doc.sections.findIndex((s) => s.id === props.id);
  const section = () => ed.doc.sections[index()];
  const page = () => index() + 1;
  const count = () => section()?.rows.reduce((n, r) => n + r.columns.reduce((m, c) => m + c.blocks.length, 0), 0) ?? 0;
  return (
    <div class="fb-outline-sec" classList={{ 'is-ghost': props.ghost, 'is-dragging': props.dragging }}>
      <Icon name="grip" size="sm" />
      {section()?.title?.trim() || `Section ${index() + 1}`}
      <small>Page {page()} · {count()} {count() === 1 ? 'block' : 'blocks'}</small>
    </div>
  );
}

/** Row drag: the row collapses to a 40px bar with its column count and block names. */
function RowBar(props: { id: string }) {
  const ed = useEditor();
  const row = () => locate(unwrap(ed.doc), props.id)?.row;
  const n = () => row()?.columns.length ?? 1;
  return (
    <div class="fb-rowbar">
      <Icon name="grip" size="sm" />
      <span class="fb-colglyph"><For each={Array.from({ length: n() })}>{() => <i />}</For></span>
      Row · {n()} {n() === 1 ? 'column' : 'columns'}
      <span class="fb-muted" style={{ 'font-weight': 500, overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' }}>
        {row()?.columns.flatMap((c) => c.blocks.map(blockLabel)).join(', ')}
      </span>
    </div>
  );
}

function SectionCard(props: { section: Section; index: number }) {
  const ed = useEditor();
  const { dnd, onMoveKey, duplicate } = useDrag();
  const id = props.section.id;
  let el!: HTMLDivElement;
  const hasBlocks = () => props.section.rows.some((r) => r.columns.some((c) => c.blocks.length));
  const remove = () => {
    if (!hasBlocks() || confirm('Delete this section and all its blocks?')) ed.actions.removeSection(id);
  };
  return (
    <div ref={el} class="fb-sec" data-fb-section={id} classList={{ 'is-selected': ed.selected() === id }}>
      <div class="fb-sec-h" data-fb-sec-h={id} data-fb-flip={`s:${id}`} onClick={() => ed.select(id)}>
        <button class="fb-handle" data-fb-handle={`section:${id}`} aria-label="Move section. Space picks it up; Alt and arrow keys move it."
          onPointerDown={(e) => dnd.press({ type: 'section', id }, e, e.currentTarget.parentElement!)}
          onKeyDown={(e) => onMoveKey('section', id, e)}><Icon name="grip" /></button>
        <input value={props.section.title ?? ''} placeholder={`Section ${props.index + 1}`} aria-label="Section title"
          onFocus={() => ed.select(id)} onInput={(e) => ed.actions.updateSection(id, { title: e.currentTarget.value })} />
        <Show when={props.section.showIf}><span class="fb-badge fb-badge--cond"><Icon name="branch" />Conditional</span></Show>
        <button class="fb-btn fb-btn--ghost fb-btn--sm fb-btn--icon" aria-label="Duplicate section" title="Duplicate (Ctrl+D)" onClick={(e) => { e.stopPropagation(); duplicate(id); }}>
          <Icon name="copy" size="sm" />
        </button>
        <button class="fb-btn fb-btn--danger-ghost fb-btn--sm fb-btn--icon" aria-label="Delete section" onClick={(e) => { e.stopPropagation(); remove(); }}>
          <Icon name="trash" size="sm" />
        </button>
      </div>
      <div style={{ display: 'flex', 'flex-direction': 'column', gap: '6px' }}>
        <Show when={props.section.rows.length > 0} fallback={<EmptySection sectionId={id} />}>
          <For each={props.section.rows}>
            {(r, i) => (
              <>
                <Dropline sectionId={id} at={i()} />
                <RowCard row={r} />
              </>
            )}
          </For>
          <Dropline sectionId={id} at={props.section.rows.length} />
        </Show>
      </div>
      <div class="fb-addrow" style={{ 'margin-top': '6px' }}>
        Add row:
        <For each={[1, 2, 3, 4]}>
          {(n) => (
            <button class="fb-add" onClick={() => ed.actions.addRow(id, n)}>
              <span class="fb-colglyph"><For each={Array.from({ length: n })}>{() => <i />}</For></span> {n} {n === 1 ? 'column' : 'columns'}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

const isNewRow = (t: Target | null, sectionId: string, at: number) => t?.type === 'newrow' && t.sectionId === sectionId && t.index === at;

/** "New row" line above, between and below rows. A block dropped here gets its own new row; rows land only here. */
function Dropline(props: { sectionId: string; at: number }) {
  const { lit } = useDrag();
  const over = () => isNewRow(lit(), props.sectionId, props.at);
  return (
    <div class="fb-dropline" classList={{ 'is-over': over() }} data-fb-dropline data-fb-sec={props.sectionId} data-fb-at={props.at} aria-hidden="true">
      <span><Show when={over()}><Icon name="plus" size="sm" /></Show>New row</span>
    </div>
  );
}

/** A section with no rows is one big "new row" target. */
function EmptySection(props: { sectionId: string }) {
  const { lit } = useDrag();
  const over = () => isNewRow(lit(), props.sectionId, 0);
  return (
    <div class="fb-zone" classList={{ 'is-over': over() }} data-fb-dropline data-fb-sec={props.sectionId} data-fb-at={0}>
      <div class="fb-zone-empty">{over() ? 'Release to place here' : 'Drop a block or a row here'}</div>
    </div>
  );
}

function RowCard(props: { row: Row }) {
  const ed = useEditor();
  const { dnd, lit, onMoveKey } = useDrag();
  const id = props.row.id;
  const count = () => props.row.columns.length;
  const hasBlocks = () => props.row.columns.some((c) => c.blocks.length);
  const isSource = () => { const s = dnd.drag()?.source; return s?.type === 'row' && s.id === id; };
  const invalid = () => { const t = lit(); return t?.type === 'invalid' && t.rowId === id; };
  return (
    <div class="fb-row" data-fb-row={id} data-fb-cols={count()} classList={{ 'is-ghost': isSource(), 'is-invalid': invalid() }}>
      <div class="fb-row-h" data-fb-flip={`r:${id}`}>
        <button class="fb-handle" data-fb-handle={`row:${id}`} aria-label="Move row. Space picks it up; Alt and arrow keys move it."
          onPointerDown={(e) => dnd.press({ type: 'row', id }, e, e.currentTarget.parentElement!)}
          onKeyDown={(e) => onMoveKey('row', id, e)}><Icon name="grip" size="sm" /></button>
        <span>Row · {count()} {count() === 1 ? 'column' : 'columns'}</span>
        <span class="fb-sp" />
        <span class="fb-step" role="group" aria-label="Columns">
          <button aria-label="Fewer columns" disabled={count() <= 1} onClick={() => ed.actions.setColumns(id, count() - 1)}><Icon name="minus" size="sm" /></button>
          <output>{count()}</output>
          <button aria-label="More columns" disabled={count() >= MAX_COLUMNS} onClick={() => ed.actions.setColumns(id, count() + 1)}><Icon name="plus" size="sm" /></button>
        </span>
        <button class="fb-btn fb-btn--danger-ghost fb-btn--sm fb-btn--icon" aria-label="Delete row"
          onClick={() => (!hasBlocks() || confirm('Delete this row and its blocks?')) && ed.actions.removeRow(id)}>
          <Icon name="trash" size="sm" />
        </button>
      </div>
      <div class="fb-cols" style={{ '--n': count() }}>
        <For each={props.row.columns}>{(c) => <ColumnZone column={c} />}</For>
      </div>
    </div>
  );
}

function ColumnZone(props: { column: Column }) {
  const ed = useEditor();
  const { dnd, lit } = useDrag();
  const at = () => { const t = lit(); return t?.type === 'column' && t.columnId === props.column.id ? t.index : -1; };
  const empty = () => props.column.blocks.length === 0;
  const name = () => {
    const d = dnd.drag();
    return d?.source.type === 'new' ? KIND_LABELS[d.source.kind] : d?.source.type === 'block' ? blockLabel(locate(unwrap(ed.doc), d.source.id)?.block) : '';
  };
  const slotH = () => `${Math.min(dnd.drag()?.h ?? 64, 140)}px`;
  const Slot = () => (
    <>
      <div class="fb-insert" />
      <div class="fb-slot" data-fb-slot style={{ '--slot-h': slotH() }}>{name()} lands here</div>
    </>
  );
  return (
    <div class="fb-zone" classList={{ 'is-over': empty() && at() >= 0 }} data-fb-col={props.column.id} data-fb-count={props.column.blocks.length}>
      <For each={props.column.blocks}>
        {(b, i) => (
          <>
            <Show when={!empty() && at() === i()}><Slot /></Show>
            <BlockCard block={b} index={i()} />
          </>
        )}
      </For>
      <Show when={!empty() && at() === props.column.blocks.length}><Slot /></Show>
      <Show when={empty()}>
        <div class="fb-zone-empty">{at() >= 0 ? 'Release to place here' : 'Drop a block here'}</div>
      </Show>
    </div>
  );
}

/** The block's face: type badge, flags and a live preview. Used on the canvas and for the drag copy. */
function BlockFace(props: { block: Block; actions?: JSX.Element }) {
  return (
    <>
      <div class="fb-block-h">
        <span class="fb-badge fb-badge--type"><Icon name={KIND_ICON[props.block.kind]} />{KIND_LABELS[props.block.kind]}</span>
        <Show when={props.block.required}><span class="fb-badge fb-badge--req">Required</span></Show>
        <Show when={props.block.showIf}><span class="fb-badge fb-badge--cond"><Icon name="branch" />Conditional</span></Show>
        <span class="fb-sp" />
        {props.actions}
      </div>
      {/* A live, non-interactive preview of the block; edit it in the panel on the right. */}
      <div class="fb-bp" inert>
        <BlockView block={props.block} compact onChange={() => {}} />
      </div>
    </>
  );
}

function BlockCard(props: { block: Block; index: number }) {
  const ed = useEditor();
  const { dnd, lit, grabbed, onMoveKey, withFlip, duplicate } = useDrag();
  const id = props.block.id;
  let el!: HTMLDivElement;
  const isSource = () => { const s = dnd.drag()?.source; return s?.type === 'block' && s.id === id; };
  const side = () => { const t = lit(); return t?.type === 'side' && t.blockId === id ? t.side : null; };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.target !== el) return;
    if (onMoveKey('block', id, e)) return;
    if (e.key === 'Enter') { e.preventDefault(); ed.select(id); return; }
    if (e.key === 'Delete') { e.preventDefault(); withFlip(() => ed.actions.removeBlock(id)); }
  };
  return (
    <div ref={el} class="fb-block" tabIndex={0} role="button"
      data-fb-block={id} data-fb-index={props.index} data-fb-flip={`b:${id}`}
      aria-label={`${KIND_LABELS[props.block.kind]} block${props.block.label ? `: ${props.block.label}` : ''}. Space picks it up; Alt and arrow keys move it.`}
      classList={{
        'is-selected': ed.selected() === id, 'is-ghost': isSource(), 'is-pressed': dnd.pressed() === `block:${id}`,
        'is-grabbed': grabbed()?.kind === 'block' && grabbed()?.id === id,
        'fb-side': !!side(), 'is-left': side() === 'left', 'is-right': side() === 'right',
      }}
      onPointerDown={(e) => { if (!isControl(e.target)) dnd.press({ type: 'block', id }, e, el); }}
      onClick={(e) => { e.stopPropagation(); ed.select(id); }} onKeyDown={onKeyDown}>
      <Show when={side()}><span class="fb-side-tag">New column</span></Show>
      <BlockFace block={props.block} actions={<>
        <button class="fb-btn fb-btn--ghost fb-btn--sm fb-btn--icon" aria-label="Duplicate block" title="Duplicate (Ctrl+D)"
          onClick={(e) => { e.stopPropagation(); duplicate(id); }}>
          <Icon name="copy" size="sm" />
        </button>
        <button class="fb-btn fb-btn--danger-ghost fb-btn--sm fb-btn--icon" aria-label="Delete block"
          onClick={(e) => { e.stopPropagation(); withFlip(() => ed.actions.removeBlock(id)); }}>
          <Icon name="trash" size="sm" />
        </button>
      </>} />
    </div>
  );
}
