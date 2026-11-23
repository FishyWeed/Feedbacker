// Editor state: the form document, the selected item, edit actions, undo/redo and the drag-and-drop moves.
// The placement rules live in moves.ts (pure, tested); this file adds history and selection around them.
import { createContext, createSignal, useContext } from 'solid-js';
import { createStore, produce, reconcile, unwrap } from 'solid-js/store';
import { MAX_COLUMNS, newBlock, newColumn, newRow, newSection, uid, type Block, type BlockKind, type Column, type FormDoc, type Row, type Section } from '../../shared/schema';
import { api } from '../api';
import { addBlockAt, duplicateSection, moveBlockTo, moveRowTo, moveSectionTo, nudgeBlock, nudgeRow, nudgeSection, placeOf, type Target } from './moves';

type Located = { section: Section; row?: Row; column?: Column; block?: Block; index?: number };

/** Finds a section, row, column or block by id. */
export function locate(d: FormDoc, id: string): Located | null {
  for (const section of d.sections) {
    if (section.id === id) return { section };
    for (const row of section.rows) {
      if (row.id === id) return { section, row };
      for (const column of row.columns) {
        if (column.id === id) return { section, row, column };
        const index = column.blocks.findIndex((b) => b.id === id);
        if (index >= 0) return { section, row, column, block: column.blocks[index], index };
      }
    }
  }
  return null;
}

/** What can be moved: a block, a row or a section. */
export type Movable = 'block' | 'row' | 'section';
export type Dir = 'up' | 'down' | 'left' | 'right';

export type PublishState = { publishedAt: number | null; unpublished: boolean };

