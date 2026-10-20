import { redactUrl } from './context';
import type { NetworkEntry } from './types';

type RecorderOptions = { bodies: boolean; limit: number; windowMs: number };
type Stored = NetworkEntry & { time: number };

const BODY_MAX = 500;
const TEXTUAL = /json|text|xml|graphql|x-www-form-urlencoded/i;
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
    const requestBody = opts.bodies ? toText(init?.body) : undefined;
    try {
      const response = await originalFetch(input, init);
      const entry = add({ method, url, status: response.status, durationMs: Date.now() - started, type: 'fetch', ...(requestBody ? { requestBody } : {}) }, opts);
      const type = response.headers.get('content-type') ?? '';
      if (opts.bodies && entry && TEXTUAL.test(type)) {
        response.clone().text().then(text => { entry.responseBody = clip(text); }).catch(() => { /* corpo indisponível */ });
      }
      return response;
    } catch (error) {
      add({ method, url, status: null, durationMs: Date.now() - started, type: 'fetch', error: String((error as Error)?.message ?? error).slice(0, 200), ...(requestBody ? { requestBody } : {}) }, opts);
      throw error;
    }
  }) as typeof fetch;

  const proto = window.XMLHttpRequest?.prototype;
  let originalOpen: XMLHttpRequest['open'] | null = null;
  let originalSend: XMLHttpRequest['send'] | null = null;
  const meta = new WeakMap<XMLHttpRequest, { method: string; url: string; started: number }>();
  if (proto) {
    originalOpen = proto.open;
    originalSend = proto.send;
    proto.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
      try { meta.set(this, { method: String(method).toUpperCase(), url: redactUrl(String(url)), started: 0 }); } catch { /* segue o fluxo */ }
      return (originalOpen as Function).apply(this, [method, url, ...rest]);
    } as XMLHttpRequest['open'];
    proto.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const info = meta.get(this) ?? { method: 'GET', url: '', started: 0 };
      info.started = Date.now();
      const requestBody = opts.bodies ? toText(body) : undefined;
      try {
        this.addEventListener('loadend', () => {
          try {
            const failed = this.status === 0;
            const type = this.getResponseHeader('content-type') ?? '';
            const entry = add({
              method: info.method, url: info.url, status: this.status || null, durationMs: Date.now() - info.started, type: 'xhr',
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
