// Conditional visibility, pages and answer checks.
// The browser and the server use the same code, so the server never trusts the browser.
import { blocksOf, isQuestion, KIND_LABELS, optionsOf, otherLabelOf, type Answer, type Answers, type Block, type Condition, type FormDoc, type Op, type Rule, type Section } from './schema';

const isEmpty = (a: unknown) => a === undefined || a === null || a === '' || (Array.isArray(a) && a.length === 0);

export function testCondition(c: Condition, a: Answer | undefined): boolean {
  const v = String(c.value ?? '');
  switch (c.op) {
    case 'answered': return !isEmpty(a);
    case 'not_answered': return isEmpty(a);
    case 'equals': return Array.isArray(a) ? a.includes(v) : !isEmpty(a) && String(a) === v;
    case 'not_equals': return !testCondition({ ...c, op: 'equals' }, a);
    case 'contains': return Array.isArray(a) ? a.includes(v) : typeof a === 'string' && a.toLowerCase().includes(v.toLowerCase());
    case 'gt': return typeof a === 'number' && a > Number(c.value);
    case 'lt': return typeof a === 'number' && a < Number(c.value);
  }
}

function ruleOk(rule: Rule | undefined, known: Answers): boolean {
  if (!rule || rule.conditions.length === 0) return true;
  const results = rule.conditions.map((c) => testCondition(c, known[c.q]));
  return rule.match === 'any' ? results.some(Boolean) : results.every(Boolean);
}

/**
 * Ids of the visible sections and blocks.
 * Rules see only answers to visible questions that come earlier in the form.
 * A rule that points to a later question sees it as unanswered, so rules can never loop.
 */
export function visibleIds(doc: FormDoc, answers: Answers): Set<string> {
  const visible = new Set<string>();
  const known: Answers = {};
  for (const section of doc.sections) {
    const sectionOk = ruleOk(section.showIf, known);
    if (sectionOk) visible.add(section.id);
    for (const row of section.rows)
      for (const column of row.columns)
        for (const block of column.blocks) {
          if (!sectionOk || !ruleOk(block.showIf, known)) continue;
          visible.add(block.id);
          if (isQuestion(block) && !isEmpty(answers[block.id])) known[block.id] = answers[block.id]!;
        }
  }
  return visible;
}

/** Splits the form into pages: every section is its own page. */
export const pagesOf = (doc: FormDoc): Section[][] => doc.sections.map((s) => [s]);

/** Pages with hidden sections removed. A page with no visible section is skipped. */
export const visiblePages = (doc: FormDoc, visible: Set<string>) =>
  pagesOf(doc).map((p) => p.filter((s) => visible.has(s.id))).filter((p) => p.length > 0);

const LIMITS: Partial<Record<Block['kind'], number>> = { short_text: 500, email: 320, long_text: 10000 };

/** Text typed under "Other": trimmed, at most 500 characters. */
function otherText(v: string): string | undefined | null {
  const t = v.trim();
  return !t ? undefined : t.length > 500 ? null : t;
}

