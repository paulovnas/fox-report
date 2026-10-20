import { describe, expect, it, vi } from 'vitest';
import { createBoardTemplate, createFoxReportHandler } from '../../src/server/index';
import type { FoxReportServerOptions } from '../../src/server/types';
import { createMondayMock, PNG, reportBody } from './monday-mock';

const endpoint = 'https://app.ene.com/api/fox-report';
const makeHandler = (extra: Partial<FoxReportServerOptions> = {}) => {
  const mock = createMondayMock();
  mock.seedBoard('501', 'Portal eNe');
  const handler = createFoxReportHandler({ token: 'token-secreto', boardId: '501', fetch: mock.fetchMock, logger: () => {}, ...extra });
  return { handler, mock };
};
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('createFoxReportHandler', () => {
  it('usa o board informado (nunca cria board), garante colunas/grupos e cria item na Esteira', async () => {
    const { handler, mock } = makeHandler();
    const res = await handler(post(reportBody()));
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; url: string; boardId: string; updateId: string; attachments: Record<string, boolean> };
    expect(body).toMatchObject({ id: 'item_1', boardId: '501', updateId: 'update_1', attachments: { region: true, full: true, zip: true } });
    expect(body.url).toBe('https://ene.monday.com/boards/501/pulses/item_1');

    // board NUNCA é criado; colunas e grupos sim (idempotente)
    expect(mock.calls.createBoard).toEqual([]);
    expect(mock.calls.createColumn).toHaveLength(11);
    expect(mock.calls.createColumn).toEqual(expect.arrayContaining(['Status', 'Tipo', 'Página', 'Capturado em', 'Console', 'Requests']));
    expect(mock.calls.createGroup.map(g => g.name)).toEqual(['Histórico', 'Esteira']);
    expect(mock.calls.deleteGroup).toEqual([]);

    const [item] = mock.calls.createItem;
    expect(item.name).toBe('O total do pedido aparece vazio.');
    expect(item.boardId).toBe('501');
    expect(item.groupId).toBe('group_Esteira');
    expect(item.values).toMatchObject({
      col_Status: { label: 'Novo' },
      col_Tipo: { label: 'Bug' },
      col_Projeto: 'Portal eNe',
      col_Reporter: 'user:ana',
      col_App: 'Portal eNe',
      col_Console: 1,
      col_Requests: 2,
    });
    expect(item.values.col_Página).toEqual({ url: 'https://app.ene.com/pedidos?token=%5Bredacted%5D', text: 'Pedidos' });
    expect(item.values.col_Capturado_em).toEqual({ date: '2026-10-20' });

    const [update] = mock.calls.createUpdate;
    expect(update).toContain('<strong>Relato</strong>');
    expect(update).toContain('O total do pedido aparece vazio.');
    expect(update).toContain('<strong>Console (1)</strong>');
    expect(update).toContain('TypeError: x is undefined');
    expect(update).toContain('GET /api/pedidos');
    expect(update).toContain('<strong>Metadados do app</strong>');
    expect(update).toContain('"version": "2.3.0"');
    expect(update).not.toContain('## ');
    expect(update).not.toContain('**Tipos:**');

    expect(mock.calls.uploads).toHaveLength(3);
    expect(mock.calls.uploads.map(u => u.filename)).toEqual(['region.png', 'full.png', `fox-report-item_1.zip`]);
  });

  it('reaproveita o mesmo board sem recriar colunas/grupos no segundo relato', async () => {
    const { handler, mock } = makeHandler();
    expect((await handler(post(reportBody()))).status).toBe(201);
    expect((await handler(post(reportBody({ description: 'Segundo relato do mesmo board.' })))).status).toBe(201);
    expect(mock.calls.createBoard).toEqual([]);
    expect(mock.calls.createColumn).toHaveLength(11);
    expect(mock.calls.createGroup).toHaveLength(2);
    expect(mock.calls.createItem).toHaveLength(2);
  });

  it('devolve 502 com mensagem clara quando o board não existe', async () => {
    const { handler, mock } = makeHandler();
    const lost = createFoxReportHandler({ token: 'token-secreto', boardId: '999', fetch: mock.fetchMock, logger: () => {} });
    const res = await lost(post(reportBody()));
    expect(res.status).toBe(502);
    expect((await res.json()).detail).toContain('999');
    expect(mock.calls.createBoard).toEqual([]);
  });

  it('aceita anexo do usuário: grava no zip e anexa o arquivo ao update', async () => {
    const { handler, mock } = makeHandler();
    const attachment = { name: 'logs/app - erro.log', type: 'text/plain', size: 11, dataUrl: 'data:text/plain;base64,' + Buffer.from('hello world').toString('base64') };
    const res = await handler(post(reportBody({ attachment })));
    expect(res.status).toBe(201);
    const body = await res.json() as { attachments: Record<string, boolean> };
    expect(body.attachments).toMatchObject({ region: true, full: true, zip: true, attachment: true });

    // 4 arquivos: 2 capturas + zip + anexo do usuário (nome sanitizado, sem caminho)
    expect(mock.calls.uploads.map(u => u.filename)).toEqual([
      'region.png',
      'full.png',
      expect.stringContaining('fox-report-item_1.zip'),
      'app - erro.log',
    ]);
  });

  it('rejeita anexo corrompido ou acima do limite', async () => {
    const { handler, mock } = makeHandler({ maxAttachmentBytes: 10 });
    const bad = await handler(post(reportBody({ attachment: { name: 'a.txt', type: 'text/plain', size: 5, dataUrl: 'data:text/plain;base64,!!!!' } })));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('attachment_invalid');

    const big = await handler(post(reportBody({ attachment: { name: 'a.txt', type: 'text/plain', size: 999, dataUrl: 'data:text/plain;base64,' + Buffer.from('x'.repeat(50)).toString('base64') } })));
    expect(big.status).toBe(400);
    expect(mock.calls.createItem).toHaveLength(0);
  });

  it('payload sem anexo funciona igual (zip só com o padrão)', async () => {
    const { handler, mock } = makeHandler();
    const res = await handler(post(reportBody()));
    expect(res.status).toBe(201);
    const body = await res.json() as { attachments: Record<string, boolean> };
    expect(body.attachments).toMatchObject({ region: true, full: true, zip: true });
    expect(body.attachments.attachment).toBeUndefined();
    expect(mock.calls.uploads).toHaveLength(3);
  });

  it('usa o projeto padrão para a coluna quando o relato não envia project', async () => {
    const { handler, mock } = makeHandler({ project: 'App Interno' });
    await handler(post(reportBody({ project: undefined })));
    expect(mock.calls.createItem[0].values.col_Projeto).toBe('App Interno');
  });

  it('redige URLs no servidor, inclusive network, e aceita parâmetros extras', async () => {
    const { handler, mock } = makeHandler({ redactParams: ['cpf'] });
    const body = reportBody();
    const context = body.context as { url: string; network: Record<string, unknown>[] };
    context.url = 'https://app.ene.com/pedidos?token=x&password=y&cpf=123&id=7';
    context.network[0].url = '/api/pedidos?api_key=abc&status=aberto';
    context.network[0].requestHeaders = { authorization: 'Bearer segredo', 'content-type': 'application/json' };
    context.network[0].responseHeaders = { 'set-cookie': 'sessao=1', 'content-type': 'application/json' };
    const res = await handler(post(body));
    expect(res.status).toBe(201);

    const link = mock.calls.createItem[0].values.col_Página;
    expect(link).toMatchObject({ url: 'https://app.ene.com/pedidos?token=%5Bredacted%5D&password=%5Bredacted%5D&cpf=%5Bredacted%5D&id=7' });
    const update = mock.calls.createUpdate[0];
    expect(update).toContain('token=%5Bredacted%5D');
    expect(update).toContain('password=%5Bredacted%5D');
    expect(update).toContain('cpf=%5Bredacted%5D');
    expect(update).toContain('api_key=%5Bredacted%5D');
    expect(update).not.toContain('token=x');
    expect(update).not.toContain('password=y');
    expect(update).not.toContain('cpf=123');
    expect(update).not.toContain('api_key=abc');
  });

  it('valida descrição, imagens e content-type', async () => {
    const { handler } = makeHandler();
    const noDescription = await handler(post(reportBody({ description: '   ' })));
    expect(noDescription.status).toBe(400);
    expect((await noDescription.json()).error).toBe('description_required');

    const badImage = await handler(post(reportBody({ region: 'data:image/png;base64,AAAA' })));
    expect(badImage.status).toBe(400);
    expect((await badImage.json()).error).toBe('images_required');

    const wrongType = await handler(new Request(endpoint, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' }));
    expect(wrongType.status).toBe(415);

    const wrongMethod = await handler(new Request(endpoint));
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get('allow')).toContain('POST');
  });

  it('rejeita corpo acima do limite', async () => {
    const { handler } = makeHandler({ maxBodyBytes: 50 });
    const res = await handler(new Request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '1000' }, body: '{}' }));
    expect(res.status).toBe(413);
  });

  it('limita relatos por IP e devolve retry-after', async () => {
    const { handler } = makeHandler({ rateLimit: { max: 1, windowMs: 60_000 } });
    expect((await handler(post(reportBody()))).status).toBe(201);
    const res = await handler(post(reportBody()));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });

  it('controla CORS por origem', async () => {
    const { handler } = makeHandler({ allowedOrigins: ['https://app.ene.com'] });
    const preflight = await handler(new Request(endpoint, { method: 'OPTIONS', headers: { origin: 'https://app.ene.com' } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://app.ene.com');

    const blocked = await handler(post(reportBody(), { origin: 'https://malicioso.dev' }));
    expect(blocked.status).toBe(403);
  });

  it('devolve 502 sem vazar o token quando o Monday falha', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'board não encontrado' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const handler = createFoxReportHandler({ token: 'token-secreto', boardId: '501', fetch: fetchMock as unknown as typeof fetch, logger: () => {} });
    const res = await handler(post(reportBody()));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain('monday_error');
    expect(text).toContain('board não encontrado');
    expect(text).not.toContain('token-secreto');
  });

  it('ready() garante colunas/grupos do board sem criar nada', async () => {
    const { handler, mock } = makeHandler();
    const ready = await handler.ready();
    expect(ready).toEqual({ boardId: '501', boardUrl: 'https://ene.monday.com/boards/501' });
    expect(mock.calls.createBoard).toEqual([]);
    expect(mock.calls.createColumn).toHaveLength(11);
    expect(mock.calls.createGroup.map(g => g.name)).toEqual(['Histórico', 'Esteira']);
  });

  it('exige boardId na criação', () => {
    const mock = createMondayMock();
    expect(() => createFoxReportHandler({ token: 't', fetch: mock.fetchMock } as unknown as Parameters<typeof createFoxReportHandler>[0])).toThrow('boardId');
  });
});

