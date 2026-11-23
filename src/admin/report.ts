// Response summaries (counts, percentages, averages) and CSV export. Pure functions, no UI.
import { blocksOf, isQuestion, optionsOf, otherLabelOf, type Answer, type Block, type FormDoc } from '../../shared/schema';

export type Resp = { id: number; answers: Record<string, Answer>; createdAt: number };
export type Bar = { label: string; count: number; pct: number };
export type TextAnswer = { text: string; at: number };
export type Summary =
  | { type: 'choice'; answered: number; multi: boolean; bars: Bar[]; others: TextAnswer[] }
  | { type: 'scale'; answered: number; avg: number | null; min: number | null; max: number | null; top: number; bars: Bar[] }
  | { type: 'number'; answered: number; avg: number | null; min: number | null; max: number | null }
  | { type: 'text'; answered: number; values: TextAnswer[] };

export const questionsOf = (doc: FormDoc) => [...blocksOf(doc)].map((x) => x.block).filter(isQuestion);

const has = (v: Answer | undefined): v is Answer => v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
const round1 = (n: number) => Math.round(n * 10) / 10;
const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

export function summarize(q: Block, responses: Resp[]): Summary {
  const withTime = responses.filter((r) => has(r.answers[q.id]));
  const vals = withTime.map((r) => r.answers[q.id]!);
  const answered = vals.length;
  const bars = (labels: string[], count: (label: string) => number): Bar[] =>
    labels.map((label) => {
      const c = count(label);
      return { label, count: c, pct: answered ? round1((c / answered) * 100) : 0 };
    });

  switch (q.kind) {
    case 'single_choice': case 'dropdown': case 'yes_no': case 'multi_choice': {
      const opts = optionsOf(q);
      const asList = (v: Answer) => (Array.isArray(v) ? v : [String(v)]);
      // With an "Other" option, typed answers count under its label and are listed below the bars.
      const others: TextAnswer[] = q.other
        ? withTime.flatMap((r) => asList(r.answers[q.id]!).filter((x) => !opts.includes(x)).map((text) => ({ text, at: r.createdAt })))
        : [];
      const picked = withTime.flatMap((r) => asList(r.answers[q.id]!).map((x) => (q.other && !opts.includes(x) ? otherLabelOf(q) : x)));
      // Answers to options that were renamed or removed later still count.
      const labels = [...new Set([...opts, ...(q.other ? [otherLabelOf(q)] : []), ...picked])];
      return { type: 'choice', answered, multi: q.kind === 'multi_choice', bars: bars(labels, (l) => picked.filter((p) => p === l).length), others };
    }
    case 'rating': case 'scale': {
      const nums = vals.filter((v): v is number => typeof v === 'number');
      const from = q.kind === 'rating' ? 1 : (q.min ?? 1);
      const top = q.max ?? (q.kind === 'rating' ? 5 : 10);
      return {
        type: 'scale', answered, top,
        avg: nums.length ? round1(nums.reduce((a, b) => a + b, 0) / nums.length) : null,
        min: nums.length ? Math.min(...nums) : null,
        max: nums.length ? Math.max(...nums) : null,
        bars: bars(range(from, top).map(String), (l) => nums.filter((n) => n === Number(l)).length),
      };
    }
    case 'number': {
      const nums = vals.filter((v): v is number => typeof v === 'number');
      return {
        type: 'number', answered,
        avg: nums.length ? round1(nums.reduce((a, b) => a + b, 0) / nums.length) : null,
        min: nums.length ? Math.min(...nums) : null,
        max: nums.length ? Math.max(...nums) : null,
      };
    }
    default:
      return { type: 'text', answered, values: withTime.map((r) => ({ text: String(r.answers[q.id]), at: r.createdAt })) };
  }
}

