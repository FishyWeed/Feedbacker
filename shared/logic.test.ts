import { expect, test } from 'bun:test';
import { canUseQuestion, checkAnswers, pagesOf, questionsBefore, ruleText, visibleIds, visiblePages, withCondition } from './logic';
import { parseFormDoc, type Block, type FormDoc } from './schema';

const q = (id: string, kind: Block['kind'], extra: Partial<Block> = {}): Block => ({ id, kind, label: id, ...extra });
const sec = (id: string, blocks: Block[], extra = {}) => ({ id, rows: [{ id: `r${id}`, columns: [{ id: `c${id}`, blocks }] }], ...extra });

const doc: FormDoc = {
  title: 'Test',
  sections: [
    sec('s1', [q('likes', 'yes_no', { required: true }), q('why', 'long_text', { required: true, showIf: { match: 'all', conditions: [{ q: 'likes', op: 'equals', value: 'Yes' }] } })]),
    sec('s2', [q('score', 'rating', { max: 5 })], { showIf: { match: 'all', conditions: [{ q: 'likes', op: 'equals', value: 'No' }] } }),
    sec('s3', [q('email', 'email')]),
  ],
};

test('rules show and hide blocks and sections', () => {
  expect(visibleIds(doc, { likes: 'Yes' }).has('why')).toBe(true);
  expect(visibleIds(doc, { likes: 'Yes' }).has('s2')).toBe(false);
  expect(visibleIds(doc, { likes: 'No' }).has('why')).toBe(false);
  expect(visibleIds(doc, { likes: 'No' }).has('s2')).toBe(true);
});

test('a rule that points to a later question sees no answer', () => {
  const d: FormDoc = { title: 't', sections: [sec('a', [q('x', 'short_text', { showIf: { match: 'all', conditions: [{ q: 'y', op: 'answered' }] } }), q('y', 'short_text')])] };
  expect(visibleIds(d, { y: 'hi' }).has('x')).toBe(false);
});

test('pages skip hidden sections', () => {
  expect(pagesOf(doc).length).toBe(3);
  expect(visiblePages(doc, visibleIds(doc, { likes: 'Yes' })).length).toBe(2);
});

test('required visible questions must be answered; hidden answers are dropped', () => {
  const r1 = checkAnswers(doc, { likes: 'Yes' });
  expect(r1.ok).toBe(false);
  if (!r1.ok) expect(Object.keys(r1.errors)).toEqual(['why']);
  const r2 = checkAnswers(doc, { likes: 'No', why: 'secret', score: 4 });
  expect(r2).toEqual({ ok: true, answers: { likes: 'No', score: 4 } });
});

test('invalid values are rejected', () => {
  const r = checkAnswers(doc, { likes: 'Maybe', email: 'not-an-email' });
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors).toEqual({ likes: 'Choose an option.', email: 'Enter an email like name@example.com' });
  expect(checkAnswers(doc, { likes: 'No', score: 9 }).ok).toBe(false);
  expect(checkAnswers(doc, 'nope').ok).toBe(false);
});

test('questionsBefore lists only earlier questions', () => {
  expect(questionsBefore(doc, 'why').map((b) => b.id)).toEqual(['likes']);
  expect(questionsBefore(doc, 's3').map((b) => b.id)).toEqual(['likes', 'why', 'score']);
});

test('parseFormDoc rejects bad shapes and duplicate ids', () => {
  expect(parseFormDoc(doc)?.sections.length).toBe(3);
  expect(parseFormDoc({ title: 'x', sections: [{ id: 'a', rows: [{ id: 'b', columns: [] }] }] })).toBeNull();
  expect(parseFormDoc({ title: 'x', sections: [sec('a', [q('a', 'date')])] })).toBeNull();
  expect(parseFormDoc({ title: 'x', sections: [sec('a', [{ id: 'z', kind: 'evil' as any }])] })).toBeNull();
});

