// Charts for one question on the Responses "Graph" tab: Bar (horizontal), Column, Line and Pie, with a picker.
// One series per chart, so Bar, Column and Line use the theme accent; Pie uses the categorical palette in app.css
// (validated with the dataviz validator on the app surfaces). Counts and percentages are always written out, and the
// Table tab shows the same data, so no chart depends on color alone.
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { Seg } from '../ui/kit';
import type { Bar } from './report';

export type ChartKind = 'bar' | 'column' | 'line' | 'pie';
const NAMES: Record<ChartKind, string> = { bar: 'Bar', column: 'Column', line: 'Line', pie: 'Pie' };
const PIE_SLOTS = 7; // the 8th color slot stays free: slices past 7 fold into a gray "Other"

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* private mode: the choice lasts this visit */ } };

/**
 * A question's chart with a picker. `kinds`: the chart types that fit this question (the first is the default).
 * `bars` are in the question's own order (low to high for ratings); `barOrder` is the order for horizontal bars.
 * The choice is kept per form and question in this browser.
 */
export function QuestionChart(props: { bars: Bar[]; total: number; kinds: ChartKind[]; saveKey: string; barOrder?: Bar[] }) {
  const saved = read(props.saveKey) as ChartKind | null;
  const [kind, setKind] = createSignal<ChartKind>(saved && props.kinds.includes(saved) ? saved : props.kinds[0]!);
  const pick = (k: ChartKind) => { setKind(k); write(props.saveKey, k); };
  return (
    <>
      <Show when={props.kinds.length > 1}>
        <div class="fb-chart-pick"><Seg small label="Chart type" value={kind()} onChange={pick} options={props.kinds.map((k) => ({ value: k, label: NAMES[k] }))} /></div>
      </Show>
      <Switch>
        <Match when={kind() === 'column'}><Columns bars={props.bars} total={props.total} /></Match>
        <Match when={kind() === 'line'}><Line bars={props.bars} total={props.total} /></Match>
        <Match when={kind() === 'pie'}><Pie bars={props.bars} total={props.total} /></Match>
        <Match when={true}><Bars bars={props.barOrder ?? props.bars} total={props.total} /></Match>
      </Switch>
    </>
  );
}

const tip = (b: Bar, total: number) => `${b.label}: ${b.count} of ${total} (${Math.round(b.pct)}%)`;
const topCount = (bars: Bar[]) => Math.max(0, ...bars.map((b) => b.count));

/** Horizontal bars in option order; the most-picked label is bold; count and % are written out. */
export function Bars(props: { bars: Bar[]; total: number }) {
  return (
    <ul class="fb-bars">
      <For each={props.bars}>
        {(b) => (
          <li class="fb-bar" classList={{ 'is-top': b.count > 0 && b.count === topCount(props.bars) }} title={tip(b, props.total)}>
            <span class="fb-bar-l">{b.label}</span>
            <span class="fb-bar-t" role="img" aria-label={`${b.count} of ${props.total}`}><span style={{ width: `${b.pct}%` }} /></span>
            <span class="fb-bar-n">{b.count}<small>{Math.round(b.pct)}%</small></span>
          </li>
        )}
      </For>
    </ul>
  );
}

/** Vertical columns from a shared baseline, scaled to the most-picked answer; each is labeled with its count. */
function Columns(props: { bars: Bar[]; total: number }) {
  const max = () => Math.max(1, topCount(props.bars));
  return (
    <div class="fb-viz fb-colchart" style={{ '--n': props.bars.length }} role="list">
      <For each={props.bars}>
        {(b) => (
          <div class="fb-colchart-c" role="listitem" title={tip(b, props.total)} classList={{ 'is-top': b.count > 0 && b.count === topCount(props.bars) }}>
            <div class="fb-colchart-plot">
              <span class="fb-colchart-n">{b.count}<small>{Math.round(b.pct)}%</small></span>
              <span class="fb-colchart-bar" style={{ height: `${(b.count / max()) * 100}%` }} />
            </div>
            <span class="fb-colchart-l">{b.label}</span>
          </div>
        )}
      </For>
    </div>
  );
}

