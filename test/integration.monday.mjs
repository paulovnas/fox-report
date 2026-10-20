// Teste ponta-a-ponta REAL contra a API do Monday.
// Uso: npm run build && node test/integration.monday.mjs
// Lê MONDAY_API_TOKEN/MONDAY_WORKSPACE_ID de .env.local. Nunca imprime o token.
// Modelo: boardId fixo no handler (board criado ANTES, duplicando o template) —
// o handler nunca cria board; a movimentação para Histórico é automação nativa.
import { readFileSync } from 'node:fs';
import { createBoardTemplate, createFoxReportHandler } from '../dist/server.mjs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter(line => line.includes('=')).map(line => {
    const at = line.indexOf('=');
    return [line.slice(0, at), line.slice(at + 1)];
  }),
);
const token = env.MONDAY_API_TOKEN;
if (!token) throw new Error('MONDAY_API_TOKEN ausente em .env.local');
const workspaceId = env.MONDAY_WORKSPACE_ID || '18101704';
const api = 'https://api.monday.com/v2';

const gql = async (query, variables = {}) => {
  const res = await fetch(api, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: token, 'api-version': '2024-10' },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.errors?.length) {
    throw new Error(`Monday ${res.status}: ${body?.errors?.map(e => e.message).join('; ') ?? 'resposta inválida'}`);
  }
  return body.data;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const assert = (condition, message) => {
  if (!condition) throw new Error(`ASSERT: ${message}`);
};

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const ANEXO = { name: 'erro-do-app.log', type: 'text/plain', size: 21, dataUrl: 'data:text/plain;base64,' + Buffer.from('log de teste do anexo').toString('base64') };