test('"Other" accepts a typed answer only when it is on', () => {
  const pick = (other: boolean, kind: Block['kind']): FormDoc => ({ title: 't', sections: [sec('s', [q('x', kind, { options: ['A', 'B'], other, required: true })])] });
  expect(checkAnswers(pick(false, 'single_choice'), { x: 'Pizza' }).ok).toBe(false);
  expect(checkAnswers(pick(true, 'single_choice'), { x: '  Pizza ' })).toEqual({ ok: true, answers: { x: 'Pizza' } });
  expect(checkAnswers(pick(true, 'multi_choice'), { x: ['A', 'Pizza'] })).toEqual({ ok: true, answers: { x: ['A', 'Pizza'] } });
  expect(checkAnswers(pick(true, 'multi_choice'), { x: ['Pizza', 'Pasta'] }).ok).toBe(false); // only one typed answer
  expect(checkAnswers(pick(true, 'single_choice'), { x: 'x'.repeat(501) }).ok).toBe(false);
  const r = checkAnswers(pick(true, 'single_choice'), { x: '   ' });
  expect(r.ok === false && r.errors.x).toBe('Choose an option, or choose "Other" and type your answer.');
});

test('ruleText: one readable line for a rule; a deleted question says so', () => {
  const d = doc;
  expect(ruleText({ match: 'all', conditions: [{ q: 'likes', op: 'equals', value: 'Yes' }] }, d)).toBe('If "likes" is "Yes"');
  expect(ruleText({ match: 'any', conditions: [{ q: 'likes', op: 'answered' }, { q: 'gone', op: 'gt', value: 3 }] }, d))
    .toBe('If "likes" is not empty or a deleted question is more than "3"');
});

test('parseFormDoc keeps a valid blueprint position, rounds and clamps it, and drops a bad one', () => {
  const base = { title: 't', sections: [{ id: 's1', rows: [{ id: 'r1', columns: [{ id: 'c1', blocks: [] }] }] }] };
  const at = (pos: unknown) => parseFormDoc({ ...base, sections: [{ ...base.sections[0], pos }] })!.sections[0]!.pos;
  expect(at({ x: 120.6, y: 40 })).toEqual({ x: 121, y: 40 });
  expect(at({ x: -5, y: 1e9 })).toEqual({ x: -5, y: 20000 }); // the board has no edge, so negatives are fine
  expect(at({ x: 'a', y: 1 })).toBeUndefined();
  expect(at(undefined)).toBeUndefined();
});

test('withCondition starts or extends a rule, without duplicates; canUseQuestion needs the question to come first', () => {
  const c = { q: 'likes', op: 'equals' as const, value: 'Yes' };
  const r = withCondition(undefined, c);
  expect(r).toEqual({ match: 'all', conditions: [c] });
  expect(withCondition(r, { ...c })).toBe(r);
  expect(withCondition({ match: 'any', conditions: [c] }, { q: 'likes', op: 'answered' }).conditions.length).toBe(2);
  expect(canUseQuestion(doc, 's2', 'likes')).toBe(true); // a later page
  expect(canUseQuestion(doc, 'why', 'likes')).toBe(true); // a later block on the same page
  expect(canUseQuestion(doc, 'likes', 'likes')).toBe(false); // itself
  expect(canUseQuestion(doc, 's1', 'likes')).toBe(false); // its own page
});

test('parseFormDoc keeps blueprint sizes and line bends, clamped, and drops bad ones', () => {
  const doc = (section: object, block: object) => parseFormDoc({ title: 't', sections: [{ id: 's1', rows: [{ id: 'r1', columns: [{ id: 'c1', blocks: [{ id: 'b1', kind: 'short_text', ...block }] }] }], ...section }] })!;
  expect(doc({ size: { w: 50, h: 9000 } }, {}).sections[0]!.size).toEqual({ w: 200, h: 4000 });
  expect(doc({ size: { w: 'x', h: 1 } }, {}).sections[0]!.size).toBeUndefined();
  const box = (size: unknown) => doc({}, { size }).sections[0]!.rows[0]!.columns[0]!.blocks[0]!.size;
  expect(box({ w: 10, h: 33.6 })).toEqual({ w: 80, h: 34 });
  expect(box({ w: 300 })).toBeUndefined();
  const b = doc({}, { bends: { q1: { x: 10.4, y: -20 }, 'bad id!': { x: 1, y: 1 }, q2: 'nope' } }).sections[0]!.rows[0]!.columns[0]!.blocks[0]!;
  expect(b.bends).toEqual({ q1: { x: 10, y: -20 } });
});
