import { ApiError, sendReport } from './api';
import { COLORS, TOOLS, drawShape, isMeaningful } from './annotate';
import { captureViewport, cropImage, maskImage, maskRects, renderAnnotations, selectorList } from './capture';
import { buildContext, installConsoleCapture } from './context';
import { resolveStrings } from './i18n';
import { recentNetwork, startNetworkRecorder } from './network';
import { CSS_TEXT } from './styles';
import type { FoxReportInstance, FoxReportOptions, Pt, Rect, ReportAttachment, ReportPayload, SendResult, Shape, Strings, Tool } from './types';

export type { FoxReportInstance, FoxReportOptions, NetworkEntry, Shape, Tool, ReportContext, ReportPayload, Rect, SendResult, Strings, Position, ElementInfo, ConsoleEntry } from './types';
export { resolveStrings, DEFAULT_STRINGS } from './i18n';
export { SDK_VERSION } from './version';

type Phase = 'idle' | 'capturing' | 'select' | 'annotate' | 'sheet' | 'sending' | 'sent';
const MIN_SIDE = 24;
const DEFAULT_TYPES = ['Bug', 'Layout', 'Conteúdo', 'Outro'];
const ICON_BUG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 2 1.9 1.9M14.1 3.9 16 2M9 7.1v-1a3 3 0 0 1 6 0v1"/><path d="M12 20a6 6 0 0 1-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3a6 6 0 0 1-6 6Z"/><path d="M12 20v-9M6.5 13H2M17.5 13H22M6 7.5 3.5 6M18 7.5 20.5 6M6.5 17.5 3 19M17.5 17.5 21 19"/></svg>';
const ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const ICON_SPIN = '<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-6.2-8.56"/></svg>';
const svg = (d: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const TOOL_ICON: Record<Tool, string> = {
  arrow: svg('<path d="M5 19 19 5M9 5h10v10"/>'),
  rect: svg('<rect x="4" y="5" width="16" height="14" rx="1"/>'),
  ellipse: svg('<ellipse cx="12" cy="12" rx="9" ry="7"/>'),
  pen: svg('<path d="m4 20 1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z"/>'),
};
const ICON_UNDO = svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>');
const ICON_CLEAR = svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>');
const FOCUSABLE = 'button:not([disabled]), textarea, input, [href], [tabindex]:not([tabindex="-1"])';

type Attrs = Record<string, string | boolean | number | undefined>;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: (Node | string | null | false)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid) node.append(kid);
  return node;
}
const icon = (svg: string) => { const s = document.createElement('span'); s.style.display = 'contents'; s.innerHTML = svg; return s; };
const norm = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  x: Math.round(Math.min(a.x, b.x)),
  y: Math.round(Math.min(a.y, b.y)),
  w: Math.round(Math.abs(a.x - b.x)),
  h: Math.round(Math.abs(a.y - b.y)),
});

function resolveReporter(opt: FoxReportOptions['reporter']): string | undefined {
  const clean = (value: string) => value.trim().slice(0, 120);
  try {
    if (typeof opt === 'string') return clean(opt) || undefined;
    if (typeof opt === 'function') return clean(opt()) || undefined;
  } catch { /* configuração indisponível */ }
  return undefined;
}

const fmtSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;

class FoxReport implements FoxReportInstance {
  private o: FoxReportOptions;
  private t: Strings;
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private shell: HTMLElement | null = null;
  private phase: Phase = 'idle';
  private rect: Rect | null = null;
  private hint = '';
  private error = '';
  private full = '';
  private region = '';
  private clean = '';
  private shapes: Shape[] = [];
  private tool: Tool = 'arrow';
  private color = COLORS[0];
  private text = '';
  private chosen: string[] = [];
  private attachment: ReportAttachment | null = null;
  private kb = 0;
  private startPt: { x: number; y: number } | null = null;
  private opener: Element | null = null;
  private cleanups: (() => void)[] = [];
  private uninstallConsole: (() => void) | null = null;
  private uninstallNetwork: (() => void) | null = null;
  private maskSelectors: string[];
  private enabledOverride: boolean | null = null;
  private run = 0;

  constructor(options: FoxReportOptions) {
    this.o = options;
    this.t = resolveStrings(options.strings);
    this.maskSelectors = options.mask ?? [];
    if (options.captureConsole !== false) this.uninstallConsole = installConsoleCapture();
    if (options.network !== false) {
      this.uninstallNetwork = startNetworkRecorder({
        bodies: Boolean(options.networkBodies),
        limit: options.networkLimit ?? 50,
        windowMs: options.networkWindowMs ?? 120_000,
      });
    }
    this.sync();
  }

