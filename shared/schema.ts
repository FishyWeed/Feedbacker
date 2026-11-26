import { parseQr, type QrDesign } from './qr';
import { parseTypography, type FormTypography } from './typography';
import { parseBackground, parseTheme, type FormBackground, type FormTheme } from './themes';

// Form document shape. One FormDoc is saved as JSON in the `forms` table.
// Layout: sections > rows > 1-4 columns > blocks.

export const QUESTION_KINDS = [
  'short_text', 'long_text', 'email', 'number', 'single_choice', 'multi_choice',
  'dropdown', 'rating', 'scale', 'yes_no', 'date',
] as const;
export const CONTENT_KINDS = ['heading', 'paragraph', 'image', 'divider', 'button'] as const;

export type QuestionKind = (typeof QUESTION_KINDS)[number];
export type ContentKind = (typeof CONTENT_KINDS)[number];
export type BlockKind = QuestionKind | ContentKind;

export const KIND_LABELS: Record<BlockKind, string> = {
  short_text: 'Short text', long_text: 'Long text', email: 'Email', number: 'Number',
  single_choice: 'Single choice', multi_choice: 'Multiple choice', dropdown: 'Dropdown',
  rating: 'Rating', scale: 'Scale', yes_no: 'Yes / No', date: 'Date',
  heading: 'Heading', paragraph: 'Paragraph', image: 'Image', divider: 'Divider', button: 'Button',
};

export const OPS = ['equals', 'not_equals', 'contains', 'answered', 'not_answered', 'gt', 'lt'] as const;
export type Op = (typeof OPS)[number];
export type Condition = { q: string; op: Op; value?: string | number };
export type Rule = { match: 'all' | 'any'; conditions: Condition[] };

export type ButtonAction = 'next' | 'back' | 'submit' | 'link';

export type Block = {
  id: string;
  kind: BlockKind;
  showIf?: Rule;
  label?: string; // question label, heading text, button label, image alt text
  text?: string; // help text under a question, paragraph text
  required?: boolean;
  placeholder?: string;
  options?: string[]; // single_choice, multi_choice, dropdown
  other?: boolean; // single_choice, multi_choice: an extra option where people type their own answer
  otherLabel?: string; // its label, "Other" by default
  min?: number; // scale
  max?: number; // scale, rating
  url?: string; // image src, link button href
  action?: ButtonAction;
  /** Blueprint view only: how far the middle of the condition line from question `id` to this block is moved. */
  bends?: Record<string, { x: number; y: number }>;
  /** Blueprint view only: the width and minimum height of this block's box. */
  size?: { w: number; h: number };
};
export type Column = { id: string; blocks: Block[] };
export type Row = { id: string; columns: Column[] };
/**
 * A section is one page of the form. Blueprint view only (owner, never shown to visitors): `pos` is where its node
 * sits, `bend` moves the middle of the line that leads into it, `size` is its width and minimum height.
 */
export type Section = { id: string; title?: string; showIf?: Rule; rows: Row[]; pos?: { x: number; y: number }; bend?: { x: number; y: number }; size?: { w: number; h: number } };
export type FormDoc = {
  title: string; description?: string; thankYou?: string; sections: Section[];
  theme?: FormTheme; background?: FormBackground; qr?: QrDesign; typography?: FormTypography;
};

export type Answer = string | number | string[];
export type Answers = Record<string, Answer>;

export const MAX_COLUMNS = 4;
export const YES_NO = ['Yes', 'No'];

export const isQuestion = (b: Block) => (QUESTION_KINDS as readonly string[]).includes(b.kind);
export const optionsOf = (b: Block) => (b.kind === 'yes_no' ? YES_NO : (b.options ?? []));
export const otherLabelOf = (b: Block) => b.otherLabel?.trim() || 'Other';

export const uid = () => crypto.randomUUID().replaceAll('-', '').slice(0, 12);

export function newBlock(kind: BlockKind): Block {
  const b: Block = { id: uid(), kind };
  if (isQuestion(b)) b.label = 'Untitled question';
  if (kind === 'single_choice' || kind === 'multi_choice' || kind === 'dropdown') b.options = ['Option 1', 'Option 2'];
  if (kind === 'rating') b.max = 5;
  if (kind === 'scale') Object.assign(b, { min: 1, max: 10 });
  if (kind === 'heading') b.label = 'Heading';
  if (kind === 'paragraph') b.text = 'Write some text here.';
  if (kind === 'button') Object.assign(b, { label: 'Next', action: 'next' });
  return b;
}
export const newColumn = (): Column => ({ id: uid(), blocks: [] });
export const newRow = (columns = 1): Row => ({ id: uid(), columns: Array.from({ length: columns }, newColumn) });
export const newSection = (): Section => ({ id: uid(), title: '', rows: [newRow()] });
export const newForm = (title: string): FormDoc => ({
  title, description: '', thankYou: 'Thanks — your answers are in.', sections: [newSection()],
});

