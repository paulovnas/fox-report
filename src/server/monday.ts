import type { CleanReport, MondayConfig } from './types';
import { buildUpdateBody } from './updateBody';
import { sanitizeName } from './util';

type Column = { id: string; title: string; type: string; settings_str?: string | null };
type Board = { id: string; name: string; columns?: Column[]; groups?: { id: string; title: string }[] };
export type Provisioned = {
  boardId: string;
  groups: Map<string, string>;
  columns: Record<string, string>;
  /** Labels da coluna Tipo. */
  tipoLabels: Map<string, number>;
  /** Labels da coluna Status. */
  statusLabels: Map<string, number>;
  accountSlug: string | null;
};

/** Grupos fixos de todo board no padrão Fox Report. */
export const GROUP_BACKLOG = 'Esteira';
export const GROUP_HISTORY = 'Histórico';
/** Valores da coluna Status; o que finaliza é papel da automação de Histórico. */
export const STATUS_LABELS = ['Novo', 'Em andamento', 'Em análise', 'Bloqueado', 'Adiado', 'Resolvido', 'Não será tratado'] as const;
export const INITIAL_STATUS = 'Novo';

export class MondayError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = 'MondayError';
  }
}

const BOARD_COLUMNS = [
  { title: 'Status', type: 'status', defaults: { labels: Object.fromEntries(STATUS_LABELS.map((label, index) => [index, label])) } },
  { title: 'Tipo', type: 'status', defaults: { labels: { 0: 'Bug', 1: 'Layout', 2: 'Conteúdo', 3: 'Outro' } } },
  { title: 'Página', type: 'link' },
  { title: 'Capturado em', type: 'date' },
  { title: 'Projeto', type: 'text' },
  { title: 'Reporter', type: 'text' },
  { title: 'App', type: 'text' },
  { title: 'Browser', type: 'text' },
  { title: 'Viewport', type: 'text' },
  { title: 'Console', type: 'numbers' },
  { title: 'Requests', type: 'numbers' },
] as const;

const BOARD_QUERY = 'query($id: [ID!]) { boards(ids: $id) { id name columns { id title type settings_str } groups { id title } } }';

export class MondayClient {
  private slug: string | null | undefined;

  constructor(private config: MondayConfig) {}

  private async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const res = await this.config.fetch(this.config.apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: this.config.token,
        'api-version': '2024-10',
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = await res.json().catch(() => null) as { data?: T; error_message?: string; errors?: { message?: string }[] } | null;
    if (!res.ok) throw new MondayError(body?.error_message ?? `Monday respondeu ${res.status}`, res.status);
    if (body?.errors?.length) throw new MondayError(body.errors.map(e => e.message ?? 'erro desconhecido').join('; '));
    if (!body?.data) throw new MondayError(body?.error_message ?? 'Resposta inválida do Monday');
    return body.data;
  }

  private async board(boardId: string): Promise<Board> {
    const data = await this.graphql<{ boards: Board[] }>(BOARD_QUERY, { id: [boardId] });
    const found = data.boards?.[0];
    if (!found) throw new MondayError(`Quadro ${boardId} não encontrado no Monday.`);
    return found;
  }

  /** Procura o board pelo nome no workspace (com paginação) e cria apenas se não existir. */
  private async findOrCreateBoard(boardName: string): Promise<{ id: string; created: boolean }> {
    const workspace = Number(this.config.workspaceId);
    if (!Number.isInteger(workspace) || workspace <= 0) throw new MondayError('workspaceId inválido.');
    for (let page = 1; page <= 20; page++) {
      const data = await this.graphql<{ boards: { id: string; name: string }[] }>(
        'query($ws: [ID], $page: Int) { boards(workspace_ids: $ws, limit: 100, page: $page) { id name } }',
        { ws: [String(workspace)], page },
      );
      const found = data.boards ?? [];
      const existing = found.find(b => b.name === boardName);
      if (existing) return { id: existing.id, created: false };
      if (found.length < 100) break; // última página
    }
    const created = await this.graphql<{ create_board: { id: string } }>(
      'mutation($name: String!, $kind: BoardKind!, $workspace: ID!) { create_board(board_name: $name, board_kind: $kind, workspace_id: $workspace) { id } }',
      { name: boardName, kind: 'public', workspace: String(workspace) },
    );
    const id = created.create_board?.id;
    if (!id) throw new MondayError('O Monday não devolveu o ID do quadro criado.');
    this.config.logger('monday', `quadro "${boardName}" criado: ${id} — lembre-se de configurar as automações Status→Histórico (ver README).`);
    return { id, created: true };
  }

