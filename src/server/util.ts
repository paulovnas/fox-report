import type { CleanNetworkEntry, CleanReport } from './types';

export const PNG_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const DEFAULT_REDACT = ['token', 'access_token', 'id_token', 'key', 'apikey', 'api_key', 'password', 'passwd', 'secret', 'auth', 'code', 'session', 'sid', 'jwt', 'signature', 'sig'];

export const text = (value: unknown, max: number) => (typeof value === 'string' ? value : '').slice(0, max);

/**
 * Redige parâmetros sensíveis na URL. O servidor não confia na redação do cliente:
 * um POST direto no endpoint também precisa gravar URLs sem segredos.
 */
export function redactUrl(href: string, params: string[] = DEFAULT_REDACT): string {
  try {
    const relative = !/^[a-z][a-z0-9+.-]*:/i.test(href);
    const base = typeof location !== 'undefined' ? location.href : 'http://localhost/';
    const url = new URL(href, relative ? base : undefined);
    const sensitive = new Set(params.map(p => p.toLowerCase()));
    for (const key of Array.from(url.searchParams.keys())) {
      if (sensitive.has(key.toLowerCase())) url.searchParams.set(key, '[redacted]');
    }
    return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString();
  } catch { return href.slice(0, 1000); }
}

/** Lista final de parâmetros: default do SDK + extras configurados no servidor. */
export const redactList = (extra?: string[]): string[] => (extra?.length ? [...DEFAULT_REDACT, ...extra] : DEFAULT_REDACT);

/** Decodifica o data URL e confere assinatura + IHDR. Não confia no tipo declarado. */
export function decodePng(value: unknown, maxBytes: number): Uint8Array | null {
  if (typeof value !== 'string' || !value.startsWith(PNG_PREFIX)) return null;
  if (value.length > Math.ceil(maxBytes * 4 / 3) + PNG_PREFIX.length + 8) return null;
  let bytes: Uint8Array;
  try {
    const binary = atob(value.slice(PNG_PREFIX.length));
    bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  } catch { return null; }
  return isPng(bytes, maxBytes) ? bytes : null;
}

export function isPng(bytes: Uint8Array, maxBytes = 10 * 1024 * 1024): boolean {
  if (bytes.length < 33 || bytes.length > maxBytes) return false;
  for (let i = 0; i < PNG_SIGNATURE.length; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13) return false;
  if (String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]) !== 'IHDR') return false;
  const w = view.getUint32(16), h = view.getUint32(20);
  return w >= 1 && h >= 1 && w <= 16384 && h <= 16384;
}

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === '' || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const rect = (value: unknown) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  return { x: numberOrNull(r.x), y: numberOrNull(r.y), w: numberOrNull(r.w), h: numberOrNull(r.h) };
};

function cleanNetwork(value: unknown, redactParams: string[]): CleanNetworkEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 50).map(raw => {
    const entry = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const out: CleanNetworkEntry = {
      at: text(entry.at, 40),
      method: text(entry.method, 12).toUpperCase(),
      url: redactUrl(text(entry.url, 1000), redactParams),
      status: numberOrNull(entry.status),
      durationMs: numberOrNull(entry.durationMs) ?? 0,
      type: text(entry.type, 6) || 'fetch',
    };
    if (typeof entry.requestBody === 'string') out.requestBody = entry.requestBody.slice(0, 500);
    if (typeof entry.responseBody === 'string') out.responseBody = entry.responseBody.slice(0, 500);
    if (typeof entry.error === 'string') out.error = entry.error.slice(0, 200);
    return out;
  });
}

/** Mantém o contexto como objeto simples e limitado. */
export function cleanContext(raw: unknown, extraRedact?: string[]): CleanReport['context'] {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const redactParams = redactList(extraRedact);
  let metadata: Record<string, unknown> = {};
  if (obj.metadata && typeof obj.metadata === 'object' && !Array.isArray(obj.metadata)) {
    try {
      const json = JSON.stringify(obj.metadata);
      metadata = json.length <= 8192 ? JSON.parse(json) : { _dropped: 'metadata maior que 8 KB' };
    } catch { metadata = {}; }
  }
  const sdk = obj.sdk && typeof obj.sdk === 'object' ? obj.sdk as Record<string, unknown> : null;
  return {
    url: redactUrl(text(obj.url, 1000), redactParams),
    title: text(obj.title, 200),
    viewport: obj.viewport && typeof obj.viewport === 'object'
      ? { w: numberOrNull((obj.viewport as Record<string, unknown>).w), h: numberOrNull((obj.viewport as Record<string, unknown>).h), dpr: numberOrNull((obj.viewport as Record<string, unknown>).dpr) }
      : null,
    scroll: obj.scroll && typeof obj.scroll === 'object'
      ? { x: numberOrNull((obj.scroll as Record<string, unknown>).x), y: numberOrNull((obj.scroll as Record<string, unknown>).y) }
      : null,
    region: rect(obj.region),
    userAgent: text(obj.userAgent, 400),
    language: text(obj.language, 40),
    capturedAt: text(obj.capturedAt, 40),
    elements: (Array.isArray(obj.elements) ? obj.elements : []).slice(0, 12).map(e => {
      const el = e && typeof e === 'object' ? e as Record<string, unknown> : {};
      return { path: text(el.path, 300), component: text(el.component, 120), text: text(el.text, 160) };
    }),
    consoleErrors: (Array.isArray(obj.consoleErrors) ? obj.consoleErrors : []).slice(0, 20).map(e => {
      const entry = e && typeof e === 'object' ? e as Record<string, unknown> : {};
      return { at: text(entry.at, 40), message: text(entry.message, 500) };
    }),
    network: cleanNetwork(obj.network, redactParams),
    metadata,
    sdk: sdk && typeof sdk.name === 'string' ? { name: sdk.name.slice(0, 40), version: text(sdk.version, 20) } : null,
  };
}

/** Nome de board aceito pelo Monday, sem caracteres de controle. */
export function sanitizeName(project: string): string {
  const clean = project.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return clean || 'Geral';
}

export function isTextualType(value: string | null): boolean {
  return Boolean(value && /json|text|xml|graphql|x-www-form-urlencoded/i.test(value));
}