/** A line over the ordered answers (ratings and scales). The highest point is labeled; every point has a tooltip. */
function Line(props: { bars: Bar[]; total: number }) {
  const max = () => Math.max(1, topCount(props.bars));
  const x = (i: number) => (props.bars.length === 1 ? 50 : (i / (props.bars.length - 1)) * 100);
  const y = (b: Bar) => 100 - (b.count / max()) * 100;
  const peak = () => props.bars.findIndex((b) => b.count === topCount(props.bars));
  return (
    <div class="fb-viz fb-linechart">
      <div class="fb-linechart-plot" role="img" aria-label={props.bars.map((b) => `${b.label}: ${b.count}`).join(', ')}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" y1="100" x2="100" y2="100" class="fb-linechart-base" vector-effect="non-scaling-stroke" />
          <polyline points={props.bars.map((b, i) => `${x(i)},${y(b)}`).join(' ')} class="fb-linechart-line" vector-effect="non-scaling-stroke" />
        </svg>
        <For each={props.bars}>
          {(b, i) => (
            <span class="fb-linechart-dot" style={{ left: `${x(i())}%`, top: `${y(b)}%` }} title={tip(b, props.total)}>
              <Show when={i() === peak() && b.count > 0}><b>{b.count}</b></Show>
            </span>
          )}
        </For>
      </div>
      {/* Each label sits under its point; the first and last align to the plot edges so they never overflow. */}
      <div class="fb-linechart-x">
        <For each={props.bars}>
          {(b, i) => <span style={{ left: `${x(i())}%`, transform: `translateX(${i() === 0 && props.bars.length > 1 ? '0' : i() === props.bars.length - 1 && props.bars.length > 1 ? '-100%' : '-50%'})` }}>{b.label}</span>}
        </For>
      </div>
    </div>
  );
}

/** Part of the whole for one-answer questions. Slices past 7 fold into "Other"; the legend writes out every count. */
function Pie(props: { bars: Bar[]; total: number }) {
  const slices = () => {
    const sorted = props.bars.filter((b) => b.count > 0);
    if (sorted.length <= PIE_SLOTS + 1) return sorted.map((b, i) => ({ ...b, slot: i + 1 }));
    const rest = sorted.slice(PIE_SLOTS);
    const other = rest.reduce((a, b) => ({ label: 'Other', count: a.count + b.count, pct: a.pct + b.pct }), { label: 'Other', count: 0, pct: 0 });
    return [...sorted.slice(0, PIE_SLOTS).map((b, i) => ({ ...b, slot: i + 1 })), { ...other, slot: 0 }];
  };
  const sum = () => Math.max(1, slices().reduce((n, s) => n + s.count, 0));
  const paths = () => {
    let start = -Math.PI / 2;
    return slices().map((s) => {
      const angle = (s.count / sum()) * Math.PI * 2;
      const end = start + angle;
      const p = (a: number) => `${50 + 48 * Math.cos(a)} ${50 + 48 * Math.sin(a)}`;
      const d = angle >= Math.PI * 2 - 1e-6
        ? 'M 50 2 A 48 48 0 1 1 49.99 2 Z' // one slice: a full circle
        : `M 50 50 L ${p(start)} A 48 48 0 ${angle > Math.PI ? 1 : 0} 1 ${p(end)} Z`;
      start = end;
      return { ...s, d };
    });
  };
  const zero = () => props.bars.filter((b) => b.count === 0);
  return (
    <div class="fb-viz fb-pie">
      <svg viewBox="0 0 100 100" role="img" aria-label={slices().map((s) => `${s.label}: ${s.count}`).join(', ')}>
        <For each={paths()}>{(s) => <path d={s.d} class={`fb-pie-s s${s.slot}`}><title>{tip(s, props.total)}</title></path>}</For>
      </svg>
      <ul class="fb-pie-legend">
        <For each={slices()}>
          {(s) => (
            <li title={tip(s, props.total)}>
              <i class={`s${s.slot}`} aria-hidden="true" />
              <span class="fb-pie-l">{s.label}</span>
              <span class="fb-bar-n">{s.count}<small>{Math.round(s.pct)}%</small></span>
            </li>
          )}
        </For>
        <For each={zero()}>
          {(b) => <li class="is-zero"><i aria-hidden="true" /><span class="fb-pie-l">{b.label}</span><span class="fb-bar-n">0<small>0%</small></span></li>}
        </For>
      </ul>
    </div>
  );
}