describe('createBoardTemplate', () => {
  it('cria o board template idempotente com grupos e colunas do padrão', async () => {
    const mock = createMondayMock();
    const first = await createBoardTemplate({ token: 't', workspaceId: '18101704', fetch: mock.fetchMock });
    expect(first).toEqual({ boardId: '501', boardUrl: 'https://ene.monday.com/boards/501' });
    expect(mock.calls.createBoard).toEqual([{ name: 'Fox Report — Template' }]);
    expect(mock.calls.createColumn).toHaveLength(11);
    expect(mock.calls.createGroup.map(g => g.name)).toEqual(['Histórico', 'Esteira']);
    const second = await createBoardTemplate({ token: 't', workspaceId: '18101704', fetch: mock.fetchMock });
    expect(second.boardId).toBe('501');
    expect(mock.calls.createBoard).toHaveLength(1);
  });
});

describe('bundle (zip do relato)', () => {
  it('empacota jsons, capturas e anexo com o nome sanitizado', async () => {
    const { buildReportZip, bundleName } = await import('../../src/server/index');
    const { decodeAttachment } = await import('../../src/server/util');
    const mock = createMondayMock();
    const handler = createFoxReportHandler({ token: 't', boardId: '501', fetch: mock.fetchMock });
    void handler;
    const attachment = decodeAttachment({ name: 'pasta/relatório.zip', type: 'application/zip', dataUrl: 'data:application/zip;base64,' + Buffer.from('PK').toString('base64') }, 10 * 1024 * 1024);
    expect(attachment).not.toBe('invalid');
    expect(attachment).not.toBeNull();
    const zip = buildReportZip({
      itemId: '777',
      report: {
        description: 'd', types: ['Bug'], project: 'p', reporter: 'r', capturedAt: '2026-10-20T00:00:00Z',
        context: {
          url: 'https://x', title: 't', viewport: { w: 1, h: 1, dpr: 1 }, scroll: { x: 0, y: 0 }, region: null,
          userAgent: 'ua', language: 'pt-BR', capturedAt: '2026-10-20T00:00:00Z',
          elements: [], consoleErrors: [{ at: 'a', message: 'm' }],
          network: [{ at: 'a', method: 'GET', url: '/x', status: 200, durationMs: 1, type: 'fetch', requestHeaders: { authorization: '[redacted]' } }],
          metadata: { app: 'a' }, sdk: { name: '@foxtag/fox-report', version: '0.2.0' },
        },
      },
      region: new Uint8Array(PNG.length),
      full: new Uint8Array(PNG.length),
      ...(attachment !== 'invalid' && attachment !== null ? { attachment } : {}),
    });
    expect(bundleName('777')).toBe('fox-report-777.zip');
    // nomes presentes no zip (central directory, store method)
    const text = new TextDecoder().decode(zip);
    for (const name of ['report.json', 'network.json', 'console.json', 'metadata.json', 'region.png', 'full.png', 'anexo/relatório.zip']) {
      expect(text).toContain(name);
    }
    expect(zip[0]).toBe(0x50); // 'P' de PK\x03\x04
    expect(zip[1]).toBe(0x4b);
  });
});

describe('fixtures', () => {
  it('o PNG de teste é válido', () => {
    expect(PNG.startsWith('data:image/png;base64,')).toBe(true);
  });
});