/** Returns the cleaned value, undefined for "no answer", or null for an invalid value. */
function cleanValue(b: Block, v: unknown): Answer | undefined | null {
  if (isEmpty(v)) return undefined;
  const opts = optionsOf(b);
  switch (b.kind) {
    case 'short_text': case 'long_text': case 'email': {
      if (typeof v !== 'string') return null;
      const s = v.trim();
      if (!s) return undefined;
      if (s.length > LIMITS[b.kind]!) return null;
      if (b.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
      return s;
    }
    case 'number': return typeof v === 'number' && Number.isFinite(v) ? v : null;
    case 'single_choice': case 'dropdown': case 'yes_no':
      if (typeof v !== 'string') return null;
      if (opts.includes(v)) return v;
      // With "Other" on, any other text is the person's own answer.
      return b.other && b.kind === 'single_choice' ? otherText(v) : null;
    case 'multi_choice': {
      if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return null;
      const known = [...new Set((v as string[]).filter((x) => opts.includes(x)))];
      const extra = (v as string[]).filter((x) => !opts.includes(x));
      if (extra.length > (b.other ? 1 : 0)) return null;
      const typed = extra.length ? otherText(extra[0]!) : undefined;
      if (typed === null) return null;
      const all = typed ? [...known, typed] : known;
      return all.length ? all : undefined;
    }
    case 'rating': return Number.isInteger(v) && (v as number) >= 1 && (v as number) <= (b.max ?? 5) ? (v as number) : null;
    case 'scale': return Number.isInteger(v) && (v as number) >= (b.min ?? 1) && (v as number) <= (b.max ?? 10) ? (v as number) : null;
    case 'date': return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null;
    default: return undefined;
  }
}

// Error messages say what to do (design system voice), never "Invalid input".
export function requiredMessage(b: Block): string {
  switch (b.kind) {
    case 'single_choice': return b.other ? `Choose an option, or choose "${otherLabelOf(b)}" and type your answer.` : 'Choose an option.';
    case 'dropdown': case 'yes_no': return 'Choose an option.';
    case 'multi_choice': return b.other ? `Choose at least one option, or choose "${otherLabelOf(b)}" and type your answer.` : 'Choose at least one option.';
    case 'rating': return `Choose a rating from 1 to ${b.max ?? 5}.`;
    case 'scale': return `Pick a number from ${b.min ?? 1} to ${b.max ?? 10}.`;
    case 'date': return 'Enter a date.';
    case 'email': return 'Enter an email like name@example.com';
    case 'number': return 'Enter a number.';
    default: return 'Answer this question.';
  }
}
function invalidMessage(b: Block): string {
  switch (b.kind) {
    case 'email': return 'Enter an email like name@example.com';
    case 'number': return 'Enter a number, for example 4.';
    case 'date': return 'Enter a date like 2026-11-20.';
    case 'short_text': return 'Keep the answer under 500 characters.';
    case 'long_text': return 'Keep the answer under 10,000 characters.';
    default: return requiredMessage(b);
  }
}

export type CheckResult = { ok: true; answers: Answers } | { ok: false; errors: Record<string, string> };

/**
 * Checks answers against the form. Answers to hidden questions are dropped.
 * Visible required questions must have an answer.
 */
export function checkAnswers(doc: FormDoc, raw: unknown): CheckResult {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, errors: { _form: 'Invalid answers.' } };
  const input = raw as Record<string, unknown>;
  const clean: Answers = {};
  const invalid = new Set<string>();
  for (const { block } of blocksOf(doc)) {
    if (!isQuestion(block)) continue;
    const v = cleanValue(block, input[block.id]);
    if (v === null) invalid.add(block.id);
    else if (v !== undefined) clean[block.id] = v;
  }
  const visible = visibleIds(doc, clean);
  const answers: Answers = {};
  const errors: Record<string, string> = {};
  for (const { block } of blocksOf(doc)) {
    if (!isQuestion(block) || !visible.has(block.id)) continue;
    if (invalid.has(block.id)) errors[block.id] = invalidMessage(block);
    else if (clean[block.id] !== undefined) answers[block.id] = clean[block.id]!;
    else if (block.required) errors[block.id] = requiredMessage(block);
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, answers };
}

/** Questions that come before `targetId` in document order. Rules may point only to these. */
export function questionsBefore(doc: FormDoc, targetId: string): Block[] {
  const out: Block[] = [];
  for (const section of doc.sections) {
    if (section.id === targetId) return out;
    for (const row of section.rows)
      for (const column of row.columns)
        for (const block of column.blocks) {
          if (block.id === targetId) return out;
          if (isQuestion(block)) out.push(block);
        }
  }
  return out;
}

/** The words for each condition operator, as the owner reads them. */
export const OP_LABELS: Record<Op, string> = {
  equals: 'is', not_equals: 'is not', contains: 'contains', answered: 'is not empty',
  not_answered: 'is empty', gt: 'is more than', lt: 'is less than',
};

/** One line for a rule, for example: If "Did you like it?" is "Yes" and "Score" is more than 3. */
export function ruleText(rule: Rule, doc: FormDoc): string {
  const name = (id: string) => {
    for (const { block } of blocksOf(doc)) if (block.id === id) return `"${block.label?.trim() || KIND_LABELS[block.kind]}"`;
    return 'a deleted question';
  };
  const one = (c: Condition) => `${name(c.q)} ${OP_LABELS[c.op]}${c.op === 'answered' || c.op === 'not_answered' ? '' : ` "${c.value ?? ''}"`}`;
  return `If ${rule.conditions.map(one).join(rule.match === 'any' ? ' or ' : ' and ')}`;
}

/** Adds a condition to a rule, or starts a rule with it. The same condition twice is not added again. */
export function withCondition(rule: Rule | undefined, c: Condition): Rule {
  if (!rule) return { match: 'all', conditions: [c] };
  if (rule.conditions.some((x) => x.q === c.q && x.op === c.op && x.value === c.value)) return rule;
  return { ...rule, conditions: [...rule.conditions, c] };
}

/** True if the block or section `targetId` may use question `qId` in its rule: the question must come before it. */
export const canUseQuestion = (doc: FormDoc, targetId: string, qId: string) => questionsBefore(doc, targetId).some((q) => q.id === qId);