/** One CSV cell. Text that starts with = + - @ gets a leading ' so spreadsheet apps do not run it as a formula. */
function cell(v: unknown): string {
  if (v === undefined || v === null) return '';
  let s = Array.isArray(v) ? v.join('; ') : String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** CSV with one row per response. The BOM makes Excel read UTF-8 correctly. */
export function toCsv(doc: FormDoc, responses: Resp[]): string {
  const qs = questionsOf(doc);
  const rows = [
    ['Submitted', ...qs.map((q) => q.label || 'Untitled question')],
    ...responses.map((r) => [new Date(r.createdAt).toISOString(), ...qs.map((q) => r.answers[q.id])]),
  ];
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n');
}

// --- Table: sort and filter by column ---

export const DATE_COL = '_date';
export type ColumnFilter = { values?: string[]; answered?: 'yes' | 'no' };
export type TableView = { sort: { col: string; dir: 'asc' | 'desc' } | null; filters: Record<string, ColumnFilter> };

const asList = (a: Answer | undefined): string[] => (a === undefined || a === '' ? [] : Array.isArray(a) ? a : [String(a)]);
const NUMERIC = ['number', 'rating', 'scale'];

/** Distinct answers in a column, for the "Show only" list: options first in form order, then anything else seen. */
export function columnValues(q: Block, responses: Resp[]): string[] {
  const seen = new Set(responses.flatMap((r) => asList(r.answers[q.id])));
  const known = ['single_choice', 'multi_choice', 'dropdown', 'yes_no'].includes(q.kind) ? optionsOf(q).filter((o) => seen.has(o)) : [];
  const rest = [...seen].filter((v) => !known.includes(v));
  rest.sort(NUMERIC.includes(q.kind) ? (a, b) => Number(a) - Number(b) : (a, b) => a.localeCompare(b));
  return [...known, ...rest];
}

/** Applies column filters (all must match), then the sort. Empty answers always sort last. */
export function viewRows(responses: Resp[], questions: Block[], view: TableView): Resp[] {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const rows = responses.filter((r) =>
    Object.entries(view.filters).every(([col, f]) => {
      const vals = asList(r.answers[col]);
      if (f.answered === 'yes' && !vals.length) return false;
      if (f.answered === 'no' && vals.length) return false;
      if (f.values?.length && !vals.some((v) => f.values!.includes(v))) return false;
      return true;
    }),
  );
  const s = view.sort;
  if (!s) return rows;
  const q = byId.get(s.col);
  const dir = s.dir === 'asc' ? 1 : -1;
  const key = (r: Resp): string | number | null => {
    if (s.col === DATE_COL) return r.createdAt;
    const v = asList(r.answers[s.col]);
    if (!v.length) return null;
    return q && NUMERIC.includes(q.kind) ? Number(v[0]) : v.join(', ').toLowerCase();
  };
  return [...rows].sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir;
  });
}

// --- Header click cycle: each click moves one column to its next state; only one column is active at a time ---

export type HeaderState =
  | { kind: 'asc' } | { kind: 'desc' } | { kind: 'value'; value: string } | { kind: 'answered' } | { kind: 'empty' };
export type ActiveHeader = { col: string; state: HeaderState } | null;

/** The states one column cycles through, before it switches off again. */
export function headerCycle(col: string, q: Block | undefined, responses: Resp[]): HeaderState[] {
  const states: HeaderState[] = [{ kind: 'asc' }, { kind: 'desc' }];
  if (col === DATE_COL || !q) return states;
  // Choice-like columns with a few distinct answers also cycle through "only this answer".
  const few = ['single_choice', 'multi_choice', 'dropdown', 'yes_no', 'rating', 'scale'].includes(q.kind) ? columnValues(q, responses) : [];
  if (few.length > 1 && few.length <= 8) for (const value of few) states.push({ kind: 'value', value });
  states.push({ kind: 'answered' }, { kind: 'empty' });
  return states;
}

/** Next state after a click: a new column starts its cycle (and replaces the old one); the last state switches off. */
export function nextHeader(current: ActiveHeader, col: string, cycle: HeaderState[]): ActiveHeader {
  if (current?.col !== col) return { col, state: cycle[0]! };
  const i = cycle.findIndex((s) => JSON.stringify(s) === JSON.stringify(current.state));
  return i < 0 || i === cycle.length - 1 ? null : { col, state: cycle[i + 1]! };
}

export function headerToView(a: ActiveHeader): TableView {
  if (!a) return { sort: null, filters: {} };
  const s = a.state;
  if (s.kind === 'asc' || s.kind === 'desc') return { sort: { col: a.col, dir: s.kind }, filters: {} };
  if (s.kind === 'value') return { sort: null, filters: { [a.col]: { values: [s.value] } } };
  return { sort: null, filters: { [a.col]: { answered: s.kind === 'answered' ? 'yes' : 'no' } } };
}
