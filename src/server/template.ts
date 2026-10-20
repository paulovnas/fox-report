import { MondayClient } from './monday';
import type { MondayConfig } from './types';

export type BoardTemplateOptions = {
  /** Token de API do Monday (somente servidor). */
  token: string;
  /** Nome do board template. Padrão `eNe Reports — Template`. */
  boardName?: string;
  /** Workspace do Monday. Padrão `18101704` (eNe Developers). */
  workspaceId?: string;
  apiUrl?: string;
  fileApiUrl?: string;
  fetch?: typeof fetch;
  logger?: (scope: string, message: string) => void;
};

/**
 * Cria (ou reaproveita) o board template no padrão eNe Report: colunas
 * Status/Tipo/Página/... e grupos Esteira + Histórico. Duplicando este board
 * no Monday e renomeando para o nome do projeto, a automação configurada no
 * template é copiada junto. Idempotente: rodar de novo reaproveita o mesmo board.
 */
export async function createBoardTemplate(options: BoardTemplateOptions): Promise<{ boardId: string; boardUrl: string | null }> {
  if (!options?.token) throw new Error('createBoardTemplate: informe o token de API do Monday em `token`.');
  const logger = options.logger ?? (() => {});
  const config: MondayConfig = {
    token: options.token,
    workspaceId: options.workspaceId ?? '18101704',
    boardPrefix: '',
    apiUrl: options.apiUrl ?? 'https://api.monday.com/v2',
    fileApiUrl: options.fileApiUrl ?? 'https://api.monday.com/v2/file',
    fetch: options.fetch ?? ((...args) => fetch(...args)),
    logger,
  };
  const client = new MondayClient(config);
  const provisioned = await client.ensureBoard(options.boardName ?? 'eNe Reports — Template');
  return {
    boardId: provisioned.boardId,
    boardUrl: provisioned.accountSlug ? `https://${provisioned.accountSlug}.monday.com/boards/${provisioned.boardId}` : null,
  };
}