  private async ensureColumns(boardId: string, columns: Column[]): Promise<Record<string, string>> {
    const map: Record<string, string> = {};
    for (const column of columns) map[column.title] = column.id;
    for (const spec of BOARD_COLUMNS) {
      if (map[spec.title]) continue;
      const created = await this.graphql<{ create_column: { id: string } }>(
        'mutation($board: ID!, $title: String!, $type: ColumnType!, $defaults: JSON) { create_column(board_id: $board, title: $title, column_type: $type, defaults: $defaults) { id } }',
        { board: boardId, title: spec.title, type: spec.type, defaults: 'defaults' in spec ? JSON.stringify(spec.defaults) : undefined },
      );
      const id = created.create_column?.id;
      if (!id) throw new MondayError(`O Monday não devolveu o ID da coluna "${spec.title}".`);
      map[spec.title] = id;
      this.config.logger('monday', `coluna "${spec.title}" criada: ${id}`);
    }
    return map;
  }

  private async ensureGroup(boardId: string, groups: Map<string, string>, name: string): Promise<string> {
    const existing = groups.get(name);
    if (existing) return existing;
    const data = await this.graphql<{ create_group: { id: string } }>(
      'mutation($board: ID!, $name: String!) { create_group(board_id: $board, group_name: $name) { id } }',
      { board: boardId, name },
    );
    const id = data.create_group?.id;
    if (!id) throw new MondayError(`O Monday não devolveu o ID do grupo "${name}".`);
    groups.set(name, id);
    this.config.logger('monday', `grupo "${name}" criado: ${id}`);
    return id;
  }

  private async deleteGroup(boardId: string, groupId: string): Promise<void> {
    try {
      await this.graphql<{ delete_group: { id: string } }>(
        'mutation($board: ID!, $group: String!) { delete_group(board_id: $board, group_id: $group) { id } }',
        { board: boardId, group: groupId },
      );
    } catch (error) {
      this.config.logger('monday', `não foi possível remover o grupo padrão ${groupId}: ${(error as Error).message}`);
    }
  }

  private async accountSlug(): Promise<string | null> {
    if (this.slug !== undefined) return this.slug;
    try {
      const data = await this.graphql<{ account: { slug?: string } }>('query { account { slug } }');
      this.slug = data.account?.slug ?? null;
    } catch { this.slug = null; }
    return this.slug;
  }

  private parseLabels(column: Column | undefined): Map<string, number> {
    const labels = new Map<string, number>();
    if (!column?.settings_str) return labels;
    try {
      const settings = JSON.parse(column.settings_str) as { labels?: Record<string, string> | { name: string; index: number }[] };
      if (Array.isArray(settings.labels)) for (const l of settings.labels) labels.set(l.name, l.index);
      else if (settings.labels) for (const [index, name] of Object.entries(settings.labels)) labels.set(String(name), Number(index));
    } catch { /* settings inesperado: mapa vazio */ }
    return labels;
  }

  /**
   * Garante o board no padrão Fox Report (colunas + grupos Esteira/Histórico).
   * Reutiliza board existente com o mesmo nome; em board recém-criado remove o
   * grupo padrão vazio que o Monday inventa. Idempotente.
   */
  async ensureBoard(boardName: string): Promise<Provisioned> {
    const name = sanitizeName(boardName);
    const { id: boardId, created } = await this.findOrCreateBoard(name);
    let board = await this.board(boardId);
    const columns = await this.ensureColumns(boardId, board.columns ?? []);
    if ((board.columns ?? []).length < BOARD_COLUMNS.length) board = await this.board(boardId);
    const groups = new Map<string, string>();
    for (const group of board.groups ?? []) groups.set(group.title, group.id);
    // Histórico antes de Esteira: se o Monday empilhar grupos novos no topo, Esteira fica acima.
    await this.ensureGroup(boardId, groups, GROUP_HISTORY);
    await this.ensureGroup(boardId, groups, GROUP_BACKLOG);
    if (created) {
      // O grupo padrão do Monday pode aparecer com atraso após o create_board:
      // relê o board e remove o que não for Esteira/Histórico (board novo está vazio).
      board = await this.board(boardId);
      for (const group of board.groups ?? []) {
        if (group.title !== GROUP_BACKLOG && group.title !== GROUP_HISTORY) await this.deleteGroup(boardId, group.id);
      }
    }
    const allColumns = board.columns ?? [];
    return {
      boardId,
      groups,
      columns,
      tipoLabels: this.parseLabels(allColumns.find(c => c.id === columns['Tipo'])),
      statusLabels: this.parseLabels(allColumns.find(c => c.id === columns['Status'])),
      accountSlug: await this.accountSlug(),
    };
  }

