import { expect, test } from 'bun:test';
import type { Block, FormDoc } from '../../shared/schema';
import { addBlockAt, duplicateSection, isNoopBlockMove, moveBlockTo, moveRowTo, moveSectionTo, nudgeBlock, nudgeRow, placeOf } from './moves';

const b = (id: string): Block => ({ id, kind: 'short_text', label: id });
/** Page "s1": row r1 [c1: A, B | c2: C], row r2 [c3: D]. Page "s2": row r3 [c4: E]. */
const doc = (): FormDoc => ({
  title: 't', sections: [
    { id: 's1', rows: [
      { id: 'r1', columns: [{ id: 'c1', blocks: [b('A'), b('B')] }, { id: 'c2', blocks: [b('C')] }] },
      { id: 'r2', columns: [{ id: 'c3', blocks: [b('D')] }] },
    ] },
    { id: 's2', rows: [{ id: 'r3', columns: [{ id: 'c4', blocks: [b('E')] }] }] },
  ],
});
const layout = (d: FormDoc) => d.sections.map((s) => s.rows.map((r) => r.columns.map((c) => c.blocks.map((x) => x.id).join('')).join('|')).join(' / ')).join(' // ');

test('column drop: above, below, and within the same column', () => {
  const d = doc();
  expect(moveBlockTo(d, 'D', { type: 'column', columnId: 'c1', index: 1 })).toBe(true);
  expect(layout(d)).toBe('ADB|C // E'); // r2 lost its only block, so the row is gone
  expect(moveBlockTo(d, 'A', { type: 'column', columnId: 'c1', index: 3 })).toBe(true);
  expect(layout(d)).toBe('DBA|C // E');
});

test('dropping a block where it already is changes nothing', () => {
  const d = doc();
  for (const index of [0, 1]) {
    expect(isNoopBlockMove(d, 'A', { type: 'column', columnId: 'c1', index })).toBe(true);
    expect(moveBlockTo(d, 'A', { type: 'column', columnId: 'c1', index })).toBe(false);
  }
  expect(moveBlockTo(d, 'D', { type: 'newrow', sectionId: 's1', index: 1 })).toBe(false);
  expect(moveBlockTo(d, 'D', { type: 'newrow', sectionId: 's1', index: 2 })).toBe(false);
  expect(layout(d)).toBe('AB|C / D // E');
});

test('side drop makes a new column; an emptied column stays while the row holds blocks', () => {
  const d = doc();
  expect(moveBlockTo(d, 'C', { type: 'side', rowId: 'r1', blockId: 'A', side: 'left' })).toBe(true);
  expect(layout(d)).toBe('C|AB| / D // E');
  expect(moveBlockTo(d, 'E', { type: 'side', rowId: 'r1', blockId: 'A', side: 'right' })).toBe(true);
  expect(layout(d)).toBe('C|AB|E| / D // '); // E's row is removed, its section stays
  // The row now has 4 columns: no fifth.
  expect(moveBlockTo(d, 'D', { type: 'side', rowId: 'r1', blockId: 'C', side: 'left' })).toBe(false);
});

test('new row drop and new blocks from the palette', () => {
  const d = doc();
  expect(moveBlockTo(d, 'B', { type: 'newrow', sectionId: 's2', index: 1 })).toBe(true);
  expect(layout(d)).toBe('A|C / D // E / B');
  expect(addBlockAt(d, b('N'), { type: 'newrow', sectionId: 's1', index: 0 })).toBe(true);
  expect(addBlockAt(d, b('M'), { type: 'column', columnId: 'c3', index: 0 })).toBe(true);
  expect(layout(d)).toBe('N / A|C / MD // E / B');
});

test('rows and sections move; no-ops report false', () => {
  const d = doc();
  expect(moveRowTo(d, 'r1', 's1', 0)).toBe(false);
  expect(moveRowTo(d, 'r1', 's1', 2)).toBe(true);
  expect(layout(d)).toBe('D / AB|C // E');
  expect(moveRowTo(d, 'r3', 's1', 1)).toBe(true);
  expect(layout(d)).toBe('D / E / AB|C // ');
  expect(moveSectionTo(d, 's2', 0)).toBe(true);
  expect(d.sections.map((s) => s.id)).toEqual(['s2', 's1']);
  expect(moveSectionTo(d, 's2', 1)).toBe(false);
});

test('keyboard nudges: within a column, across rows and sections, and between columns', () => {
  const d = doc();
  expect(nudgeBlock(d, 'A', 'down')).toBe(true);
  expect(layout(d)).toBe('BA|C / D // E');
  expect(nudgeBlock(d, 'A', 'down')).toBe(true); // into the next row
  expect(layout(d)).toBe('B|C / AD // E');
  expect(nudgeBlock(d, 'C', 'left')).toBe(true); // keeps its position number in the new column
  expect(layout(d)).toBe('CB| / AD // E');
  expect(nudgeBlock(d, 'E', 'down')).toBe(false); // alone in the last row
  expect(nudgeRow(d, 'r3', 'up')).toBe(true); // into the end of the previous section
  expect(layout(d)).toBe('CB| / AD / E // ');
  expect(placeOf(d, 'E')).toBe('page 1, row 3, column 1');
});

test('a duplicated section gets new ids, sits after the original, and its rules point at its own blocks', () => {
  const d = doc();
  d.sections[0]!.title = 'Visit';
  d.sections[0]!.rows[1]!.columns[0]!.blocks[0]!.showIf = { match: 'all', conditions: [{ q: 'A', op: 'answered' as never }, { q: 'E', op: 'answered' as never }] };
  const id = duplicateSection(d, 's1')!;
  expect(d.sections.map((s) => s.id)).toEqual(['s1', id, 's2']);
  const copy = d.sections[1]!;
  expect(copy.title).toBe('Visit (copy)');
  const all = JSON.stringify(d.sections[0]);
  for (const r of copy.rows) for (const c of r.columns) for (const x of c.blocks) expect(all).not.toContain(`"${x.id}"`);
  const rule = copy.rows[1]!.columns[0]!.blocks[0]!.showIf!.conditions;
  expect(rule[0]!.q).toBe(copy.rows[0]!.columns[0]!.blocks[0]!.id); // A's copy
  expect(rule[1]!.q).toBe('E'); // outside the section: unchanged
  expect(duplicateSection(d, 'nope')).toBe(null);
});
