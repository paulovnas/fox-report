import { describe, expect, it, vi } from 'vitest';
import { createEneReportHandler } from '../../src/server/index';
import type { EneReportServerOptions } from '../../src/server/types';
import { createMondayMock, PNG, reportBody } from './monday-mock';

const endpoint = 'https://app.ene.com/api/ene-report';
const makeHandler = (extra: Partial<EneReportServerOptions> = {}) => {
  const mock = createMondayMock();
  const handler = createEneReportHandler({ token: 'token-secreto', fetch: mock.fetchMock, logger: () => {}, ...extra });
  return { handler, mock };
};
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('createEneReportHandler', () => {
  it('provisiona o board do projeto e cria item na Esteira, update e dois anexos', async () => {
    const { handler, mock } = makeHandler();
    const res = await handler(post(reportBody()));
    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; url: string; boardId: string; updateId: string; attachments: Record<string, boolean> };
    expect(body).toMatchObject({ id: 'item_1', boardId: '501', updateId: 'update_1', attachments: { region: true, full: true } });
    expect(body.url).toBe('https://ene.monday.com/boards/501/pulses/item_1');

    expect(mock.calls.createBoard).toEqual([{ name: 'Portal eNe' }]);
    expect(mock.calls.createColumn).toHaveLength(11);
    expect(mock.calls.createColumn).toEqual(expect.arrayContaining(['Status', 'Tipo', 'Página', 'Capturado em', 'Console', 'Requests']));
    // Histórico antes de Esteira; o grupo padrão do Monday é removido.
    expect(mock.calls.createGroup.map(g => g.name)).toEqual(['Histórico', 'Esteira']);
    expect(mock.calls.deleteGroup).toEqual([{ boardId: '501', groupId: 'group_default' }]);

    const [item] = mock.calls.createItem;
    expect(item.name).toBe('O total do pedido aparece vazio.');
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

    expect(mock.calls.uploads).toHaveLength(2);
    for (const query of mock.calls.uploads) expect(query).toContain('add_file_to_update(update_id: "update_1"');
  });

  it('reaproveita o mesmo board para o mesmo projeto e cria board separado para outro projeto', async () => {
    const { handler, mock } = makeHandler();
    expect((await handler(post(reportBody()))).status).toBe(201);
    expect((await handler(post(reportBody({ description: 'Segundo relato do mesmo projeto.' })))).status).toBe(201);
    expect((await handler(post(reportBody({ project: 'App Interno', description: 'Relato de outro projeto.' })))).status).toBe(201);
    expect(mock.calls.createBoard).toEqual([{ name: 'Portal eNe' }, { name: 'App Interno' }]);
    expect(mock.calls.createColumn).toHaveLength(22); // 11 por board
    expect(mock.calls.createItem.map(i => i.boardId)).toEqual(['501', '501', '502']);
    // Board reaproveitado não remove grupo de novo; cada board novo remove o seu default.
    expect(mock.calls.deleteGroup).toEqual([
      { boardId: '501', groupId: 'group_default' },
      { boardId: '502', groupId: 'group_default' },
    ]);
  });

  it('reaproveita board existente com o mesmo nome (sem criar outro)', async () => {
    const { handler, mock } = makeHandler();
    expect((await handler(post(reportBody()))).status).toBe(201);
    const sameHandler = createEneReportHandler({ token: 'token-secreto', fetch: mock.fetchMock, logger: () => {} });
    expect((await sameHandler(post(reportBody()))).status).toBe(201);
    expect(mock.calls.createBoard).toHaveLength(1);
    expect(mock.calls.createItem.map(i => i.boardId)).toEqual(['501', '501']);
  });

  it('usa o board do projeto padrão quando o relato não envia project', async () => {
    const { handler, mock } = makeHandler({ project: 'App Interno' });
    await handler(post(reportBody({ project: undefined })));
    expect(mock.calls.createBoard).toEqual([{ name: 'App Interno' }]);
    expect(mock.calls.createItem[0].values.col_Projeto).toBe('App Interno');
  });

  it('redige URLs no servidor, inclusive network, e aceita parâmetros extras', async () => {
    const { handler, mock } = makeHandler({ redactParams: ['cpf'] });
    const body = reportBody();
    body.context.url = 'https://app.ene.com/pedidos?token=x&password=y&cpf=123&id=7';
    body.context.network[0].url = '/api/pedidos?api_key=abc&status=aberto';
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
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ errors: [{ message: 'create_board não permitido' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const handler = createEneReportHandler({ token: 'token-secreto', fetch: fetchMock as unknown as typeof fetch, logger: () => {} });
    const res = await handler(post(reportBody()));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text).toContain('monday_error');
    expect(text).toContain('create_board não permitido');
    expect(text).not.toContain('token-secreto');
  });

  it('ready() provisiona o board do projeto antes do primeiro relato', async () => {
    const { handler, mock } = makeHandler();
    const ready = await handler.ready();
    expect(ready).toEqual({ boardId: '501', boardUrl: 'https://ene.monday.com/boards/501' });
    expect(mock.calls.createBoard).toEqual([{ name: 'Geral' }]);
    expect(mock.calls.createColumn).toHaveLength(11);
    const byProject = await handler.ready('Portal eNe');
    expect(byProject.boardId).toBe('502');
  });

  it('aplica boardPrefix no nome dos boards', async () => {
    const { handler, mock } = makeHandler({ boardPrefix: 'eNe Reports · ' });
    await handler(post(reportBody()));
    expect(mock.calls.createBoard).toEqual([{ name: 'eNe Reports · Portal eNe' }]);
  });
});

describe('createBoardTemplate', () => {
  it('cria o board template idempotente com grupos e colunas do padrão', async () => {
    const mock = createMondayMock();
    const { createBoardTemplate } = await import('../../src/server/index');
    const first = await createBoardTemplate({ token: 't', fetch: mock.fetchMock });
    expect(first).toEqual({ boardId: '501', boardUrl: 'https://ene.monday.com/boards/501' });
    expect(mock.calls.createBoard).toEqual([{ name: 'eNe Reports — Template' }]);
    expect(mock.calls.createColumn).toHaveLength(11);
    expect(mock.calls.createGroup.map(g => g.name)).toEqual(['Histórico', 'Esteira']);
    const second = await createBoardTemplate({ token: 't', fetch: mock.fetchMock });
    expect(second.boardId).toBe('501');
    expect(mock.calls.createBoard).toHaveLength(1);
  });
});

describe('fixtures', () => {
  it('o PNG de teste é válido', () => {
    expect(PNG.startsWith('data:image/png;base64,')).toBe(true);
  });
});
