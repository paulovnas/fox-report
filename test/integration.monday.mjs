// Teste ponta-a-ponta REAL contra a API do Monday.
// Uso: npm run build && node test/integration.monday.mjs
// Lê MONDAY_API_TOKEN/MONDAY_WORKSPACE_ID/MONDAY_PROJECT de .env.local. Nunca imprime o token.
// Modelo novo: um board por projeto (grupos Esteira/Histórico, coluna Status);
// a movimentação para Histórico é automação nativa do Monday (não testável via API).
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
const defaultProject = env.MONDAY_PROJECT || 'Portal eNe';
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

const payload = (description, project, suffix) => ({
  description,
  types: ['Bug', 'Layout'],
  project,
  reporter: 'sdk:integration-test',
  region: PNG,
  full: PNG,
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
      { at: new Date().toISOString(), method: 'GET', url: '/api/pedidos?status=aberto&token=segredo', status: 200, durationMs: 42, type: 'fetch', responseBody: '{"total":null}' },
      { at: new Date().toISOString(), method: 'POST', url: '/api/pedidos/1/fechar', status: 500, durationMs: 91, type: 'xhr', requestBody: '{"pedido":1}', error: 'Internal Server Error' },
    ],
    metadata: { app: 'Portal eNe', version: '2.3.0', ambiente: 'teste-integracao' },
    sdk: { name: '@foxtag/fox-report', version: '0.1.0' },
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

/** Board padrão: colunas Status+Tipo+… e grupos Esteira/Histórico. */
const assertStandardBoard = (board, expectedName) => {
  assert(board.name === expectedName, `nome do board inesperado: ${board.name} (esperado ${expectedName})`);
  const columnTitles = board.columns.map(c => c.title);
  for (const title of ['Status', 'Tipo', 'Página', 'Capturado em', 'Projeto', 'Reporter', 'App', 'Browser', 'Viewport', 'Console', 'Requests']) {
    assert(columnTitles.includes(title), `coluna ausente: ${title}`);
  }
  const groupTitles = board.groups.map(g => g.title).sort();
  assert(JSON.stringify(groupTitles) === JSON.stringify(['Esteira', 'Histórico'].sort()), `grupos inesperados: ${groupTitles.join(' / ')}`);
};

console.log('1) template: criando/reaproveitando board template…');
const template = await createBoardTemplate({ token, workspaceId });
console.log('   boardId:', template.boardId, '| boardUrl:', template.boardUrl ?? '(sem slug)');
const templateAgain = await createBoardTemplate({ token, workspaceId });
assert(templateAgain.boardId === template.boardId, 'template não é idempotente');
const templateData = await gql(
  'query($id: [ID!]) { boards(ids: $id) { id name columns { title } groups { title } } }',
  { id: [template.boardId] },
);
assertStandardBoard(templateData.boards[0], 'Fox Report — Template');
console.log('   template ok: 11 colunas, grupos Esteira + Histórico, idempotente');

console.log('2) handler: provisionando boards por projeto…');
const handler = createFoxReportHandler({
  token,
  project: defaultProject,
  workspaceId,
  logger: (scope, message) => console.error(`[${scope}] ${message}`),
});
const ready = await handler.ready();
assert(ready.boardId, 'boardId não retornado por ready()');
assert(ready.boardId !== template.boardId, 'ready() apontou para o template');
console.log('   board do projeto', JSON.stringify(defaultProject), '| boardId:', ready.boardId, '| boardUrl:', ready.boardUrl ?? '(sem slug)');

console.log('3) enviando relato 1 (projeto:', defaultProject, ')');
const first = await post(handler, payload('O total do pedido aparece vazio no resumo.', defaultProject, '1'));
assert(first.status === 201, `relato 1 deveria retornar 201, retornou ${first.status}: ${JSON.stringify(first.body)}`);
assert(first.body.id, 'itemId ausente');
assert(first.body.attachments?.region === true, 'region.png não anexado');
assert(first.body.attachments?.full === true, 'full.png não anexado');
console.log('   itemId:', first.body.id, '| updateId:', first.body.updateId, '| url:', first.body.url);

console.log('4) enviando relato 2 (outro projeto → outro board)');
const second = await post(handler, payload('Botão de salvar desalinhado no mobile.', 'App Interno', '2'));
assert(second.status === 201, `relato 2 deveria retornar 201, retornou ${second.status}: ${JSON.stringify(second.body)}`);
assert(second.body.boardId !== ready.boardId, 'o relato 2 caiu no board do projeto 1');
console.log('   boardId:', second.body.boardId, '| itemId:', second.body.id);

console.log('5) verificando boards, colunas, grupos e anexos via GraphQL…');
const boardsData = await gql(
  'query($id: [ID!]) { boards(ids: $id) { id name columns { id title type } groups { id title } items_page(limit: 50) { items { id name } } } }',
  { id: [ready.boardId, second.body.boardId] },
);
const board1 = boardsData.boards.find(b => b.id === String(ready.boardId));
const board2 = boardsData.boards.find(b => b.id === String(second.body.boardId));
assertStandardBoard(board1, defaultProject);
assertStandardBoard(board2, 'App Interno');
console.log('   boards:', board1.name, `(${board1.id})`, '+', board2.name, `(${board2.id})`);

const itemData = await gql(
  'query($id: [ID!]) { items(ids: $id) { id name group { id title } column_values { id text type value } updates { id body assets { id name } } } }',
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
assert(update.body.includes('O total do pedido aparece vazio no resumo.'), 'descrição ausente no update');
assert(update.body.includes('TypeError: Cannot read properties of null'), 'erro de console ausente no update');
assert(update.body.includes('GET /api/pedidos?status=aberto'), 'network ausente no update');
assert(!update.body.includes('segredo'), 'a palavra segredo vazou no update');
assert(!update.body.includes('## '), 'o update ainda contém Markdown cru');

const statusColumnId = board1.columns.find(c => c.title === 'Status').id;
const tipoColumnId = board1.columns.find(c => c.title === 'Tipo').id;
const statusValue = item.column_values.find(c => c.id === statusColumnId);
const tipoValue = item.column_values.find(c => c.id === tipoColumnId);
assert(statusValue?.text === 'Novo', `Status do item novo deveria ser "Novo", veio "${statusValue?.text}"`);
assert(tipoValue?.text === 'Bug', `Tipo do item deveria ser "Bug", veio "${tipoValue?.text}"`);
const linkValue = item.column_values.find(c => c.type === 'link');
assert(linkValue?.text?.includes('token=%5Bredacted%5D'), 'URL da coluna Página não redigida');
console.log('   item na Esteira | Status:', statusValue.text, '| Tipo:', tipoValue.text);

let assets = update.assets ?? [];
for (let attempt = 0; attempt < 6 && assets.length < 2; attempt++) {
  await sleep(1500);
  const again = await gql('query($id: [ID!]) { items(ids: $id) { updates { id assets { id name } } } }', { id: [first.body.id] });
  assets = again.items[0]?.updates?.[0]?.assets ?? [];
}
const assetNames = assets.map(a => a.name).sort();
assert(assetNames.includes('region.png'), `region.png ausente nos anexos: ${assetNames.join(', ')}`);
assert(assetNames.includes('full.png'), `full.png ausente nos anexos: ${assetNames.join(', ')}`);
console.log('   anexos:', assetNames.join(', '));

const summary = {
  workspace: workspaceId,
  template: { boardId: template.boardId, url: template.boardUrl },
  boards: [
    { project: defaultProject, boardId: board1.id, url: first.body.url, items: board1.items_page.items.length },
    { project: 'App Interno', boardId: board2.id, items: board2.items_page.items.length },
  ],
  items: [
    { id: first.body.id, updateId: first.body.updateId, group: item.group.title, status: statusValue.text, assets: assetNames },
    { id: second.body.id, updateId: second.body.updateId },
  ],
  assertions: ['template idempotente', '1 board por projeto', '11 colunas com Status', 'grupos Esteira + Histórico', 'item novo na Esteira com Status=Novo', 'update HTML com seções', 'region.png + full.png anexados', 'URLs redigidas no servidor'],
  redaction: { pageUrl: linkValue.text, updateRedacted: !update.body.includes('segredo') },
  note: 'movimentação para Histórico é automação nativa do Monday — configure-a no board (ver README); não é criável via API',
};
console.log('\nRESULTADO:', JSON.stringify(summary, null, 2));
