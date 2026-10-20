import type { CleanReport, EneReportHandler, EneReportServerOptions } from './types';
import { MondayClient, MondayError, type Provisioned } from './monday';
import { cleanContext, decodePng, text } from './util';

const MB = 1024 * 1024;
const DEFAULTS = { maxBodyBytes: 25 * MB, maxImageBytes: 10 * MB, maxDescription: 4000 };
const json = (status: number, body: unknown, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra },
  });
const fail = (status: number, error: string, message: string, extra?: Record<string, string>) => json(status, { error, message }, extra);

/**
 * Cria o handler `(req: Request) => Promise<Response>` para a rota do app que
 * recebe o relato e o encaminha ao Monday. O token nunca chega ao navegador.
 */
export function createEneReportHandler(options: EneReportServerOptions): EneReportHandler {
  if (!options?.token) throw new Error('createEneReportHandler: informe o token de API do Monday em `token`.');
  const o = { ...DEFAULTS, ...options };
  const project = (o.project ?? 'Geral').trim().slice(0, 120) || 'Geral';
  const boardPrefix = o.boardPrefix ?? '';
  const rate = o.rateLimit === false ? null : { max: 10, windowMs: 60_000, ...(o.rateLimit ?? {}) };
  const hits = new Map<string, number[]>();
  const logger = o.logger ?? (() => {});
  const client = new MondayClient({
    token: o.token,
    workspaceId: o.workspaceId ?? '18101704',
    boardPrefix,
    apiUrl: o.apiUrl ?? 'https://api.monday.com/v2',
    fileApiUrl: o.fileApiUrl ?? 'https://api.monday.com/v2/file',
    fetch: o.fetch ?? ((...args) => fetch(...args)),
    logger,
  });
  const boardNameFor = (name: string) => `${boardPrefix}${name}`;
  const provisionings = new Map<string, Promise<Provisioned>>();
  const ready = (name: string) => {
    let provisioning = provisionings.get(name);
    if (!provisioning) {
      provisioning = client.ensureBoard(boardNameFor(name)).catch(error => { provisionings.delete(name); throw error; });
      provisionings.set(name, provisioning);
    }
    return provisioning;
  };

  const allowedOrigin = (origin: string | null, url: URL) => {
    if (!origin) return true;
    try { if (new URL(origin).host === url.host) return true; } catch { return false; }
    const allowed = o.allowedOrigins;
    if (allowed === '*') return true;
    if (typeof allowed === 'function') return Boolean(allowed(origin));
    return Array.isArray(allowed) && allowed.includes(origin);
  };
  const corsHeaders = (origin: string | null, url: URL): Record<string, string> => {
    if (!origin || !allowedOrigin(origin, url)) return {};
    return {
      'access-control-allow-origin': origin,
      vary: 'Origin',
      'access-control-allow-methods': 'POST,OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
    };
  };
  const limited = (key: string) => {
    if (!rate) return false;
    const now = Date.now(), cutoff = now - rate.windowMs;
    const list = (hits.get(key) ?? []).filter(t => t > cutoff);
    if (list.length >= rate.max) { hits.set(key, list); return true; }
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some(t => t > cutoff)) hits.delete(k);
    return false;
  };

  async function readJsonBody(req: Request): Promise<{ body?: Record<string, unknown>; error?: Response }> {
    const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json') return { error: fail(415, 'unsupported_media_type', 'Envie application/json.') };
    const declared = Number(req.headers.get('content-length') ?? 0);
    if (declared > o.maxBodyBytes) return { error: fail(413, 'too_large', 'O relato é grande demais.') };
    if (!req.body) return { error: fail(400, 'bad_json', 'Corpo vazio.') };
    const reader = req.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > o.maxBodyBytes) {
        try { await reader.cancel(); } catch { /* já fechado */ }
        return { error: fail(413, 'too_large', 'O relato é grande demais.') };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    try {
      const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
      return { body: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {} };
    } catch {
      return { error: fail(400, 'bad_json', 'O corpo não é JSON válido.') };
    }
  }

  async function create(req: Request, url: URL): Promise<Response> {
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
    if (limited(`ip:${ip}`)) {
      return fail(429, 'rate_limited', 'Muitos relatos em pouco tempo. Tente novamente em um minuto.', {
        'retry-after': String(Math.ceil((rate?.windowMs ?? 60_000) / 1000)),
      });
    }
    const { body, error } = await readJsonBody(req);
    if (error) return error;
    const description = text(body!.description, o.maxDescription).trim();
    if (!description) return fail(400, 'description_required', 'Descreva o que está errado ou faltando.');
    const region = decodePng(body!.region, o.maxImageBytes);
    const full = decodePng(body!.full, o.maxImageBytes);
    if (!region || !full) return fail(400, 'images_required', 'As capturas estão ausentes, grandes demais ou não são PNG.');

    const types = (Array.isArray(body!.types) ? body!.types : []).slice(0, 8).map(value => text(value, 40).trim()).filter(Boolean);
    const reportProject = text(body!.project, 120).trim() || project;
    const now = new Date().toISOString();
    const capturedAt = /^\d{4}-\d{2}-\d{2}T/.test(text(body!.context && (body!.context as Record<string, unknown>).capturedAt, 40))
      ? text((body!.context as Record<string, unknown>).capturedAt, 40)
      : now;
    const report: CleanReport = {
      description,
      types,
      project: reportProject,
      reporter: text(body!.reporter, 120).trim(),
      capturedAt,
      context: cleanContext(body!.context, o.redactParams),
    };

    const provisioned = await ready(reportProject);
    const item = await client.createItem(provisioned, report);
    let attachments = { region: false, full: false };
    if (item.updateId) {
      attachments = {
        region: await client.attach(item.updateId, 'region.png', region),
        full: await client.attach(item.updateId, 'full.png', full),
      };
    }
    try { o.onReport?.({ itemId: item.itemId, boardId: provisioned.boardId, updateId: item.updateId }); } catch (e) { logger('onReport', String((e as Error)?.message ?? e)); }
    return json(201, {
      id: item.itemId,
      ...(item.url ? { url: item.url } : {}),
      boardId: provisioned.boardId,
      updateId: item.updateId,
      attachments,
    });
  }

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('origin');
    const cors = corsHeaders(origin, url);
    const withCors = (res: Response) => { for (const [k, v] of Object.entries(cors)) res.headers.set(k, v); return res; };
    try {
      if (req.method === 'OPTIONS') return origin && !allowedOrigin(origin, url) ? new Response(null, { status: 403 }) : new Response(null, { status: 204, headers: cors });
      if (origin && !allowedOrigin(origin, url)) return fail(403, 'origin_not_allowed', 'Esta origem não está autorizada.');
      if (req.method !== 'POST') return withCors(fail(405, 'method_not_allowed', 'Use POST.', { allow: 'POST, OPTIONS' }));
      return withCors(await create(req, url));
    } catch (e) {
      logger('handler', String((e as Error)?.stack ?? e));
      if (e instanceof MondayError) {
        return withCors(json(502, { error: 'monday_error', message: 'Não foi possível registrar o relato no Monday.', detail: e.message }));
      }
      return withCors(fail(500, 'server_error', 'Algo deu errado ao enviar o relato.'));
    }
  }

  const handler = handle as EneReportHandler;
  handler.ready = async (name?: string) => {
    const provisioned = await ready((name ?? project).trim() || project);
    return {
      boardId: provisioned.boardId,
      boardUrl: provisioned.accountSlug ? `https://${provisioned.accountSlug}.monday.com/boards/${provisioned.boardId}` : null,
    };
  };
  return handler;
}
