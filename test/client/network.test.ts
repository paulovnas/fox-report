import { afterEach, describe, expect, it, vi } from 'vitest';
import { recentNetwork, resetNetwork, startNetworkRecorder } from '../../src/client/network';
import { flush } from './helpers';

let stop: (() => void) | null = null;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => {
  stop?.();
  stop = null;
  resetNetwork();
  vi.restoreAllMocks();
});

describe('network recorder', () => {
  it('registra requisições ok, 4xx e falhas de rede', async () => {
    const original = vi.fn()
      .mockResolvedValueOnce(json({ ok: 1 }))
      .mockResolvedValueOnce(json({ ok: 2 }))
      .mockResolvedValueOnce(json({ erro: 'não autorizado' }, 401))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));
    window.fetch = original as unknown as typeof fetch;
    stop = startNetworkRecorder({ limit: 10 });

    await window.fetch('/api/um?token=segredo');
    await window.fetch('/api/dois', { method: 'post' });
    await window.fetch('/api/tres').catch(() => {});
    await window.fetch('/api/quatro').catch(() => {});

    const entries = recentNetwork();
    expect(entries).toHaveLength(4);
    expect(entries[0].status).toBe(200);
    expect(entries[0].url).toContain('token=%5Bredacted%5D');
    expect(entries[1].method).toBe('POST');
    expect(entries[2].status).toBe(401);
    expect(entries[3].status).toBeNull();
    expect(entries[3].error).toContain('Failed to fetch');
  });

  it('só guarda corpos quando networkBodies está ligado, truncando em 2000', async () => {
    const longBody = 'x'.repeat(2500);
    window.fetch = vi.fn(async () => new Response(longBody, { status: 200, headers: { 'content-type': 'text/plain' } })) as unknown as typeof fetch;
    stop = startNetworkRecorder({ bodies: true, limit: 10 });
    await window.fetch('/api/texto', { method: 'POST', body: 'a'.repeat(2500) });
    await flush();
    const [entry] = recentNetwork();
    expect(entry.requestBody).toHaveLength(2000);
    expect(entry.responseBody).toHaveLength(2000);
  });

  it('captura headers de request/response e redige os sensíveis', async () => {
    window.fetch = vi.fn(async (_input, init) => new Response('{}', { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'sessao=1' } })) as unknown as typeof fetch;
    stop = startNetworkRecorder({ limit: 10 });
    await window.fetch('/api/com-headers', {
      method: 'POST',
      headers: { authorization: 'Bearer segredo', 'content-type': 'application/json', 'x-request-id': 'abc' },
      body: '{}',
    });
    await flush();
    const [entry] = recentNetwork();
    expect(entry.requestHeaders).toMatchObject({ authorization: '[redacted]', 'content-type': 'application/json', 'x-request-id': 'abc' });
    expect(entry.responseHeaders).toMatchObject({ 'set-cookie': '[redacted]', 'content-type': 'application/json' });
  });

  it('captura headers do XHR via setRequestHeader', async () => {
    window.fetch = vi.fn(async () => json({})) as unknown as typeof fetch;
    stop = startNetworkRecorder({ limit: 10 });
    const xhr = new window.XMLHttpRequest();
    const done = new Promise<void>(resolve => {
      xhr.addEventListener('loadend', () => setTimeout(resolve, 0));
    });
    xhr.open('GET', '/api/xhr');
    xhr.setRequestHeader('x-api-key', 'chave-secreta');
    xhr.send(null);
    await done;
    const entry = recentNetwork().find(e => e.type === 'xhr');
    expect(entry?.requestHeaders).toMatchObject({ 'x-api-key': '[redacted]' });
  });

  it('descarta entradas fora da janela e respeita o limite', async () => {
    window.fetch = vi.fn(async () => json({})) as unknown as typeof fetch;
    stop = startNetworkRecorder({ limit: 2, windowMs: 60_000 });
    await window.fetch('/a');
    await window.fetch('/b');
    await window.fetch('/c');
    expect(recentNetwork()).toHaveLength(2);
    expect(recentNetwork().map(e => e.url)).toEqual(['/b', '/c']);

    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 120_000);
    expect(recentNetwork(60_000)).toHaveLength(0);
  });

  it('restaura fetch no stop', () => {
    const original = window.fetch;
    stop = startNetworkRecorder();
    expect(window.fetch).not.toBe(original);
    stop();
    stop = null;
    expect(window.fetch).toBe(original);
  });
});
