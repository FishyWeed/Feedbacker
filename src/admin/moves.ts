// Drag-and-drop placement rules (design system: DragAndDrop.md §3 and §7), as plain functions on a form document.
// They mutate the document they get (the store calls them inside produce()) and hold no DOM or UI state.
import { MAX_COLUMNS, newColumn, newRow, uid, type Block, type Column, type FormDoc, type Row, type Section } from '../../shared/schema';

/** Where a dragged block, row or section lands. */
export type Target =
  | { type: 'column'; columnId: string; index: number } // insert into a column, before blocks[index]
  | { type: 'side'; rowId: string; blockId: string; side: 'left' | 'right' } // new column beside a block
  | { type: 'newrow'; sectionId: string; index: number } // new 1-column row before rows[index]
  | { type: 'section'; index: number } // outline mode: before sections[index]
  | { type: 'invalid'; rowId: string; reason: string };

export const targetKey = (t: Target | null) => (t ? JSON.stringify(t) : '');

type Where = { section: Section; sectionIndex: number; row: Row; rowIndex: number; column: Column; columnIndex: number; index: number };

/** Finds a block and everything around it. */
export function whereIs(d: FormDoc, blockId: string): Where | null {
  for (const [sectionIndex, section] of d.sections.entries())
    for (const [rowIndex, row] of section.rows.entries())
      for (const [columnIndex, column] of row.columns.entries()) {
        const index = column.blocks.findIndex((b) => b.id === blockId);
        if (index >= 0) return { section, sectionIndex, row, rowIndex, column, columnIndex, index };
      }
  return null;
}

const findColumn = (d: FormDoc, id: string) => d.sections.flatMap((s) => s.rows.flatMap((r) => r.columns)).find((c) => c.id === id);
const findRow = (d: FormDoc, id: string) => {
  for (const section of d.sections) {
    const index = section.rows.findIndex((r) => r.id === id);
    if (index >= 0) return { section, row: section.rows[index]!, index };
  }
  return null;
};

/** Puts a block at a target. Returns false if the target does not exist (nothing changes). */
function insert(d: FormDoc, b: Block, t: Target): boolean {
  if (t.type === 'column') {
    const col = findColumn(d, t.columnId);
    if (!col) return false;
    col.blocks.splice(Math.max(0, Math.min(t.index, col.blocks.length)), 0, b);
    return true;
  }
  if (t.type === 'side') {
    const r = findRow(d, t.rowId);
    if (!r || r.row.columns.length >= MAX_COLUMNS) return false;
    const ci = r.row.columns.findIndex((c) => c.blocks.some((x) => x.id === t.blockId));
    if (ci < 0) return false;
    const col = newColumn();
    col.blocks.push(b);
    r.row.columns.splice(ci + (t.side === 'right' ? 1 : 0), 0, col);
    return true;
  }
  if (t.type === 'newrow') {
    const section = d.sections.find((s) => s.id === t.sectionId);
    if (!section) return false;
    const row = newRow(1);
    row.columns[0]!.blocks.push(b);
    section.rows.splice(Math.max(0, Math.min(t.index, section.rows.length)), 0, row);
    return true;
  }
  return false;
}

/** Adds a new block. */
export const addBlockAt = (d: FormDoc, b: Block, t: Target) => insert(d, b, t);

/** True if moving the block to the target leaves the form as it is (DragAndDrop.md §7: no toast, no undo entry). */
export function isNoopBlockMove(d: FormDoc, blockId: string, t: Target): boolean {
  const w = whereIs(d, blockId);
  if (!w) return true;
  if (t.type === 'column') return t.columnId === w.column.id && (t.index === w.index || t.index === w.index + 1);
  const alone = w.column.blocks.length === 1;
  const onlyColumn = w.row.columns.length === 1;
  if (t.type === 'newrow') return alone && onlyColumn && t.sectionId === w.section.id && (t.index === w.rowIndex || t.index === w.rowIndex + 1);
  if (t.type === 'side') {
    if (!alone || t.rowId !== w.row.id) return false;
    const ci = w.row.columns.findIndex((c) => c.blocks.some((x) => x.id === t.blockId));
    const at = ci + (t.side === 'right' ? 1 : 0);
    return at === w.columnIndex || at === w.columnIndex + 1;
  }
  return true;
}

/**
 * Moves a block to a target. A row left with no blocks at all is removed; an emptied column in a row that still
 * holds blocks stays as a drop zone (DragAndDrop.md §7). Returns false for a no-op or a missing target.
 */
export function moveBlockTo(d: FormDoc, blockId: string, t: Target): boolean {
  if (t.type === 'invalid' || t.type === 'section' || isNoopBlockMove(d, blockId, t)) return false;
  const w = whereIs(d, blockId);
  if (!w) return false;
  // A side drop on the block's own row while it is the only block of its column: the row keeps its column count.
  if (t.type === 'side' && t.blockId === blockId) return false;
  const [b] = w.column.blocks.splice(w.index, 1);
  let target = t;
  if (t.type === 'column' && t.columnId === w.column.id && t.index > w.index) target = { ...t, index: t.index - 1 };
  if (!insert(d, b!, target)) {
    w.column.blocks.splice(w.index, 0, b!); // put it back
    return false;
  }
  if (w.row.columns.every((c) => c.blocks.length === 0)) w.section.rows = w.section.rows.filter((r) => r.id !== w.row.id);
  return true;
}

