import { createMemo, createResource, createSignal, Show } from 'solid-js';
import { resolveQr } from '../../shared/qr';
import type { FormDoc } from '../../shared/schema';
import { resolveTheme } from '../../shared/themes';
import { api } from '../api';
import { safeUrl } from '../form/FormView';
import { downloadPng, downloadSvg, fileName, finalSvg } from '../qr/export';
import { qrSvg } from '../qr/render';
import { Icon } from '../ui/icons';
import { Modal } from '../ui/kit';
import { handoff, navigate } from './router';

export const shareLink = (id: string) => `${location.origin}/f/${id}`;

/**
 * Share dialog (ShareDialog): link with Copy, the QR tile, Open form.
 * In the editor, pass `doc` (it may have unsaved changes); from the forms list, the saved form is loaded.
 */
export default function SharePanel(props: { id: string; title: string; doc?: FormDoc; published?: boolean; onClose: () => void; onCustomize?: () => void }) {
  const link = shareLink(props.id);
  const [loaded] = createResource(() => (props.doc ? null : props.id), (id) => api<{ doc: FormDoc; publishedAt: number | null }>(`/forms/${id}`));
  const doc = () => props.doc ?? loaded()?.doc;
  const published = () => props.published ?? (loaded() ? loaded()!.publishedAt !== null : true);
  const style = createMemo(() => (doc() ? resolveQr(doc()!.qr, resolveTheme(doc()!.theme)) : undefined));
  const logo = () => (doc()?.qr?.mode === 'custom' ? safeUrl(doc()!.qr!.logo) : undefined);
  const [copied, setCopied] = createSignal(false);

  async function copy() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  async function download(kind: 'svg' | 'png') {
    const file = await finalSvg(link, style()!, logo());
    kind === 'svg' ? downloadSvg(file, fileName(props.title)) : downloadPng(file, fileName(props.title));
  }
  function customize() {
    // Read props before closing: closing unmounts this dialog.
    const { id, onCustomize, onClose } = props;
    if (onCustomize) {
      onClose();
      onCustomize();
      return;
    }
    handoff.editorMode = 'qr';
    navigate(`/admin/forms/${id}`);
    onClose();
  }

  return (
    <Modal
      title={`Share "${props.title || 'Untitled form'}"`}
      onClose={props.onClose}
      footer={
        <div style={{ display: 'flex', 'justify-content': 'space-between', width: '100%', gap: '8px', 'align-items': 'center' }}>
          <span class="fb-help">Anyone with the link can answer.</span>
          <a class="fb-btn fb-btn--secondary" href={link} target="_blank" rel="noopener">Open form<Icon name="external" /></a>
        </div>
      }
    >
      <Show when={!published()}>
        <div class="fb-banner fb-banner--warn" role="status"><Icon name="warn" /><span><b>Not published yet.</b> The link shows "Form not found" until you press Publish in the editor.</span></div>
      </Show>
      <div class="fb-field">
        <label class="fb-label" for="share-link">Form link</label>
        <div class="fb-share-link">
          <input class="fb-input fb-input--mono" id="share-link" readonly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button class="fb-btn fb-btn--primary" aria-live="polite" onClick={copy}>
            <Icon name={copied() ? 'check' : 'copy'} />{copied() ? 'Copied' : 'Copy'}
          </button>
        </div>
        <Show when={copied()}><span class="fb-status fb-status--ok" role="status"><Icon name="check" size="sm" />Link copied</span></Show>
      </div>
      <div class="fb-qr-tile">
        <div class="fb-qr-box">
          <Show when={style()} fallback={<span class="fb-spin" aria-hidden="true" />}>
            {(s) => <div innerHTML={qrSvg(link, s(), logo())} role="img" aria-label="QR code for the form link" style={{ height: '100%' }} />}
          </Show>
        </div>
        <div style={{ display: 'flex', 'flex-direction': 'column', gap: '8px', 'align-items': 'flex-start' }}>
          <b>QR code</b>
          <span class="fb-help">Print it on receipts, tables or posters.</span>
          <div style={{ display: 'flex', gap: '6px', 'flex-wrap': 'wrap' }}>
            <button class="fb-btn fb-btn--secondary fb-btn--sm" disabled={!style()} onClick={() => download('png')}><Icon name="download" size="sm" />PNG</button>
            <button class="fb-btn fb-btn--secondary fb-btn--sm" disabled={!style()} onClick={() => download('svg')}><Icon name="download" size="sm" />SVG</button>
          </div>
          <button class="fb-btn fb-btn--ghost fb-btn--sm" onClick={customize}><Icon name="qr" size="sm" />Design QR code</button>
        </div>
      </div>
    </Modal>
  );
}