/** All blocks in document order: sections top-down, rows top-down, columns left-right, blocks top-down. */
export function* blocksOf(doc: FormDoc): Generator<{ block: Block; section: Section }> {
  for (const section of doc.sections)
    for (const row of section.rows)
      for (const column of row.columns)
        for (const block of column.blocks) yield { block, section };
}

const isObj = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : undefined);
const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
const id = (x: unknown) => typeof x === 'string' && /^[\w-]{1,64}$/.test(x);

/** Blueprint line bends per source question: valid ids and points only, at most 50. */
function parseBends(x: unknown): Record<string, { x: number; y: number }> | undefined {
  if (!isObj(x)) return undefined;
  const out: Record<string, { x: number; y: number }> = {};
  for (const [k, v] of Object.entries(x).slice(0, 50)) { const p = parsePos(v); if (id(k) && p) out[k] = p; }
  return Object.keys(out).length ? out : undefined;
}

/** A blueprint box size (a page node, or a block's box): width minW to 1200, minimum height 0 to 4000. */
function parseSize(x: unknown, minW: number): { w: number; h: number } | undefined {
  if (!isObj(x) || num(x.w) === undefined || num(x.h) === undefined) return undefined;
  return { w: Math.round(Math.max(minW, Math.min(1200, x.w))), h: Math.round(Math.max(0, Math.min(4000, x.h))) };
}

/** A blueprint point (node position or line bend): two finite numbers, rounded and kept in a sane range. */
function parsePos(x: unknown): { x: number; y: number } | undefined {
  if (!isObj(x) || num(x.x) === undefined || num(x.y) === undefined) return undefined;
  const clamp = (n: number) => Math.round(Math.max(-20000, Math.min(20000, n)));
  return { x: clamp(x.x), y: clamp(x.y) };
}

function parseRule(x: unknown): Rule | undefined {
  if (!isObj(x) || !Array.isArray(x.conditions)) return undefined;
  const conditions = x.conditions
    .filter((c: any) => isObj(c) && id(c.q) && (OPS as readonly string[]).includes(c.op))
    .map((c: any) => ({ q: c.q, op: c.op, value: typeof c.value === 'number' ? c.value : str(c.value, 500) }));
  return conditions.length ? { match: x.match === 'any' ? 'any' : 'all', conditions } : undefined;
}

const KINDS = [...QUESTION_KINDS, ...CONTENT_KINDS] as readonly string[];

function parseBlock(x: unknown): Block | null {
  if (!isObj(x) || !id(x.id) || !KINDS.includes(x.kind)) return null;
  return {
    id: x.id, kind: x.kind, showIf: parseRule(x.showIf),
    label: str(x.label, 500), text: str(x.text, 5000), required: x.required === true || undefined,
    placeholder: str(x.placeholder, 200),
    other: x.other === true && (x.kind === 'single_choice' || x.kind === 'multi_choice') || undefined,
    otherLabel: str(x.otherLabel, 100),
    options: Array.isArray(x.options) ? x.options.filter((o: unknown) => typeof o === 'string').slice(0, 100).map((o: string) => o.slice(0, 200)) : undefined,
    min: num(x.min), max: num(x.max), url: str(x.url, 2000),
    action: ['next', 'back', 'submit', 'link'].includes(x.action) ? x.action : undefined,
    bends: parseBends(x.bends),
    size: parseSize(x.size, 80),
  };
}

/** Checks a form document sent by the editor. Returns null if the shape is wrong. */
export function parseFormDoc(x: unknown): FormDoc | null {
  if (!isObj(x) || typeof x.title !== 'string' || !Array.isArray(x.sections)) return null;
  const sections: Section[] = [];
  for (const s of x.sections) {
    if (!isObj(s) || !id(s.id) || !Array.isArray(s.rows)) return null;
    const rows: Row[] = [];
    for (const r of s.rows) {
      if (!isObj(r) || !id(r.id) || !Array.isArray(r.columns) || r.columns.length < 1 || r.columns.length > MAX_COLUMNS) return null;
      const columns: Column[] = [];
      for (const c of r.columns) {
        if (!isObj(c) || !id(c.id) || !Array.isArray(c.blocks)) return null;
        const blocks = c.blocks.map(parseBlock);
        if (blocks.includes(null)) return null;
        columns.push({ id: c.id, blocks: blocks as Block[] });
      }
      rows.push({ id: r.id, columns });
    }
    sections.push({ id: s.id, title: str(s.title, 500), showIf: parseRule(s.showIf), rows, pos: parsePos(s.pos), bend: parsePos(s.bend), size: parseSize(s.size, 200) });
  }
  // Ids are answer keys and drag-and-drop keys, so they must be unique.
  const ids = sections.flatMap((s) => [s.id, ...s.rows.flatMap((r) => [r.id, ...r.columns.flatMap((c) => [c.id, ...c.blocks.map((b) => b.id)])])]);
  if (new Set(ids).size !== ids.length) return null;
  return {
    title: x.title.slice(0, 200), description: str(x.description, 5000), thankYou: str(x.thankYou, 2000), sections,
    theme: parseTheme(x.theme), background: parseBackground(x.background), qr: parseQr(x.qr), typography: parseTypography(x.typography),
  };
}