/** Moves a row to a "new row" gap (rows only land in row gaps). Returns false for a no-op. */
export function moveRowTo(d: FormDoc, rowId: string, sectionId: string, index: number): boolean {
  const from = findRow(d, rowId);
  const to = d.sections.find((s) => s.id === sectionId);
  if (!from || !to) return false;
  let at = index;
  if (from.section === to) {
    if (at === from.index || at === from.index + 1) return false;
    if (at > from.index) at -= 1;
  }
  const [row] = from.section.rows.splice(from.index, 1);
  to.rows.splice(Math.max(0, Math.min(at, to.rows.length)), 0, row!);
  return true;
}

/** Moves a section before sections[index] (outline mode). Returns false for a no-op. */
export function moveSectionTo(d: FormDoc, sectionId: string, index: number): boolean {
  const from = d.sections.findIndex((s) => s.id === sectionId);
  if (from < 0 || index === from || index === from + 1) return false;
  const [s] = d.sections.splice(from, 1);
  d.sections.splice(index > from ? index - 1 : index, 0, s!);
  // The first section always starts page 1.
  d.sections[0]!.newPage = true;
  return true;
}

/**
 * Keyboard move of one step (Alt+arrows, or arrows while picked up). Up/down move within the column and on into the
 * row above or below (across sections); left/right change column in the same row. Returns false at an edge.
 */
export function nudgeBlock(d: FormDoc, blockId: string, dir: 'up' | 'down' | 'left' | 'right'): boolean {
  const w = whereIs(d, blockId);
  if (!w) return false;
  if (dir === 'left' || dir === 'right') {
    const ci = w.columnIndex + (dir === 'left' ? -1 : 1);
    const col = w.row.columns[ci];
    if (!col) return false;
    return moveBlockTo(d, blockId, { type: 'column', columnId: col.id, index: Math.min(w.index, col.blocks.length) });
  }
  const step = dir === 'up' ? -1 : 1;
  const to = w.index + step;
  if (to >= 0 && to < w.column.blocks.length) {
    return moveBlockTo(d, blockId, { type: 'column', columnId: w.column.id, index: dir === 'up' ? to : to + 1 });
  }
  // Leave the row: into the next row in document order, same column number where it exists.
  const rows = d.sections.flatMap((s) => s.rows);
  const ri = rows.indexOf(w.row);
  const next = rows[ri + step];
  if (!next) {
    // Already in the first or last row: a block that shares its row gets a row of its own above or below.
    if (w.row.columns.every((c) => c === w.column || c.blocks.length === 0) && w.column.blocks.length === 1) return false;
    return moveBlockTo(d, blockId, { type: 'newrow', sectionId: w.section.id, index: w.rowIndex + (dir === 'up' ? 0 : 1) });
  }
  const col = next.columns[Math.min(w.columnIndex, next.columns.length - 1)]!;
  return moveBlockTo(d, blockId, { type: 'column', columnId: col.id, index: dir === 'up' ? col.blocks.length : 0 });
}

/** Keyboard move of a row: up/down one place, into the next section at the ends. */
export function nudgeRow(d: FormDoc, rowId: string, dir: 'up' | 'down'): boolean {
  const from = findRow(d, rowId);
  if (!from) return false;
  const si = d.sections.indexOf(from.section);
  if (dir === 'up') {
    if (from.index > 0) return moveRowTo(d, rowId, from.section.id, from.index - 1);
    const prev = d.sections[si - 1];
    return prev ? moveRowTo(d, rowId, prev.id, prev.rows.length) : false;
  }
  if (from.index < from.section.rows.length - 1) return moveRowTo(d, rowId, from.section.id, from.index + 2);
  const next = d.sections[si + 1];
  return next ? moveRowTo(d, rowId, next.id, 0) : false;
}

/** Keyboard move of a section: up/down one place. */
export function nudgeSection(d: FormDoc, sectionId: string, dir: 'up' | 'down'): boolean {
  const i = d.sections.findIndex((s) => s.id === sectionId);
  return i >= 0 && moveSectionTo(d, sectionId, dir === 'up' ? i - 1 : i + 2);
}

/** "page 1, row 2, column 1" for announcements and toasts. Pages follow sections that start a new page. */
export function placeOf(d: FormDoc, blockId: string): string {
  const w = whereIs(d, blockId);
  if (!w) return '';
  const page = d.sections.slice(0, w.sectionIndex + 1).filter((s, i) => i === 0 || s.newPage).length;
  return `page ${page}, row ${w.rowIndex + 1}, column ${w.columnIndex + 1}`;
}

/**
 * A copy of a section right after it, with new ids throughout. Rules inside the copy that point at blocks of the
 * original point at the copied blocks instead; rules that point elsewhere stay as they are. Returns the copy's id.
 */
export function duplicateSection(d: FormDoc, sectionId: string): string | null {
  const i = d.sections.findIndex((s) => s.id === sectionId);
  if (i < 0) return null;
  const s = d.sections[i]!;
  const ids = new Map<string, string>([[s.id, uid()]]);
  for (const r of s.rows) {
    ids.set(r.id, uid());
    for (const c of r.columns) {
      ids.set(c.id, uid());
      for (const b of c.blocks) ids.set(b.id, uid());
    }
  }
  const copy: Section = JSON.parse(JSON.stringify(s), (k, v) => ((k === 'id' || k === 'q') && ids.has(v) ? ids.get(v) : v));
  if (copy.title?.trim()) copy.title = `${copy.title} (copy)`;
  d.sections.splice(i + 1, 0, copy);
  return copy.id;
}
