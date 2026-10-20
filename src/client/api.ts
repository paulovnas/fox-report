import type { ReportPayload, SendResult } from './types';

export type ApiConfig = { endpoint: string; fetch: typeof fetch };

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export const trimSlash = (s: string) => s.replace(/\/+$/, '');

export async function sendReport(config: ApiConfig, payload: ReportPayload): Promise<SendResult> {
  const res = await config.fetch(trimSlash(config.endpoint), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new ApiError(res.status, `Envio falhou com status ${res.status}`);
  const body = (await res.json()) as Partial<SendResult>;
  return { id: String(body.id ?? ''), ...(body.url ? { url: String(body.url) } : {}) };
}
