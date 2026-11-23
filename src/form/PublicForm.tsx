import { createEffect, createResource, Match, Switch } from 'solid-js';
import type { FormDoc } from '../../shared/schema';
import { api } from '../api';
import { Icon } from '../ui/icons';
import FormView from './FormView';
import { Themed } from './Themed';

export default function PublicForm(props: { id: string }) {
  const [data] = createResource(() => props.id, (id) => api<{ doc: FormDoc }>(`/public/forms/${id}`));
  createEffect(() => {
    if (data.state === 'ready') document.title = data().doc.title;
  });
  const fallbackDoc = { title: '', sections: [] } as FormDoc;
  return (
    <Switch fallback={<Themed doc={fallbackDoc} page><p class="fb-loading" role="status">Loading…</p></Themed>}>
      <Match when={data.error}>
        <Themed doc={fallbackDoc} page>
          <main class="fb-fcard-pub">
            <div class="fb-done" style={{ display: 'flex', 'flex-direction': 'column' }}>
              <div class="fb-empty-ic" style={{ margin: 0 }}><Icon name="file-x" size="lg" /></div>
              <h1 class="fb-pub-title">Form not found</h1>
              <p class="fb-pub-desc">This link may be wrong, or the form was closed or removed. Check with whoever sent it.</p>
            </div>
          </main>
        </Themed>
      </Match>
      <Match when={data.state === 'ready' && data()}>
        {(d) => (
          <Themed doc={d().doc} page>
            <FormView doc={d().doc} onSubmit={(answers) => api(`/public/forms/${props.id}/responses`, 'POST', { answers })} />
            <span class="fb-foot">Made with Feedbacker</span>
          </Themed>
        )}
      </Match>
    </Switch>
  );
}