  // ---- API pública
  isEnabled(): boolean {
    if (this.enabledOverride !== null) return this.enabledOverride;
    const enabled = this.o.enabled;
    if (typeof enabled === 'function') {
      try { return Boolean(enabled()); } catch { return false; }
    }
    return enabled === true;
  }
  setEnabled(enabled: boolean) { this.enabledOverride = enabled; this.sync(); }
  open() {
    if (this.phase !== 'idle') return;
    this.mount();
    void this.begin();
  }
  close() { this.reset(); this.render(); this.restoreFocus(); }
  destroy() {
    this.unmount();
    this.cleanups.forEach(fn => fn());
    this.cleanups = [];
    this.uninstallConsole?.();
    this.uninstallConsole = null;
    this.uninstallNetwork?.();
    this.uninstallNetwork = null;
  }

  // ---- montagem
  private sync() { if (this.isEnabled()) this.mount(); else this.unmount(); }

  private mount() {
    if (this.host) return;
    const host = h('div', { 'data-fox-ui': 'true', 'data-fox-report': '' });
    host.style.cssText = 'all:initial;position:static;';
    this.root = host.attachShadow({ mode: 'open' });
    (this.o.container ?? document.body).append(host);
    this.host = host;
    const vv = window.visualViewport;
    if (vv) {
      const update = () => {
        this.kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
        const sheet = this.root?.querySelector<HTMLElement>('.sheet');
        if (sheet) sheet.style.bottom = `${this.kb}px`;
      };
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
      this.cleanups.push(() => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); });
    }
    this.render();
  }

  private unmount() {
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.shell = null;
    this.phase = 'idle';
  }

  // ---- fluxo
  private reset() {
    this.run++;
    this.phase = 'idle';
    this.rect = null;
    this.hint = '';
    this.error = '';
    this.text = '';
    this.chosen = [];
    this.attachment = null;
    this.full = '';
    this.clean = '';
    this.shapes = [];
    this.region = '';
    this.startPt = null;
  }
  private go(phase: Phase) { this.phase = phase; this.render(); }
  private fail(e: unknown) {
    try { this.o.onError?.(e instanceof Error ? e : new Error(String(e))); } catch { /* callback do app nunca quebra a ferramenta */ }
  }

  private async begin() {
    const run = ++this.run;
    this.opener = (this.root?.activeElement as Element | null) ?? null;
    this.error = '';
    this.hint = '';
    this.go('capturing');
    try {
      const raw = await (this.o.captureFn ? this.o.captureFn() : captureViewport({ maxPixelRatio: this.o.maxPixelRatio, exclude: this.o.exclude }));
      if (run !== this.run) return;
      const rects = maskRects({ maskInputs: this.o.maskInputs !== false, selectors: this.maskSelectors });
      this.clean = await maskImage(raw, rects, { w: window.innerWidth, h: window.innerHeight });
      if (run !== this.run) return;
      this.go('select');
    } catch (e) {
      this.fail(e);
      this.reset();
      this.error = this.t.captureFailed;
      this.render();
    }
  }

  /** A área foi escolhida: segue para as anotações (opcionais) antes do formulário. */
  private annotate(rect: Rect) {
    this.rect = rect;
    this.shapes = [];
    this.hint = '';
    this.go('annotate');
  }

  /** Grava as anotações na tela inteira, recorta a área escolhida e abre o formulário. */
  private async choose() {
    const run = this.run, rect = this.rect;
    if (!rect) return;
    try {
      const viewport = { w: window.innerWidth, h: window.innerHeight };
      const whole = rect.x === 0 && rect.y === 0 && rect.w >= viewport.w && rect.h >= viewport.h;
      const full = await renderAnnotations(this.clean, this.shapes, viewport);
      const region = whole ? full : await cropImage(full, rect, viewport);
      if (run !== this.run) return;
      this.full = full;
      this.region = region;
      this.go('sheet');
    } catch (e) {
      this.fail(e);
      this.hint = this.t.selectCutFailed;
      this.go('select');
    }
  }
  private wholeScreen() { this.annotate({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight }); }

  private async buildReport(): Promise<ReportPayload> {
    let metadata: Record<string, unknown> = {};
    try { metadata = (await this.o.metadata?.()) ?? {}; } catch (e) { this.fail(e); }
    const context = buildContext({
      region: this.rect,
      metadata,
      includeConsole: this.o.captureConsole !== false,
      maskSelector: selectorList(this.maskSelectors),
      redactParams: this.o.redactParams,
      network: this.o.network === false ? [] : recentNetwork(this.o.networkWindowMs ?? 120_000),
    });
    const project = this.o.project?.trim().slice(0, 120);
    const reporter = resolveReporter(this.o.reporter);
    return {
      description: this.text.trim(),
      types: this.chosen,
      ...(project ? { project } : {}),
      ...(reporter ? { reporter } : {}),
      ...(this.attachment ? { attachment: this.attachment } : {}),
      context,
      region: this.region,
      full: this.full,
    };
  }

  private async send() {
    if (!this.text.trim() || !this.rect) return;
    this.error = '';
    this.go('sending');
    try {
      const payload = await this.buildReport();
      const result = await sendReport({ endpoint: this.o.endpoint, fetch: this.o.fetch ?? ((...args) => fetch(...args)) }, payload);
      this.finishSent(result);
    } catch (e) {
      this.fail(e);
      this.error = this.t.sendFailed;
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) this.error = `${this.t.sendFailed} (HTTP ${e.status})`;
      this.go('sheet');
    }
  }

  private finishSent(result: SendResult) {
    this.sentResult = result;
    this.go('sent');
    try { this.o.onSent?.(result); } catch (e) { this.fail(e); }
    window.setTimeout(() => {
      if (this.phase === 'sent') { this.reset(); this.render(); this.restoreFocus(); }
    }, 4000);
  }
  private sentResult: SendResult | null = null;
  private restoreFocus() { this.root?.querySelector<HTMLElement>('.fab')?.focus(); }

  // ---- renderização
  private render() {
    const root = this.root;
    if (!root) return;
    root.replaceChildren(h('style', {}, CSS_TEXT));
    const scheme = this.o.colorScheme ?? 'auto';
    const shell = h('div', { class: 'fox', 'data-scheme': scheme });
    if (this.o.accent) shell.style.setProperty('--fox-accent', this.o.accent);
    if (this.o.zIndex !== undefined) shell.style.setProperty('--fox-z', String(this.o.zIndex));
    root.append(shell);
    this.shell = shell;
    if ((this.phase === 'idle' || this.phase === 'capturing') && this.o.showButton !== false && this.isEnabled()) shell.append(this.renderFab());
    if (this.phase === 'select') shell.append(this.renderSelect());
    if (this.phase === 'annotate') shell.append(this.renderAnnotate());
    if (this.phase === 'sheet' || this.phase === 'sending' || this.phase === 'sent') shell.append(this.renderSheet());
    const live = h('div', { class: 'sr', role: 'status', 'aria-live': 'polite' },
      this.phase === 'capturing' ? this.t.loading : this.phase === 'sent' ? this.t.sentTitle : this.error || '');
    shell.append(live);
  }

  private renderFab(): HTMLElement {
    const t = this.t, busy = this.phase === 'capturing';
    const position = this.o.position ?? 'bottom-right';
    const wrap = h('div', { class: `fab-wrap ${position}` });
    wrap.style.setProperty('--fox-x', `${this.o.offset?.x ?? 0}px`);
    wrap.style.setProperty('--fox-y', `${this.o.offset?.y ?? 0}px`);
    const fab = h('button', { type: 'button', class: 'fab', 'aria-label': t.button, disabled: busy });
    fab.append(icon(busy ? ICON_SPIN : ICON_BUG));
    fab.addEventListener('click', () => void this.begin());
    wrap.append(fab);
    if (this.error && this.phase === 'idle') wrap.append(h('p', { class: 'toast', role: 'alert' }, this.error));
    return wrap;
  }

  private renderSelect(): HTMLElement {
    const t = this.t;
    const layer = h('div', { class: 'layer', tabindex: '0', role: 'application', 'aria-label': t.selectHint, 'data-testid': 'fox-select-layer' });
    const rectEl = h('div', { class: 'rect' });
    rectEl.style.display = 'none';
    const paintRect = () => {
      const r = this.rect;
      layer.style.background = r && r.w > 0 ? 'transparent' : '';
      if (r && r.w > 0) rectEl.style.cssText = `display:block;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;
      else rectEl.style.display = 'none';
    };
    paintRect();
    const bar = h('div', { class: 'bar' }, h('span', {}, this.hint || t.selectHint));
    const whole = h('button', { type: 'button', class: 'primary' }, t.wholeScreen);
    const cancel = h('button', { type: 'button', 'aria-label': t.cancel }, icon(ICON_X), t.cancel);
    whole.addEventListener('click', () => this.wholeScreen());
    cancel.addEventListener('click', () => { this.reset(); this.render(); this.restoreFocus(); });
    bar.append(whole, cancel);
    for (const ev of ['pointerdown', 'pointerup']) bar.addEventListener(ev, e => e.stopPropagation());
    layer.append(rectEl, bar);

    layer.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault();
      try { layer.setPointerCapture(e.pointerId); } catch { /* sem suporte */ }
      this.startPt = { x: e.clientX, y: e.clientY };
      this.hint = '';
      bar.firstElementChild!.textContent = t.selectHint;
      this.rect = { x: e.clientX, y: e.clientY, w: 0, h: 0 };
      paintRect();
    });
    layer.addEventListener('pointermove', e => {
      if (this.startPt) { this.rect = norm(this.startPt, { x: e.clientX, y: e.clientY }); paintRect(); }
    });
    layer.addEventListener('pointerup', e => {
      if (!this.startPt) return;
      const r = norm(this.startPt, { x: e.clientX, y: e.clientY });
      this.startPt = null;
      try { layer.releasePointerCapture(e.pointerId); } catch { /* já liberado */ }
      if (r.w < MIN_SIDE || r.h < MIN_SIDE) {
        this.rect = null;
        paintRect();
        bar.firstElementChild!.textContent = t.selectTooSmall;
        return;
      }
      this.annotate(r);
    });
    layer.addEventListener('pointercancel', () => { this.startPt = null; this.rect = null; paintRect(); });
    // Teclado: setas movem a caixa, Shift+setas redimensionam, Enter confirma, Escape cancela.
    layer.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.reset(); this.render(); this.restoreFocus(); return; }
      if (e.target !== layer) return;
      const step = 24, vw = window.innerWidth, vh = window.innerHeight;
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.rect && this.rect.w >= MIN_SIDE) this.annotate(this.rect);
        else this.wholeScreen();
        return;
      }
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      if (!dx && !dy) return;
      e.preventDefault();
      const r = this.rect && this.rect.w > 0 ? { ...this.rect } : { x: Math.round(vw * .25), y: Math.round(vh * .25), w: Math.round(vw * .5), h: Math.round(vh * .5) };
      if (e.shiftKey) {
        r.w = Math.max(MIN_SIDE, Math.min(vw - r.x, r.w + dx));
        r.h = Math.max(MIN_SIDE, Math.min(vh - r.y, r.h + dy));
      } else {
        r.x = Math.max(0, Math.min(vw - r.w, r.x + dx));
        r.y = Math.max(0, Math.min(vh - r.h, r.y + dy));
      }
      this.rect = r;
      paintRect();
    });
    queueMicrotask(() => layer.focus());
    return layer;
  }

  /** Mantém a área escolhida e oferece a régua de anotação (seta, retângulo, círculo, caneta). */
  private renderAnnotate(): HTMLElement {
    const t = this.t, rect = this.rect!;
    const vw = window.innerWidth, vh = window.innerHeight, dpr = window.devicePixelRatio || 1;
    const layer = h('div', { class: 'layer annotating', tabindex: '0', role: 'application', 'aria-label': t.annotateHint, 'data-testid': 'fox-annotate-layer' });
    const frame = h('div', { class: 'rect' });
    frame.style.cssText = `display:block;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px`;
    const canvas = h('canvas', { class: 'draw' });
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    const ctx = canvas.getContext('2d');
    let draft: Shape | null = null;
    const redraw = () => {
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const s of draft ? [...this.shapes, draft] : this.shapes) drawShape(ctx, s);
    };

    // ---- barra de ferramentas
    const tools = h('div', { class: 'tools', role: 'toolbar', 'aria-label': t.toolsLabel });
    const cx = Math.min(Math.max(rect.x + rect.w / 2, Math.min(vw / 2, 230)), vw - Math.min(vw / 2, 230));
    tools.style.left = `${cx}px`;
    if (rect.y + rect.h + 64 <= vh) tools.style.top = `${rect.y + rect.h + 8}px`;
    else if (rect.y >= 64) tools.style.bottom = `${vh - rect.y + 8}px`;
    else tools.style.bottom = '12px';

    const names: Record<Tool, string> = { arrow: t.toolArrow, rect: t.toolRect, ellipse: t.toolEllipse, pen: t.toolPen };
    const toolBtns = TOOLS.map(tool => {
      const b = h('button', { type: 'button', class: 'tool', 'aria-label': names[tool], title: names[tool], 'data-tool': tool }, icon(TOOL_ICON[tool]));
      b.addEventListener('click', () => { this.tool = tool; sync(); });
      return b;
    });
    const swatches = COLORS.map((color, i) => {
      const b = h('button', { type: 'button', class: 'swatch', 'aria-label': `${t.toolColor} ${i + 1}`, title: t.toolColor, 'data-color': color });
      b.style.background = color;
      b.addEventListener('click', () => { this.color = color; sync(); });
      return b;
    });
    const undo = h('button', { type: 'button', class: 'tool', 'aria-label': t.toolUndo, title: t.toolUndo, 'data-act': 'undo' }, icon(ICON_UNDO));
    const clear = h('button', { type: 'button', class: 'tool', 'aria-label': t.toolClear, title: t.toolClear, 'data-act': 'clear' }, icon(ICON_CLEAR));
    const doUndo = () => { this.shapes.pop(); redraw(); sync(); };
    undo.addEventListener('click', doUndo);
    clear.addEventListener('click', () => { this.shapes = []; redraw(); sync(); });
    const sync = () => {
      toolBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === this.tool)));
      swatches.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === this.color)));
      undo.disabled = clear.disabled = !this.shapes.length;
    };
    const again = h('button', { type: 'button', class: 'text-btn' }, t.anotherArea);
    again.addEventListener('click', () => { this.rect = null; this.shapes = []; this.go('select'); });
    const cancel = h('button', { type: 'button', class: 'text-btn', 'aria-label': t.cancel }, icon(ICON_X), t.cancel);
    cancel.addEventListener('click', () => { this.reset(); this.render(); this.restoreFocus(); });
    const done = h('button', { type: 'button', class: 'done' }, t.continue);
    done.addEventListener('click', () => { done.disabled = true; void this.choose(); });
    const sep = () => h('span', { class: 'sep', 'aria-hidden': 'true' });
    tools.append(...toolBtns, sep(), ...swatches, sep(), undo, clear, sep(), again, cancel, done);
    sync();

    // ---- desenho: só dentro da área escolhida
    const inside = (e: PointerEvent): Pt => ({
      x: Math.round(Math.min(rect.x + rect.w, Math.max(rect.x, e.clientX))),
      y: Math.round(Math.min(rect.y + rect.h, Math.max(rect.y, e.clientY))),
    });
    canvas.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch { /* sem suporte */ }
      const p = inside(e);
      draft = { tool: this.tool, color: this.color, pts: [p, p] };
      redraw();
    });
    canvas.addEventListener('pointermove', e => {
      if (!draft) return;
      const p = inside(e);
      if (draft.tool === 'pen') draft.pts.push(p); else draft.pts[1] = p;
      redraw();
    });
    const finish = (commit: boolean) => {
      if (draft && commit && isMeaningful(draft)) this.shapes.push(draft);
      draft = null;
      redraw();
      sync();
    };
    canvas.addEventListener('pointerup', e => {
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* já liberado */ }
      finish(true);
    });
    canvas.addEventListener('pointercancel', () => finish(false));

    layer.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.reset(); this.render(); this.restoreFocus(); return; }
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doUndo(); return; }
      if (e.key === 'Enter' && e.target === layer) { e.preventDefault(); void this.choose(); }
    });
    layer.append(frame, canvas, tools);
    queueMicrotask(() => layer.focus());
    return layer;
  }

  private renderSheet(): HTMLElement {
    const t = this.t;
    const backdrop = h('div', { class: 'backdrop' });
    const sheet = h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'fox-title', tabindex: '-1' });
    sheet.style.bottom = `${this.kb}px`;
    backdrop.append(sheet);
    if (this.phase === 'sent') {
      const content = h('div', { class: 'sent' }, h('div', { class: 'sent-icon' }, icon(ICON_CHECK)), h('strong', {}, t.sentTitle), h('span', {}, t.sentBody));
      const url = this.sentResult?.url;
      void url;
      sheet.append(content);
      const close = h('button', { type: 'button', class: 'close-btn' }, t.close);
      close.addEventListener('click', () => { this.reset(); this.render(); this.restoreFocus(); });
      sheet.append(close);
      queueMicrotask(() => sheet.focus());
      return backdrop;
    }
    const sending = this.phase === 'sending';
    const x = h('button', { type: 'button', class: 'x', 'aria-label': t.cancel, disabled: sending }, icon(ICON_X));
    x.addEventListener('click', () => { this.reset(); this.render(); this.restoreFocus(); });
    sheet.append(h('header', {}, h('h2', { id: 'fox-title' }, t.title), x));
    sheet.append(h('img', { class: 'preview', src: this.region, alt: t.previewAlt }));
    const again = h('button', { type: 'button', class: 'link', disabled: sending }, t.anotherArea);
    again.addEventListener('click', () => { this.rect = null; this.go('select'); });
    sheet.append(again, h('label', { for: 'fox-text' }, t.descriptionLabel));
    const ta = h('textarea', { id: 'fox-text', rows: 4, placeholder: t.descriptionPlaceholder, 'aria-required': 'true' });
    ta.value = this.text;
    ta.disabled = sending;
    sheet.append(ta);
    const sendBtn = h('button', { type: 'button', class: 'send' }, sending ? t.sending : t.send);
    const sync = () => { sendBtn.disabled = sending || !this.text.trim(); };
    ta.addEventListener('input', () => { this.text = ta.value; sync(); });
    const types = this.o.types ?? DEFAULT_TYPES;
    if (types.length) {
      const chips = h('fieldset', { class: 'chips' }, h('legend', {}, t.typesLabel));
      for (const name of types) {
        const chosen = this.chosen.includes(name);
        const b = h('button', { type: 'button', 'aria-pressed': String(chosen), class: chosen ? 'is-on' : '', disabled: sending }, name);
        b.addEventListener('click', () => {
          this.chosen = this.chosen.includes(name) ? this.chosen.filter(v => v !== name) : [...this.chosen, name];
          const on = this.chosen.includes(name);
          b.className = on ? 'is-on' : '';
          b.setAttribute('aria-pressed', String(on));
        });
        chips.append(b);
      }
      sheet.append(chips);
    }
    if (this.error) sheet.append(h('p', { class: 'error', role: 'alert' }, this.error));
    // ---- anexo opcional do usuário (documento, zip, log…)
    const maxAttachment = this.o.maxAttachmentBytes ?? 10 * 1024 * 1024;
    const attachRow = h('div', { class: 'attach' });
    const fileInput = h('input', { type: 'file', id: 'fox-attach', class: 'attach-input', 'aria-label': t.attach, disabled: sending });
    const drawAttach = (note = '') => {
      attachRow.replaceChildren(fileInput);
      attachRow.append(h('label', { class: 'attach-btn', for: 'fox-attach' }, this.attachment ? this.attachment.name : t.attach));
      if (this.attachment) {
        const clear = h('button', { type: 'button', class: 'attach-clear', 'aria-label': t.attachedClear, disabled: sending }, icon(ICON_X));
        clear.addEventListener('click', () => { this.attachment = null; fileInput.value = ''; drawAttach(); });
        attachRow.append(h('span', { class: 'attach-size' }, fmtSize(this.attachment.size)), clear);
      }
      if (note) attachRow.append(h('span', { class: 'attach-note', role: 'alert' }, note));
    };
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      if (file.size > maxAttachment) {
        this.attachment = null;
        fileInput.value = '';
        drawAttach(t.attachmentTooLarge.replace('{max}', fmtSize(maxAttachment)));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') { drawAttach(t.sendFailed); return; }
        this.attachment = { name: file.name, type: file.type || 'application/octet-stream', size: file.size, dataUrl: reader.result };
        drawAttach();
      };
      reader.onerror = () => drawAttach(t.sendFailed);
      reader.readAsDataURL(file);
    });
    drawAttach();
    sheet.append(attachRow);
    sendBtn.addEventListener('click', () => void this.send());
    sync();
    sheet.append(sendBtn);
    sheet.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (!sending) { this.reset(); this.render(); this.restoreFocus(); }
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => !(n as HTMLButtonElement).disabled);
      if (!items.length) return;
      const active = this.root?.activeElement, first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (active === first || active === sheet)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    });
    queueMicrotask(() => { if (!sending) sheet.focus(); });
    return backdrop;
  }
}

/**
 * Cria o reporter. Não mostra nada até `enabled` ser verdadeiro.
 * Também é seguro chamar no SSR: devolve uma instância inerte sem `window`.
 */
export function createFoxReport(options: FoxReportOptions): FoxReportInstance {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { open() {}, close() {}, setEnabled() {}, isEnabled: () => false, destroy() {} };
  }
  return new FoxReport(options);
}
