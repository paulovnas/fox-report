import { MondayClient } from './monday';
import type { MondayConfig } from './types';

export type BoardTemplateOptions = {
  /** Token de API do Monday (somente servidor). */
  token: string;
  /** Nome do board template. Padrão `Fox Report — Template`. */
  boardName?: string;
  /** Workspace do Monday (obrigatório). */
  workspaceId: string;
  apiUrl?: string;
  fileApiUrl?: string;
  fetch?: typeof fetch;
  logger?: (scope: string, message: string) => void;
};

/**
 * Cria (ou reaproveita) o board template no padrão Fox Report: colunas
 * Status/Tipo/Página/... e grupos Esteira + Histórico. Duplicando este board
 * no Monday e renomeando para o nome do projeto, a automação configurada no
 * template é copiada junto. Idempotente: rodar de novo reaproveita o mesmo board.
 */
export async function createBoardTemplate(options: BoardTemplateOptions): Promise<{ boardId: string; boardUrl: string | null }> {
  if (!options?.token) throw new Error('createBoardTemplate: informe o token de API do Monday em `token`.');
  if (!options.workspaceId) throw new Error('createBoardTemplate: informe o workspaceId do Monday.');
  const logger = options.logger ?? (() => {});
  const config: MondayConfig = {
    token: options.token,
    workspaceId: options.workspaceId,
    apiUrl: options.apiUrl ?? 'https://api.monday.com/v2',
    fileApiUrl: options.fileApiUrl ?? 'https://api.monday.com/v2/file',
    fetch: options.fetch ?? ((...args) => fetch(...args)),
    logger,
  };
  const client = new MondayClient(config);
  const provisioned = await client.ensureTemplateBoard(options.boardName ?? 'Fox Report — Template');
  return {
    boardId: provisioned.boardId,
    boardUrl: provisioned.accountSlug ? `https://${provisioned.accountSlug}.monday.com/boards/${provisioned.boardId}` : null,
  };
}
