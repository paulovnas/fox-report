import type { ConsoleEntry, ElementInfo, NetworkEntry, Rect, ReportContext } from './types';
import { SDK_VERSION } from './version';

const WINDOW_MS = 60_000;
let errors: { time: number; message: string }[] = [];
let uninstall: (() => void) | null = null;

const keep = (message: string) => {
  const now = Date.now();
  errors = errors.filter(e => now - e.time < WINDOW_MS).slice(-29);
  errors.push({ time: now, message: message.slice(0, 500) });
};
const show = (v: unknown): string => {
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
};

/** Registra erros de console e exceções não tratadas. Devolve a função que restaura tudo. */
export function installConsoleCapture(): () => void {
  if (uninstall || typeof window === 'undefined') return uninstall ?? (() => {});
  const original = console.error;
  console.error = (...args: unknown[]) => {
    try { keep(args.map(show).join(' ')); } catch { /* nunca quebra a página */ }
    original.apply(console, args as []);
  };
  const onError = (e: ErrorEvent) => keep(`${e.message}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`);
  const onRejection = (e: PromiseRejectionEvent) => keep(`Unhandled rejection: ${show(e.reason)}`);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  uninstall = () => {
    console.error = original;
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    uninstall = null;
  };
  return uninstall;
}

export const recentConsoleErrors = (): ConsoleEntry[] => {
  const now = Date.now();
  return errors.filter(e => now - e.time < WINDOW_MS).map(e => ({ at: new Date(e.time).toISOString(), message: e.message }));
};
export const resetConsoleErrors = () => { errors = []; };

const UI_SELECTOR = '[data-ene-ui]';
const isOwnUi = (el: Element) => Boolean(el.closest(UI_SELECTOR));

/** Nome do ancestral `data-*` mais próximo que identifica o componente. */
export function componentName(el: Element): string {
  for (let node: Element | null = el; node; node = node.parentElement) {
    for (const attr of ['data-component', 'data-screen', 'data-testid', 'data-slot']) {
      const v = node.getAttribute(attr);
      if (v) return `${attr.slice(5)}:${v}`;
    }
    const any = Array.from(node.attributes).find(a => a.name.startsWith('data-') && a.value && !a.name.startsWith('data-ene') && a.value.length < 60);
    if (any) return `${any.name.slice(5)}:${any.value}`;
  }
  return '';
}

export function domPath(el: Element): string {
  const parts: string[] = [];
  for (let node: Element | null = el; node && node !== document.body && parts.length < 6; node = node.parentElement) {
    const cls = (typeof node.className === 'string' ? node.className : '').split(/\s+/).filter(Boolean).slice(0, 2).map(c => `.${CSS_ESC(c)}`).join('');
    parts.unshift(`${node.tagName.toLowerCase()}${node.id ? `#${CSS_ESC(node.id)}` : ''}${cls}`);
  }
  return parts.join(' > ');
}
const CSS_ESC = (s: string) => (typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/[^\w-]/g, '\\$&'));

/** Elementos sob os pontos centrais da região, do mais específico para o mais genérico. */
export function describeElements(rect: Rect, maskSelector = ''): ElementInfo[] {
  const points = [[.5, .5], [.2, .2], [.8, .2], [.2, .8], [.8, .8]].map(([fx, fy]) => [rect.x + rect.w * fx, rect.y + rect.h * fy] as const);
  const seen = new Set<Element>(), out: ElementInfo[] = [];
  for (const [x, y] of points) {
    const stack = typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(x, y) : [];
    for (const el of stack) {
      if (el === document.documentElement || el === document.body || isOwnUi(el) || seen.has(el)) continue;
      seen.add(el);
      const masked = maskSelector ? safeMatches(el, maskSelector) : false;
      if (out.length < 8) out.push({ path: domPath(el), component: componentName(el), text: masked ? '' : (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) });
      break;
    }
  }
  return out;
}
function safeMatches(el: Element, selector: string): boolean {
  try { return Boolean(el.closest(selector)); } catch { return false; }
}

export const DEFAULT_REDACT = ['token', 'access_token', 'id_token', 'key', 'apikey', 'api_key', 'password', 'passwd', 'secret', 'auth', 'code', 'session', 'sid', 'jwt', 'signature', 'sig'];

/** Troca os valores dos parâmetros sensíveis por `[redacted]`. */
export function redactUrl(href: string, params: string[] = DEFAULT_REDACT): string {
  try {
    const relative = !/^[a-z][a-z0-9+.-]*:/i.test(href);
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost/';
    const u = new URL(href, relative ? base : undefined);
    const set = new Set(params.map(p => p.toLowerCase()));
    for (const k of Array.from(u.searchParams.keys())) if (set.has(k.toLowerCase())) u.searchParams.set(k, '[redacted]');
    return relative ? `${u.pathname}${u.search}${u.hash}` : u.toString();
  } catch { return href.slice(0, 1000); }
}

export function buildContext(opts: {
  region: Rect | null;
  metadata: Record<string, unknown>;
  includeConsole: boolean;
  maskSelector?: string;
  redactParams?: string[];
  network?: NetworkEntry[];
}): ReportContext {
  return {
    url: redactUrl(window.location.href, opts.redactParams),
    title: document.title.slice(0, 200),
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
    region: opts.region,
    userAgent: navigator.userAgent,
    language: navigator.language,
    capturedAt: new Date().toISOString(),
    elements: opts.region ? describeElements(opts.region, opts.maskSelector) : [],
    consoleErrors: opts.includeConsole ? recentConsoleErrors() : [],
    network: opts.network ?? [],
    metadata: opts.metadata,
    sdk: { name: '@ene/report', version: SDK_VERSION },
  };
}