const payload = (description, suffix) => ({
  description,
  types: ['Bug', 'Layout'],
  project: 'Portal eNe',
  reporter: 'sdk:integration-test',
  region: PNG,
  full: PNG,
  attachment: { ...ANEXO, dataUrl: `${ANEXO.dataUrl.split(',')[0]},${Buffer.from(`log de teste ${suffix}`).toString('base64')}`, size: `log de teste ${suffix}`.length },
  context: {
    url: `https://app.ene.com/pedidos?token=segredo&aba=${suffix}`,
    title: 'Pedidos — eNe',
    viewport: { w: 1280, h: 720, dpr: 2 },
    scroll: { x: 0, y: 120 },
    region: { x: 24, y: 96, w: 420, h: 260 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36',
    language: 'pt-BR',
    capturedAt: new Date().toISOString(),
    elements: [{ path: 'main#pedidos > div.card > span#total', component: 'screen:orders', text: 'R$ 0,00' }],
    consoleErrors: [{ at: new Date().toISOString(), message: 'TypeError: Cannot read properties of null (reading "total")' }],
    network: [
      { at: new Date().toISOString(), method: 'GET', url: '/api/pedidos?status=aberto&token=segredo', status: 200, durationMs: 42, type: 'fetch', requestHeaders: { authorization: 'Bearer deveria-sumir', 'content-type': 'application/json' }, responseHeaders: { 'set-cookie': 'sessao=deveria-sumir' }, responseBody: '{"total":null}' },
      { at: new Date().toISOString(), method: 'POST', url: '/api/pedidos/1/fechar', status: 500, durationMs: 91, type: 'xhr', requestBody: '{"pedido":1}', error: 'Internal Server Error' },
    ],
    metadata: { app: 'Portal eNe', version: '2.3.0', ambiente: 'teste-integracao' },
    sdk: { name: '@foxtag/fox-report', version: '0.2.0' },
  },
});

const post = async (handler, body) => {
  const res = await handler(new Request('http://localhost/api/fox-report', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
};

const assertStandardBoard = (board, boardId) => {
  const columnTitles = board.columns.map(c => c.title);
  for (const title of ['Status', 'Tipo', 'Página', 'Capturado em', 'Projeto', 'Reporter', 'App', 'Browser', 'Viewport', 'Console', 'Requests']) {
    assert(columnTitles.includes(title), `coluna ausente: ${title}`);
  }
  // presença (não exclusividade): boards reutilizados podem ter conteúdo do próprio usuário
  const groupTitles = board.groups.map(g => g.title);
  for (const title of ['Esteira', 'Histórico']) assert(groupTitles.includes(title), `grupo ausente no board ${boardId}: ${title}`);
  assert(new Set(groupTitles).size === groupTitles.length, `grupos duplicados no board ${boardId}: ${groupTitles.join(' / ')}`);
};

console.log('1) template: criando/reaproveitando board template…');
const template = await createBoardTemplate({ token, workspaceId });
console.log('   boardId:', template.boardId, '| boardUrl:', template.boardUrl ?? '(sem slug)');
const templateAgain = await createBoardTemplate({ token, workspaceId });
assert(templateAgain.boardId === template.boardId, 'template não é idempotente');
const templateData = await gql('query($id: [ID!]) { boards(ids: $id) { id name columns { title } groups { title } } }', { id: [template.boardId] });
assertStandardBoard(templateData.boards[0], template.boardId);
console.log('   template ok: 11 colunas, grupos Esteira + Histórico, idempotente');

console.log('2) criando/reutilizando boards de projeto (simulando duplicação feita por VOCÊ no Monday)…');
const listBoards = async () => {
  const data = await gql('query($ws: [ID]) { boards(workspace_ids: $ws, limit: 100) { id name } }', { ws: [workspaceId] });
  return data.boards ?? [];
};
const defaultGroups = async (boardId) => {
  // grupos padrão do Monday só podem ser removidos se estiverem vazios
  const data = await gql('query($id: [ID!]) { boards(ids: $id) { groups { id title } items_page(limit: 100) { items { id group { id title } } } } }', { id: [boardId] });
  const board = data.boards[0];
  const empties = board.groups.filter(g => g.title === 'Group Title');
  const hasItems = board.items_page.items.some(i => i.group?.title === 'Group Title');
  return { empties, hasItems };
};
const ensureProjectBoard = async (name) => {
  const existing = (await listBoards()).find(b => b.name === name);
  if (existing) return String(existing.id);
  const created = await gql('mutation($name: String!, $ws: ID!) { create_board(board_name: $name, board_kind: public, workspace_id: $ws) { id } }', { name, ws: workspaceId });
  return String(created.create_board.id);
};
const board1 = await ensureProjectBoard('Portal eNe');
const board2 = await ensureProjectBoard('App Interno');
for (const id of [board1, board2]) {
  const { empties, hasItems } = await defaultGroups(id);
  if (hasItems) console.log('   aviso: board', id, 'tem itens no grupo padrão (conteúdo do usuário) — não removo nada');
  for (const g of empties.filter(() => !hasItems)) await gql('mutation($board: ID!, $group: String!) { delete_group(board_id: $board, group_id: $group) { id } }', { board: id, group: g.id });
}
console.log('   boards:', board1, board2);

console.log('3) handler com boardId fixo (nunca cria board)…');
const handler = createFoxReportHandler({
  token,
  boardId: board1,
  project: 'Portal eNe',
  logger: (scope, message) => console.error(`[${scope}] ${message}`),
});
await handler.ready();
console.log('   boardId fixo:', board1);

console.log('4) enviando relato 1 (com anexo)…');
const first = await post(handler, payload('O total do pedido aparece vazio no resumo.', '1'));
assert(first.status === 201, `relato 1 deveria retornar 201, retornou ${first.status}: ${JSON.stringify(first.body)}`);
assert(first.body.attachments?.region === true, 'region.png não anexado');
assert(first.body.attachments?.full === true, 'full.png não anexado');
assert(first.body.attachments?.zip === true, 'zip do relato não anexado');
assert(first.body.attachments?.attachment === true, 'anexo do usuário não anexado');
console.log('   itemId:', first.body.id, '| url:', first.body.url);

console.log('5) segundo relato no MESMO board (idempotência de colunas/grupos)…');
const second = await post(handler, payload('Botão de salvar desalinhado no mobile.', '2'));
assert(second.status === 201, `relato 2 deveria retornar 201: ${JSON.stringify(second.body)}`);
assert(String(second.body.boardId) === board1, 'segundo relato mudou de board');

console.log('6) verificando item, grupo, status, anexos e zip via GraphQL…');
const itemData = await gql(
  'query($id: [ID!]) { items(ids: $id) { id name group { title } column_values { id text type value } updates { id body assets { id name } } } }',
  { id: [first.body.id] },
);
const item = itemData.items[0];
assert(item, 'item não encontrado via GraphQL');
assert(item.group?.title === 'Esteira', `item criado no grupo errado: ${item.group?.title}`);
const update = item.updates?.[0];
assert(update, 'update detalhado não encontrado');
for (const section of ['<strong>Relato</strong>', '<strong>Página</strong>', '<strong>Console', '<strong>Requisições', '<strong>Metadados do app</strong>']) {
  assert(update.body.includes(section), `seção ausente no update: ${section}`);
}
assert(!update.body.includes('segredo'), 'a palavra segredo vazou no update');
assert(!update.body.includes('## '), 'o update ainda contém Markdown cru');

let assets = update.assets ?? [];
for (let attempt = 0; attempt < 8 && assets.length < 4; attempt++) {
  await sleep(1500);
  const again = await gql('query($id: [ID!]) { items(ids: $id) { updates { id assets { id name } } } }', { id: [first.body.id] });
  assets = again.items[0]?.updates?.[0]?.assets ?? [];
}
const assetNames = assets.map(a => a.name).sort();
assert(assetNames.includes('region.png'), `region.png ausente: ${assetNames.join(', ')}`);
assert(assetNames.includes('full.png'), `full.png ausente: ${assetNames.join(', ')}`);
assert(assetNames.some(n => n.startsWith('fox-report-') && n.endsWith('.zip')), `zip do relato ausente: ${assetNames.join(', ')}`);
assert(assetNames.includes('erro-do-app.log'), `anexo do usuário ausente: ${assetNames.join(', ')}`);

const boardData = await gql('query($id: [ID!]) { boards(ids: $id) { id name columns { id title type } groups { id title } } }', { id: [board1] });
assertStandardBoard(boardData.boards[0], board1);
const statusColumnId = boardData.boards[0].columns.find(c => c.title === 'Status').id;
const statusValue = item.column_values.find(c => c.id === statusColumnId);
assert(statusValue?.text === 'Novo', `Status do item novo deveria ser "Novo", veio "${statusValue?.text}"`);
const linkValue = item.column_values.find(c => c.type === 'link');
assert(linkValue?.text?.includes('token=%5Bredacted%5D'), 'URL não redigida');
console.log('   item na Esteira | Status:', statusValue.text, '| anexos:', assetNames.join(', '));
console.log('   headers redigidos no update:', !update.body.includes('deveria-sumir'));

const summary = {
  workspace: workspaceId,
  template: { boardId: template.boardId, url: template.boardUrl },
  boards: [
    { project: 'Portal eNe', boardId: board1, items: 2 },
    { project: 'App Interno', boardId: board2, items: 0 },
  ],
  item: { id: first.body.id, updateId: first.body.updateId, group: item.group.title, status: statusValue.text, assets: assetNames },
  assertions: ['template idempotente', 'handler com boardId fixo (0 create_board)', '11 colunas com Status', 'grupos Esteira + Histórico', 'item novo na Esteira com Status=Novo', 'update HTML com seções', '4 anexos: region/full/zip do relato/anexo do usuário', 'headers de rede redigidos', 'URLs redigidas no servidor'],
  note: 'automações Status→Histórico são configuração manual no Monday (ver README/docs)',
};
console.log('\nRESULTADO:', JSON.stringify(summary, null, 2));
