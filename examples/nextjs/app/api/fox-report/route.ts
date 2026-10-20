import { createFoxReportHandler } from '@foxtag/fox-report/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let handler: ReturnType<typeof createFoxReportHandler> | null = null;

// Inicialização tardia: o build não exige o token; a rota só falha quando chamada sem ele.
function getHandler() {
  if (!handler) {
    const token = process.env.MONDAY_API_TOKEN;
    const boardId = process.env.MONDAY_BOARD_ID;
    if (!token || !boardId) throw new Error('MONDAY_API_TOKEN e MONDAY_BOARD_ID não configurados.');
    handler = createFoxReportHandler({
      token,
      boardId, // board criado por você (duplicando o template do Fox Report)
      project: process.env.MONDAY_PROJECT ?? 'Portal eNe',
    });
  }
  return handler;
}

export function POST(request: Request) {
  return getHandler()(request);
}

export function OPTIONS(request: Request) {
  return getHandler()(request);
}
