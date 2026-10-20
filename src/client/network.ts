import { redactUrl } from './context';
import type { NetworkEntry } from './types';

type RecorderOptions = { bodies: boolean; limit: number; windowMs: number };
type Stored = NetworkEntry & { time: number };

const BODY_MAX = 2000;
const HEADER_MAX = 20;
const HEADER_NAME_MAX = 60;
const HEADER_VALUE_MAX = 200;
const TEXTUAL = /json|text|xml|graphql|x-www-form-urlencoded/i;
/** Nomes de header que nunca são enviados com o valor real. */
const SENSITIVE = /(authorization|cookie|token|secret|password|api[-_]?key|^key$|session|signature|^sig$|^auth)/i;
let entries: Stored[] = [];
let stop: (() => void) | null = null;

const clip = (value: string) => value.slice(0, BODY_MAX);
const toText = (body: unknown): string | undefined => {
  try {
    if (typeof body === 'string') return clip(body);
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) return clip(body.toString());
  } catch { /* corpo ilegível */ }
  return undefined;
};

/** Normaliza Headers/pares/array/objeto em objeto simples, com redação de nomes sensíveis.
    Duck-typing de propósito: instanceof Headers falha entre realms (vitest/jsdom, iframes). */
function collectHeaders(source: unknown): Record<string, string> | undefined {
  try {
    const out: Record<string, string> = {};
    let count = 0;
    const put = (name: string, value: string) => {
      const key = name.toLowerCase().slice(0, HEADER_NAME_MAX);
      out[key] = SENSITIVE.test(key) ? '[redacted]' : String(value).slice(0, HEADER_VALUE_MAX);
      count++;
    };
    // pares [nome, valor] primeiro (arrays têm .entries/.forEach também)
    if (Array.isArray(source)) {
      for (const pair of source) if (Array.isArray(pair) && pair.length >= 2) put(String(pair[0]), String(pair[1]));
    } else if (source && typeof (source as Headers).get === 'function' && typeof (source as Headers).has === 'function' && typeof (source as Headers).forEach === 'function') {
      // Headers reais (get/has/forEach); nunca um array simples
      for (const [name, value] of (source as Headers).entries()) put(name, value);
    } else if (source && typeof source === 'object') {
      for (const [name, value] of Object.entries(source as Record<string, unknown>)) {
        if (typeof value === 'string' || typeof value === 'number') put(name, String(value));
      }
    }
    if (!count) return undefined;
    const limited: Record<string, string> = {};
    for (const key of Object.keys(out).slice(0, HEADER_MAX)) limited[key] = out[key];
    return limited;
  } catch { return undefined; }
}

function parseRawHeaders(raw: string): Record<string, string> | undefined {
  try {
    if (!raw) return undefined;
    const pairs: [string, string][] = [];
    for (const line of raw.split(/\r?\n/)) {
      const at = line.indexOf(':');
      if (at > 0) pairs.push([line.slice(0, at), line.slice(at + 1).trim()]);
    }
    return collectHeaders(pairs);
  } catch { return undefined; }
}

function add(entry: Omit<NetworkEntry, 'at'>, opts: RecorderOptions): Stored | null {
  try {
    const now = Date.now();
    const stored: Stored = { ...entry, at: new Date(now).toISOString(), time: now };
    entries = entries.filter(e => now - e.time <= opts.windowMs);
    entries.push(stored);
    if (entries.length > opts.limit) entries = entries.slice(-opts.limit);
    return stored;
  } catch { return null; }
}

/**
 * Instrumenta `fetch` e `XMLHttpRequest`. É um singleton de módulo; o retorno
 * restaura as APIs originais. Nunca lança: falhas de coleta não afetam a página.
 */
