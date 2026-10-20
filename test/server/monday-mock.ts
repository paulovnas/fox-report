export const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

type GqlBody = { query: string; variables?: Record<string, unknown> };
type MockColumn = { id: string; title: string; type: string; settings_str?: string };
type MockBoard = { id: string; name: string; columns: MockColumn[]; groups: { id: string; title: string }[] };

const STATUS_LABELS = { 0: 'Novo', 1: 'Em andamento', 2: 'Em análise', 3: 'Bloqueado', 4: 'Adiado', 5: 'Resolvido', 6: 'Não será tratado' };

export function createMondayMock() {
  const calls = {
    createBoard: [] as { name: string }[],
    createColumn: [] as string[],
    createGroup: [] as { boardId: string; name: string }[],
    deleteGroup: [] as { boardId: string; groupId: string }[],
    createItem: [] as { name: string; boardId: string; groupId: string; values: Record<string, unknown> }[],
    createUpdate: [] as string[],
    uploads: [] as string[],
  };
  const boards = new Map<string, MockBoard>();
  let nextBoard = 500;
  let nextItem = 0;

  const json = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } });

  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith('/file')) {
      const form = init?.body as FormData;
      calls.uploads.push(String(form.get('query')));
      expectMap(form.get('map'));
      return json({ add_file_to_update: { id: 'asset' } });
    }
    const body = JSON.parse(String(init?.body)) as GqlBody;
    const q = body.query, v = body.variables ?? {};
    if (q.includes('boards(workspace_ids')) {
      return json({ boards: [...boards.values()].map(b => ({ id: b.id, name: b.name })), has_more: false });
    }
    if (q.includes('create_board')) {
      const name = String(v.name);
      const id = String(++nextBoard);
      const board: MockBoard = { id, name, columns: [], groups: [{ id: 'group_default', title: 'New Item Group' }] };
      boards.set(id, board);
      calls.createBoard.push({ name });
      return json({ create_board: { id } });
    }
    if (q.includes('delete_group')) {
      const boardId = String(v.board), groupId = String(v.group);
      const board = boards.get(boardId);
      if (board) board.groups = board.groups.filter(g => g.id !== groupId);
      calls.deleteGroup.push({ boardId, groupId });
      return json({ delete_group: { id: groupId } });
    }
    if (q.includes('create_column')) {
      const boardId = String(v.board);
      const title = String(v.title);
      calls.createColumn.push(title);
      const id = `col_${title.replace(/\s+/g, '_')}`;
      const settings = title === 'Tipo' ? { labels: { 0: 'Bug', 1: 'Layout', 2: 'Conteúdo', 3: 'Outro' } } : title === 'Status' ? { labels: STATUS_LABELS } : undefined;
      boards.get(boardId)?.columns.push({ id, title, type: String(v.type), ...(settings ? { settings_str: JSON.stringify(settings) } : {}) });
      return json({ create_column: { id } });
    }
    if (q.includes('boards(ids')) {
      const ids = (v.id as string[]) ?? [];
      return json({ boards: ids.map(id => boards.get(String(id))).filter(Boolean) });
    }
    if (q.includes('create_group')) {
      const boardId = String(v.board);
      const title = String(v.name);
      const board = boards.get(boardId);
      const existing = board?.groups.find(g => g.title === title);
      if (existing) return json({ create_group: { id: existing.id } });
      const group = { id: `group_${title.replace(/\s+/g, '_')}`, title };
      board?.groups.push(group);
      calls.createGroup.push({ boardId, name: title });
      return json({ create_group: { id: group.id } });
    }
    if (q.includes('create_item')) {
      nextItem++;
      calls.createItem.push({
        name: String(v.name),
        boardId: String(v.board),
        groupId: String(v.group),
        values: JSON.parse(String(v.values)) as Record<string, unknown>,
      });
      return json({ create_item: { id: `item_${nextItem}` } });
    }
    if (q.includes('create_update')) {
      calls.createUpdate.push(String(v.body));
      return json({ create_update: { id: 'update_1' } });
    }
    if (q.includes('account')) return json({ account: { slug: 'ene' } });
    throw new Error(`query não mockada: ${q}`);
  };

  return { fetchMock: fetchMock as typeof fetch, calls, boards, PNG };
}

function expectMap(value: FormDataEntryValue | null) {
  const map = JSON.parse(String(value)) as Record<string, string[]>;
  if (!map.image?.includes('variables.file')) throw new Error('map multipart inválido');
}

export function reportBody(overrides: Record<string, unknown> = {}) {
  return {
    description: 'O total do pedido aparece vazio.',
    types: ['Bug'],
    project: 'Portal eNe',
    reporter: 'user:ana',
    region: PNG,
    full: PNG,
    context: {
      url: 'https://app.ene.com/pedidos?token=segredo',
      title: 'Pedidos',
      viewport: { w: 1280, h: 720, dpr: 2 },
      scroll: { x: 0, y: 40 },
      region: { x: 10, y: 20, w: 300, h: 200 },
      userAgent: 'Mozilla/5.0 (Macintosh)',
      language: 'pt-BR',
      capturedAt: '2026-10-20T14:00:00.000Z',
      elements: [{ path: 'div#total', component: 'screen:checkout', text: 'R$ 0,00' }],
      consoleErrors: [{ at: '2026-10-20T13:59:50.000Z', message: 'TypeError: x is undefined' }],
      network: [
        { at: '2026-10-20T13:59:55.000Z', method: 'GET', url: '/api/pedidos', status: 200, durationMs: 42, type: 'fetch', requestBody: '{"id":1}', responseBody: '{"total":null}' },
        { at: '2026-10-20T13:59:56.000Z', method: 'POST', url: '/api/erro', status: 500, durationMs: 90, type: 'xhr', error: 'Falha de rede ou requisição abortada' },
      ],
      metadata: { app: 'Portal eNe', version: '2.3.0' },
      sdk: { name: '@ene/report', version: '0.1.0' },
    },
    ...overrides,
  };
}
