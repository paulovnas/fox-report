export type CleanElement = { path: string; component: string; text: string };
export type CleanConsoleEntry = { at: string; message: string };
export type CleanRect = { x: number | null; y: number | null; w: number | null; h: number | null };
export type CleanNetworkEntry = {
  at: string;
  method: string;
  url: string;
  status: number | null;
  durationMs: number;
  type: string;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  error?: string;
};

/** Payload já validado e limitado, pronto para o Monday. */
export type CleanReport = {
  description: string;
  types: string[];
  project: string;
  reporter: string;
  capturedAt: string;
  context: {
    url: string;
    title: string;
    viewport: { w: number | null; h: number | null; dpr: number | null } | null;
    scroll: { x: number | null; y: number | null } | null;
    region: CleanRect | null;
    userAgent: string;
    language: string;
    capturedAt: string;
    elements: CleanElement[];
    consoleErrors: CleanConsoleEntry[];
    network: CleanNetworkEntry[];
    metadata: Record<string, unknown>;
    sdk: { name: string; version: string } | null;
  };
};

export type MondayConfig = {
  token: string;
  /** Board dos relatos (handler). Obrigatório no handler; nunca cria board. */
  boardId?: string;
  /** Workspace (somente o createBoardTemplate usa, para criar o template). */
  workspaceId?: string;
  apiUrl: string;
  fileApiUrl: string;
  fetch: typeof fetch;
  logger: (scope: string, message: string) => void;
};

export type FoxReportServerOptions = {
  /** Token de API do Monday. Nunca vai ao navegador. */
  token: string;
  /** ID do board que recebe os relatos (duplicado do template por você). Obrigatório. */
  boardId: string;
  /** Projeto padrão; usado quando o relato não envia `project`. */
  project?: string;
  /** Endpoint GraphQL. Padrão `https://api.monday.com/v2`. */
  apiUrl?: string;
  /** Endpoint multipart do Monday. Padrão `https://api.monday.com/v2/file`. */
  fileApiUrl?: string;
  /** Origens de navegador autorizadas. Mesma origem é sempre aceita. */
  allowedOrigins?: '*' | string[] | ((origin: string) => boolean);
  /** Limite do JSON recebido. Padrão 48 MB (cobre 2 PNGs de 10 MB + anexo de 10 MB em base64). */
  maxBodyBytes?: number;
  /** Limite de cada PNG. Padrão 10 MB. */
  maxImageBytes?: number;
  /** Limite do anexo opcional enviado pelo usuário. Padrão 10 MB (o Monday aceita até 500 MB). */
  maxAttachmentBytes?: number;
  /** Limite da descrição. Padrão 4000 caracteres. */
  maxDescription?: number;
  /** Parâmetros de URL extras redigidos, além da lista padrão (token, password, secret...). */
  redactParams?: string[];
  /** Limite por IP. Padrão 10 relatos por minuto. */
  rateLimit?: false | { max: number; windowMs: number };
  fetch?: typeof fetch;
  logger?: (scope: string, message: string) => void;
  onReport?: (info: { itemId: string; boardId: string; updateId: string | null }) => void;
};

export type FoxReportHandler = {
  (req: Request): Promise<Response>;
  /** Garante colunas e grupos do board antes do primeiro relato. */
  ready(): Promise<{ boardId: string; boardUrl: string | null }>;
};
