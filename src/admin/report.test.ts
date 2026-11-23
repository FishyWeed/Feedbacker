import { expect, test } from 'bun:test';
import type { FormDoc } from '../../shared/schema';
import { columnValues, DATE_COL, headerCycle, headerToView, nextHeader, summarize, toCsv, viewRows, type ActiveHeader, type Resp, type TableView } from './report';

const doc: FormDoc = {
  title: 'T',
  sections: [{ id: 's', newPage: true, rows: [{ id: 'r', columns: [{ id: 'c', blocks: [
    { id: 'food', kind: 'single_choice', label: 'Food', options: ['Chicken', 'Beef'] },
    { id: 'tags', kind: 'multi_choice', label: 'Tags', options: ['A', 'B'] },
    { id: 'stars', kind: 'rating', label: 'Stars', max: 5 },
    { id: 'note', kind: 'long_text', label: 'Note, "quoted"' },
  ] }] }] }],
};
const resp = (answers: Resp['answers'], i = 0): Resp => ({ id: i, answers, createdAt: Date.UTC(2026, 10, 22, 10, i) });
const responses = [
  resp({ food: 'Chicken', tags: ['A', 'B'], stars: 5, note: '=HYPERLINK("x")' }, 1),
  resp({ food: 'Chicken', tags: ['A'], stars: 3 }, 2),
  resp({ food: 'Goat', stars: 4, note: 'line1\nline2' }, 3),
  resp({}, 4),
];
const [food, tags, stars, note] = doc.sections[0]!.rows[0]!.columns[0]!.blocks;

test('choice summary counts and percentages, including removed options', () => {
  expect(summarize(food!, responses)).toEqual({
    type: 'choice', answered: 3, multi: false, others: [],
    bars: [{ label: 'Chicken', count: 2, pct: 66.7 }, { label: 'Beef', count: 0, pct: 0 }, { label: 'Goat', count: 1, pct: 33.3 }],
  });
  // With "Other" on, a typed answer counts under the Other label and is listed.
  const withOther = summarize({ ...food!, other: true, otherLabel: 'Something else' }, responses);
  expect(withOther.type === 'choice' && [withOther.bars.map((b) => [b.label, b.count]), withOther.others.map((o) => o.text)])
    .toEqual([[['Chicken', 2], ['Beef', 0], ['Something else', 1]], ['Goat']]);
  const t = summarize(tags!, responses);
  expect(t.type === 'choice' && t.bars).toEqual([{ label: 'A', count: 2, pct: 100 }, { label: 'B', count: 1, pct: 50 }]);
});

test('rating summary has an average and a bar per value', () => {
  const s = summarize(stars!, responses);
  expect(s.type === 'scale' && [s.avg, s.answered, s.bars.map((b) => b.count)]).toEqual([4, 3, [0, 0, 1, 1, 1]]);
});

test('CSV escapes quotes, commas, new lines and formulas', () => {
  const lines = toCsv(doc, responses).replace('﻿', '').split('\r\n');
  expect(lines[0]).toBe('Submitted,Food,Tags,Stars,"Note, ""quoted"""');
  expect(lines[1]).toBe(`2026-11-22T10:01:00.000Z,Chicken,A; B,5,"'=HYPERLINK(""x"")"`);
  expect(lines[3]).toBe('2026-11-22T10:03:00.000Z,Goat,,4,"line1\nline2"');
  const n = summarize(note!, responses);
  expect(n.type === 'text' && n.values.map((v) => v.text)).toEqual(['=HYPERLINK("x")', 'line1\nline2']);
});

test('table view: filter by values or answered, sort with empty answers last', () => {
  const qs = doc.sections[0]!.rows[0]!.columns[0]!.blocks;
  expect(columnValues(food!, responses)).toEqual(['Chicken', 'Goat']);
  const ids = (v: TableView) => viewRows(responses, qs, v).map((r) => r.id);
  expect(ids({ sort: null, filters: { food: { values: ['Chicken'] } } })).toEqual([1, 2]);
  expect(ids({ sort: null, filters: { tags: { values: ['B'] } } })).toEqual([1]);
  expect(ids({ sort: null, filters: { note: { answered: 'no' } } })).toEqual([2, 4]);
  expect(ids({ sort: { col: 'stars', dir: 'asc' }, filters: {} })).toEqual([2, 3, 1, 4]);
  expect(ids({ sort: { col: 'stars', dir: 'desc' }, filters: {} })).toEqual([1, 3, 2, 4]);
  expect(ids({ sort: { col: DATE_COL, dir: 'desc' }, filters: {} })).toEqual([4, 3, 2, 1]);
});

test('header clicks cycle one column at a time', () => {
  const cycle = headerCycle('food', food!, responses);
  expect(cycle.map((s) => (s.kind === 'value' ? s.value : s.kind))).toEqual(['asc', 'desc', 'Chicken', 'Goat', 'answered', 'empty']);
  let a: ActiveHeader = null;
  a = nextHeader(a, 'food', cycle);
  expect(a).toEqual({ col: 'food', state: { kind: 'asc' } });
  a = nextHeader(a, 'food', cycle);
  a = nextHeader(a, 'food', cycle);
  expect(headerToView(a)).toEqual({ sort: null, filters: { food: { values: ['Chicken'] } } });
  // Another column replaces the active one.
  a = nextHeader(a, 'stars', headerCycle('stars', stars!, responses));
  expect(a).toEqual({ col: 'stars', state: { kind: 'asc' } });
  // After the last state the column switches off.
  let b: ActiveHeader = { col: 'food', state: { kind: 'empty' } };
  expect(nextHeader(b, 'food', cycle)).toBeNull();
  expect(headerCycle(DATE_COL, undefined, responses).length).toBe(2);
});
