import { createFoxReportHandler } from '@foxtag/fox-report/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let handler: ReturnType<typeof createFoxReportHandler> | null = null;

// Inicialização tardia: o build não exige o token; a rota só falha quando chamada sem ele.
function getHandler() {
  if (!handler) {
    const token = process.env.MONDAY_API_TOKEN;
    if (!token) throw new Error('MONDAY_API_TOKEN não configurado.');
    handler = createFoxReportHandler({
      token,
      project: process.env.MONDAY_PROJECT ?? 'Portal eNe',
      workspaceId: process.env.MONDAY_WORKSPACE_ID ?? '18101704',
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