export function startNetworkRecorder(options: Partial<RecorderOptions> = {}): () => void {
  if (typeof window === 'undefined' || stop) return stop ?? (() => {});
  const opts: RecorderOptions = { bodies: false, limit: 50, windowMs: 120_000, ...options };

  const originalFetch = window.fetch;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const started = Date.now();
    const url = redactUrl(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const requestHeaders = collectHeaders(input instanceof Request ? input.headers : init?.headers);
    const requestBody = opts.bodies ? toText(init?.body) : undefined;
    try {
      const response = await originalFetch(input, init);
      const responseHeaders = collectHeaders(response.headers);
      const entry = add({
        method, url, status: response.status, durationMs: Date.now() - started, type: 'fetch',
        ...(requestHeaders ? { requestHeaders } : {}),
        ...(responseHeaders ? { responseHeaders } : {}),
        ...(requestBody ? { requestBody } : {}),
      }, opts);
      const type = response.headers.get('content-type') ?? '';
      if (opts.bodies && entry && TEXTUAL.test(type)) {
        response.clone().text().then(text => { entry.responseBody = clip(text); }).catch(() => { /* corpo indisponível */ });
      }
      return response;
    } catch (error) {
      add({
        method, url, status: null, durationMs: Date.now() - started, type: 'fetch',
        ...(requestHeaders ? { requestHeaders } : {}),
        ...(requestBody ? { requestBody } : {}),
        error: String((error as Error)?.message ?? error).slice(0, 200),
      }, opts);
      throw error;
    }
  }) as typeof fetch;

  const proto = window.XMLHttpRequest?.prototype;
  let originalOpen: XMLHttpRequest['open'] | null = null;
  let originalSend: XMLHttpRequest['send'] | null = null;
  let originalSetHeader: XMLHttpRequest['setRequestHeader'] | null = null;
  const meta = new WeakMap<XMLHttpRequest, { method: string; url: string; started: number; headers: [string, string][] }>();
  if (proto) {
    originalOpen = proto.open;
    originalSend = proto.send;
    originalSetHeader = proto.setRequestHeader;
    proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      try { meta.set(this, { method: String(method).toUpperCase(), url: redactUrl(String(url)), started: 0, headers: [] }); } catch { /* segue o fluxo */ }
      return (originalOpen as Function).apply(this, [method, url, ...rest]);
    } as XMLHttpRequest['open'];
    proto.setRequestHeader = function (this: XMLHttpRequest, name: string, value: string) {
      try { meta.get(this)?.headers.push([String(name), String(value)]); } catch { /* segue o fluxo */ }
      return (originalSetHeader as Function).apply(this, [name, value]);
    } as XMLHttpRequest['setRequestHeader'];
    proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const info = meta.get(this) ?? { method: 'GET', url: '', started: 0, headers: [] as [string, string][] };
      info.started = Date.now();
      const requestHeaders = collectHeaders(info.headers);
      const requestBody = opts.bodies ? toText(body) : undefined;
      try {
        this.addEventListener('loadend', () => {
          try {
            const failed = this.status === 0;
            const type = this.getResponseHeader('content-type') ?? '';
            const responseHeaders = parseRawHeaders(this.getAllResponseHeaders());
            const entry = add({
              method: info.method, url: info.url, status: this.status || null, durationMs: Date.now() - info.started, type: 'xhr',
              ...(requestHeaders ? { requestHeaders } : {}),
              ...(responseHeaders ? { responseHeaders } : {}),
              ...(requestBody ? { requestBody } : {}),
              ...(failed ? { error: 'Falha de rede ou requisição abortada' } : {}),
            }, opts);
            if (opts.bodies && entry && !failed && TEXTUAL.test(type) && (this.responseType === '' || this.responseType === 'text')) {
              entry.responseBody = clip(this.responseText);
            }
          } catch { /* nunca quebra a requisição */ }
        });
      } catch { /* segue o fluxo */ }
      return (originalSend as Function).apply(this, [body]);
    } as XMLHttpRequest['send'];
  }

  stop = () => {
    try {
      window.fetch = originalFetch;
      if (proto && originalOpen) proto.open = originalOpen;
      if (proto && originalSend) proto.send = originalSend;
      if (proto && originalSetHeader) proto.setRequestHeader = originalSetHeader;
    } catch { /* restauração best-effort */ }
    stop = null;
    entries = [];
  };
  return stop;
}

export const recentNetwork = (windowMs = 120_000): NetworkEntry[] => {
  const now = Date.now();
  return entries
    .filter(e => now - e.time <= windowMs)
    .map(({ time, ...entry }) => { void time; return entry; });
};

export const resetNetwork = () => { entries = []; };