  private columnValues(p: Provisioned, report: CleanReport): Record<string, unknown> {
    const values: Record<string, unknown> = {};
    const put = (title: string, value: unknown) => { const id = p.columns[title]; if (id && value !== undefined && value !== null && value !== '') values[id] = value; };
    const type = report.types[0];
    const tipoLabel = type && p.tipoLabels.has(type) ? type : p.tipoLabels.has('Outro') ? 'Outro' : [...p.tipoLabels.keys()][0];
    put('Tipo', tipoLabel ? { label: tipoLabel } : undefined);
    const statusLabel = p.statusLabels.has(INITIAL_STATUS) ? INITIAL_STATUS : [...p.statusLabels.keys()][0];
    put('Status', statusLabel ? { label: statusLabel } : undefined);
    put('Página', report.context.url ? { url: report.context.url, text: report.context.title || report.context.url } : undefined);
    const date = report.capturedAt.slice(0, 10);
    put('Capturado em', /^\d{4}-\d{2}-\d{2}$/.test(date) ? { date } : undefined);
    put('Projeto', report.project);
    put('Reporter', report.reporter);
    const metadata = report.context.metadata as Record<string, unknown>;
    const app = metadata.app ?? metadata.application ?? metadata.version;
    put('App', app === undefined ? undefined : String(app).slice(0, 200));
    put('Browser', report.context.userAgent ? report.context.userAgent.slice(0, 200) : undefined);
    put('Viewport', report.context.viewport ? `${report.context.viewport.w ?? '?'}x${report.context.viewport.h ?? '?'} dpr ${report.context.viewport.dpr ?? '?'}` : undefined);
    put('Console', report.context.consoleErrors.length);
    put('Requests', report.context.network.length);
    return values;
  }

  async createItem(p: Provisioned, report: CleanReport): Promise<{ itemId: string; updateId: string | null; url: string | null }> {
    const groupId = await this.ensureGroup(p.boardId, p.groups, GROUP_BACKLOG);
    const name = report.description.replace(/\s+/g, ' ').trim().slice(0, 140) || 'Relato sem descrição';
    const created = await this.graphql<{ create_item: { id: string } }>(
      'mutation($board: ID!, $group: String!, $name: String!, $values: JSON!) { create_item(board_id: $board, group_id: $group, item_name: $name, column_values: $values) { id } }',
      { board: p.boardId, group: groupId, name, values: JSON.stringify(this.columnValues(p, report)) },
    );
    const itemId = created.create_item?.id;
    if (!itemId) throw new MondayError('O Monday não devolveu o ID do item criado.');
    let updateId: string | null = null;
    try {
      const update = await this.graphql<{ create_update: { id: string } }>(
        'mutation($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }',
        { item: itemId, body: buildUpdateBody(report) },
      );
      updateId = update.create_update?.id ?? null;
    } catch (error) {
      this.config.logger('monday', `update do item ${itemId} falhou: ${(error as Error).message}`);
    }
    const slug = p.accountSlug;
    const url = slug ? `https://${slug}.monday.com/boards/${p.boardId}/pulses/${itemId}` : null;
    return { itemId, updateId, url };
  }

  async attach(updateId: string, filename: string, bytes: Uint8Array, mimeType = 'image/png'): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]+$/.test(updateId)) return false;
    const form = new FormData();
    form.append('query', `mutation ($file: File!) { add_file_to_update(update_id: "${updateId}", file: $file) { id } }`);
    form.append('variables', JSON.stringify({ file: null }));
    form.append('map', JSON.stringify({ image: ['variables.file'] }));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    form.append('image', new Blob([buffer], { type: mimeType }), filename);
    try {
      const res = await this.config.fetch(this.config.fileApiUrl, {
        method: 'POST',
        headers: { authorization: this.config.token, 'api-version': '2024-10' },
        body: form,
      });
      const body = await res.json().catch(() => null) as { data?: { add_file_to_update?: { id?: string } }; errors?: { message?: string }[] } | null;
      if (!res.ok || body?.errors?.length || !body?.data?.add_file_to_update?.id) {
        this.config.logger('monday', `anexo ${filename} falhou: ${body?.errors?.[0]?.message ?? res.status}`);
        return false;
      }
      return true;
    } catch (error) {
      this.config.logger('monday', `anexo ${filename} falhou: ${(error as Error).message}`);
      return false;
    }
  }
}