export function createEditor(formId: string, initial: FormDoc, initialState: PublishState) {
  const [doc, setDoc] = createStore<FormDoc>(structuredClone(initial));
  const [version, setVersion] = createSignal(0);
  const [savedVersion, setSavedVersion] = createSignal(0);
  const [selected, select] = createSignal<string | null>(null);
  const dirty = () => version() !== savedVersion();
  const changed = () => setVersion((v) => v + 1);

  // --- Undo / redo by snapshot (DragAndDrop.md §6). Typing in one field within 1.2 s is one step. ---
  const past: FormDoc[] = [];
  const future: FormDoc[] = [];
  const [historySize, setHistorySize] = createSignal({ past: 0, future: 0 });
  const syncHistory = () => setHistorySize({ past: past.length, future: future.length });
  let lastKey = '';
  let lastAt = 0;
  let grabStart: FormDoc | null = null; // keyboard pick-up: its moves become one undo step on drop
  const snap = () => structuredClone(unwrap(doc));
  function remember(before: FormDoc, mergeKey = '') {
    if (grabStart) return;
    const now = Date.now();
    if (mergeKey && mergeKey === lastKey && now - lastAt < 1200) { lastAt = now; return; }
    lastKey = mergeKey;
    lastAt = now;
    past.push(before);
    if (past.length > 100) past.shift();
    future.length = 0;
    syncHistory();
  }
  const edit = (fn: (d: FormDoc) => void, mergeKey?: string) => {
    remember(snap(), mergeKey);
    setDoc(produce(fn));
    changed();
  };
  /** Runs a move that may be a no-op; only a real change is saved to history. */
  const tryEdit = (fn: (d: FormDoc) => boolean) => {
    const before = snap();
    let ok = false;
    setDoc(produce((d) => { ok = fn(d); }));
    if (ok) { remember(before); changed(); }
    return ok;
  };
  function undo() {
    const prev = past.pop();
    if (!prev) return false;
    future.push(snap());
    setDoc(reconcile(prev));
    lastKey = '';
    changed();
    syncHistory();
    return true;
  }
  function redo() {
    const next = future.pop();
    if (!next) return false;
    past.push(snap());
    setDoc(reconcile(next));
    lastKey = '';
    changed();
    syncHistory();
    return true;
  }

  /** The column that gets a block added with a click: the selected one, else the last one. */
  function targetColumn(d: FormDoc): Column {
    const sel = selected();
    const loc = sel ? locate(d, sel) : null;
    if (loc?.column) return loc.column;
    if (!d.sections.length) d.sections.push(newSection());
    const section = loc?.section ?? d.sections[d.sections.length - 1]!;
    if (!section.rows.length) section.rows.push(newRow());
    return section.rows[section.rows.length - 1]!.columns[0]!;
  }

  const actions = {
    updateForm: (patch: Partial<FormDoc>) => edit((d) => Object.assign(d, patch), `form:${Object.keys(patch).join()}`),
    /** Click or Enter on a palette item: adds the block after the selected block, or at the end. Returns its id. */
    addBlock(kind: BlockKind) {
      const b = newBlock(kind);
      edit((d) => {
        const sel = selected();
        const at = sel ? locate(d, sel) : null;
        if (at?.column && at.index !== undefined) at.column.blocks.splice(at.index + 1, 0, b);
        else targetColumn(d).blocks.push(b);
      });
      select(b.id);
      return b.id;
    },
    /** A palette drop: adds a new block at the target. Returns its id, or null. */
    addBlockAt(kind: BlockKind, t: Target): string | null {
      const b = newBlock(kind);
      return tryEdit((d) => addBlockAt(d, b, t)) ? b.id : null;
    },
    updateBlock: (id: string, patch: Partial<Block>) =>
      edit((d) => { const b = locate(d, id)?.block; if (b) Object.assign(b, patch); }, `b:${id}:${Object.keys(patch).join()}`),
    removeBlock(id: string) {
      edit((d) => { const l = locate(d, id); if (l?.column && l.index !== undefined) l.column.blocks.splice(l.index, 1); });
      if (selected() === id) select(null);
    },
    /** Ctrl/Cmd+D: a copy right after the block, with a new id. Returns the copy's id. */
    duplicateBlock(id: string): string | null {
      const original = locate(unwrap(doc), id)?.block;
      if (!original) return null;
      const copy: Block = { ...structuredClone(original), id: uid() };
      edit((d) => { const l = locate(d, id); if (l?.column && l.index !== undefined) l.column.blocks.splice(l.index + 1, 0, copy); });
      select(copy.id);
      return copy.id;
    },
    /** Ctrl/Cmd+D on a section, or its copy button: a copy right after it. Returns the copy's id. */
    duplicateSection(id: string): string | null {
      let copy: string | null = null;
      edit((d) => { copy = duplicateSection(d, id); });
      if (copy) select(copy);
      return copy;
    },
    moveBlockTo: (id: string, t: Target) => tryEdit((d) => moveBlockTo(d, id, t)),
    moveRowTo: (id: string, sectionId: string, index: number) => tryEdit((d) => moveRowTo(d, id, sectionId, index)),
    moveSectionTo: (id: string, index: number) => tryEdit((d) => moveSectionTo(d, id, index)),
    /** One keyboard step for a block, row or section. Returns false at an edge. */
    nudge(kind: Movable, id: string, dir: Dir) {
      if (kind === 'block') return tryEdit((d) => nudgeBlock(d, id, dir));
      if (dir === 'left' || dir === 'right') return false;
      return tryEdit((d) => (kind === 'row' ? nudgeRow(d, id, dir) : nudgeSection(d, id, dir)));
    },
    addSection() {
      const s = newSection();
      edit((d) => { d.sections.push(s); });
      select(s.id);
    },
    updateSection: (id: string, patch: Partial<Section>) =>
      edit((d) => { const l = locate(d, id); if (l && !l.row) Object.assign(l.section, patch); }, `s:${id}:${Object.keys(patch).join()}`),
    removeSection(id: string) {
      edit((d) => { d.sections = d.sections.filter((s) => s.id !== id); });
      if (selected() === id) select(null);
    },
    addRow: (sectionId: string, columns: number) => edit((d) => { locate(d, sectionId)?.section.rows.push(newRow(columns)); }),
    removeRow: (rowId: string) => edit((d) => { const l = locate(d, rowId); if (l?.row) l.section.rows = l.section.rows.filter((r) => r.id !== rowId); }),
    /** Changes the column count. Blocks from removed columns move into the last column that stays. */
    setColumns: (rowId: string, n: number) =>
      edit((d) => {
        const row = locate(d, rowId)?.row;
        if (!row) return;
        const count = Math.max(1, Math.min(MAX_COLUMNS, n));
        while (row.columns.length < count) row.columns.push(newColumn());
        while (row.columns.length > count) {
          const gone = row.columns.pop()!;
          row.columns[row.columns.length - 1]!.blocks.push(...gone.blocks);
        }
      }),
  };

  /** Keyboard pick-up (Space): arrow moves happen live; drop keeps them as one undo step, cancel restores. */
  const grab = {
    start() { grabStart = snap(); },
    drop() {
      const before = grabStart;
      grabStart = null;
      if (before && JSON.stringify(before) !== JSON.stringify(unwrap(doc))) remember(before);
    },
    cancel() {
      const before = grabStart;
      grabStart = null;
      if (before) { setDoc(reconcile(before)); changed(); }
    },
  };

  const history = { undo, redo, canUndo: () => historySize().past > 0, canRedo: () => historySize().future > 0 };
  /** "page 1, row 2, column 1" for a block. */
  const placeOfBlock = (id: string) => placeOf(unwrap(doc), id);

  const [pub, setPub] = createSignal<PublishState>(initialState);

  /** Save the draft. The live link keeps the last published version. */
  async function save() {
    const v = version();
    setPub(await api<PublishState>(`/forms/${formId}`, 'PUT', unwrap(doc)));
    setSavedVersion(v);
  }
  /** Save, then make the live link show this version. */
  async function publish() {
    const v = version();
    setPub(await api<PublishState>(`/forms/${formId}/publish`, 'POST', unwrap(doc)));
    setSavedVersion(v);
  }
  /** Something visitors do not see yet: unsaved edits, a saved draft newer than the live one, or never published. */
  const needsPublish = () => dirty() || pub().unpublished || pub().publishedAt === null;

  return { doc, selected, select, dirty, actions, grab, history, placeOf: placeOfBlock, save, publish, pub, needsPublish };
}

export type Editor = ReturnType<typeof createEditor>;
export const EditorContext = createContext<Editor>();
export const useEditor = () => useContext(EditorContext)!;
