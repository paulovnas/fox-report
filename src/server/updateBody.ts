import type { CleanReport } from './types';

/* O create_update do Monday espera HTML e não renderiza Markdown (## e ** aparecem
   como texto cru). Só tags documentadas pela API: p, strong, em, br, ul, li —
   headings e code não são garantidos. Todo texto dinâmico passa por esc(). */
const esc = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const line = (value: string, max = 300) => value.replace(/\s+/g, ' ').trim().slice(0, max);
const para = (html: string) => `<p>${html}</p>`;
const heading = (text: string) => para(`<strong>${esc(text)}</strong>`);
const list = (items: string[]) => (items.length ? `<ul>${items.join('')}</ul>` : '');
const li = (html: string) => `<li>${html}</li>`;

/** Corpo do update em HTML com tudo o que o navegador conseguiu coletar. */
export function buildUpdateBody(report: CleanReport): string {
  const c = report.context;
  const out: string[] = [];

  out.push(heading('Relato'), para(esc(report.description).replace(/\r?\n/g, '<br>')));
  if (report.types.length) out.push(para(`<strong>Tipos:</strong> ${esc(report.types.join(', '))}`));

  out.push(heading('Página'), list([
    li(`<strong>URL:</strong> ${esc(line(c.url, 1000)) || '—'}`),
    li(`<strong>Título:</strong> ${esc(line(c.title, 200)) || '—'}`),
    li(`<strong>Capturado em:</strong> ${esc(c.capturedAt || report.capturedAt)}`),
    li(`<strong>Viewport:</strong> ${c.viewport ? `${c.viewport.w ?? '?'}×${c.viewport.h ?? '?'} (dpr ${c.viewport.dpr ?? '?'})` : '—'}`),
    li(`<strong>Scroll:</strong> ${c.scroll ? `${c.scroll.x ?? 0}, ${c.scroll.y ?? 0}` : '—'}`),
    li(`<strong>Região:</strong> ${c.region ? `${c.region.w ?? '?'}×${c.region.h ?? '?'} em (${c.region.x ?? 0}, ${c.region.y ?? 0})` : '—'}`),
    li(`<strong>Reporter:</strong> ${esc(report.reporter) || '—'}`),
    li(`<strong>Projeto:</strong> ${esc(report.project) || '—'}`),
    li(`<strong>Idioma:</strong> ${esc(c.language) || '—'}`),
    li(`<strong>User agent:</strong> ${esc(line(c.userAgent, 400)) || '—'}`),
    li(`<strong>SDK:</strong> ${c.sdk ? esc(`${c.sdk.name}@${c.sdk.version}`) : '—'}`),
  ]));

  if (c.elements.length) {
    out.push(heading(`Elementos na região (${c.elements.length})`), list(c.elements.map(el =>
      li(`${esc(line(el.path, 300))}${el.component ? ` — ${esc(line(el.component, 120))}` : ''}${el.text ? `: "${esc(line(el.text, 160))}"` : ''}`),
    )));
  }

  if (c.consoleErrors.length) {
    out.push(heading(`Console (${c.consoleErrors.length})`), list(
      c.consoleErrors.map(entry => li(`[${esc(entry.at)}] ${esc(line(entry.message, 500))}`)),
    ));
  }

  if (c.network.length) {
    out.push(heading(`Requisições (${c.network.length})`));
    const shown = c.network.slice(-30);
    const items = shown.map((entry) => {
      const status = entry.error ? `erro: ${esc(line(entry.error, 200))}` : String(entry.status ?? '—');
      const sub: string[] = [];
      if (entry.requestBody) sub.push(li(`request: ${esc(line(entry.requestBody, 400))}`));
      if (entry.responseBody) sub.push(li(`response: ${esc(line(entry.responseBody, 400))}`));
      return li(`${esc(entry.method)} ${esc(line(entry.url, 500))} → ${status} (${entry.durationMs} ms, ${esc(entry.type)})${sub.length ? `<ul>${sub.join('')}</ul>` : ''}`);
    });
    if (c.network.length > shown.length) items.push(li(`… e mais ${c.network.length - shown.length} requisições não listadas.`));
    out.push(list(items));
  }

  if (Object.keys(c.metadata).length) {
    let json = '';
    try { json = JSON.stringify(c.metadata, null, 2); } catch { json = '{}'; }
    out.push(heading('Metadados do app'), para(esc(json.slice(0, 6000)).replace(/\r?\n/g, '<br>')));
  }

  out.push(heading('Anexos'), list([
    li('<strong>region.png</strong>: região selecionada'),
    li('<strong>full.png</strong>: aba inteira'),
  ]));

  const body = out.join('');
  if (body.length > 40_000) {
    // corte antes da última tag aberta; o parser do Monday fecha estruturas pendentes
    const cut = body.lastIndexOf('<', 39_900);
    return `${body.slice(0, cut)}${para('<em>(corpo truncado em 40 mil caracteres)</em>')}`;
  }
  return body;
}
