export type Rect = { x: number; y: number; w: number; h: number };

export type ElementInfo = { path: string; component: string; text: string };
export type ConsoleEntry = { at: string; message: string };

/** Requisição observada enquanto o widget está instalado. */
export type NetworkEntry = {
  at: string;
  method: string;
  /** URL já redigida com `redactUrl`. */
  url: string;
  status: number | null;
  durationMs: number;
  type: 'fetch' | 'xhr';
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
  error?: string;
};

/** Dados coletados automaticamente com o relato. Tudo limitado em tamanho. */
export type ReportContext = {
  url: string;
  title: string;
  viewport: { w: number; h: number; dpr: number };
  scroll: { x: number; y: number };
  region: Rect | null;
  userAgent: string;
  language: string;
  capturedAt: string;
  elements: ElementInfo[];
  consoleErrors: ConsoleEntry[];
  network: NetworkEntry[];
  /** O que o app devolveu em `metadata()` (versão, usuário, ambiente...). */
  metadata: Record<string, unknown>;
  sdk: { name: '@foxtag/fox-report'; version: string };
};

/** Corpo enviado ao endpoint do app. */
export type ReportPayload = {
  description: string;
  types: string[];
  project?: string;
  reporter?: string;
  context: ReportContext;
  /** PNG data URL da região selecionada. */
  region: string;
  /** PNG data URL da aba inteira. */
  full: string;
  /** Arquivo opcional anexado pelo usuário. */
  attachment?: ReportAttachment;
};

export type ReportAttachment = {
  /** Nome do arquivo, sem caminho. */
  name: string;
  /** MIME type declarado pelo navegador. */
  type: string;
  /** Tamanho em bytes. */
  size: number;
  /** Conteúdo em data URL base64. */
  dataUrl: string;
};

export type SendResult = { id: string; url?: string };

export type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export type Strings = {
  button: string;
  loading: string;
  captureFailed: string;
  selectHint: string;
  selectTooSmall: string;
  selectCutFailed: string;
  wholeScreen: string;
  cancel: string;
  title: string;
  anotherArea: string;
  previewAlt: string;
  descriptionLabel: string;
  descriptionPlaceholder: string;
  typesLabel: string;
  send: string;
  sending: string;
  sentTitle: string;
  sentBody: string;
  attach: string;
  attachedClear: string;
  attachmentTooLarge: string;
  sendFailed: string;
  close: string;
};

export type FoxReportOptions = {
  /** Rota do app que encaminha o relato ao Monday. */
  endpoint: string;
  /** Nome do projeto; organiza o grupo no quadro do Monday. */
  project?: string;
  /**
   * Controla a exibição do botão. Padrão `false`: instalar o pacote não mostra nada.
   * Aceita função para ler a configuração do app no momento da criação.
   */
  enabled?: boolean | (() => boolean);
  /** `false` não renderiza o FAB; o app usa `open()` no próprio gatilho. Padrão `true`. */
  showButton?: boolean;
  /** Identificação opcional de quem relatou (`user:joao`, e-mail...). */
  reporter?: string | (() => string);
  position?: Position;
  /** Distância extra do canto em px. */
  offset?: { x?: number; y?: number };
  zIndex?: number;
  /** Tipos mostrados como chips. `[]` esconde. */
  types?: string[];
  /** Substitui textos do padrão pt-BR. */
  strings?: Partial<Strings>;
  /** Registra `console.error` e exceções dos últimos 60s. Padrão `true`. */
  captureConsole?: boolean;
  /** Registra chamadas fetch/XHR. Padrão `true`. */
  network?: boolean;
  /** Inclui corpos de requisição/resposta (texto, até 2.000 caracteres). Padrão `false`. */
  networkBodies?: boolean;
  /** Máximo de requisições guardadas. Padrão 50. */
  networkLimit?: number;
  /** Janela de tempo das requisições guardadas. Padrão 120000 ms. */
  networkWindowMs?: number;
  /** Tamanho máximo do arquivo anexado, em bytes. Padrão 10485760 (10 MB). */
  maxAttachmentBytes?: number;
  /** Dados extras do app no momento do relato. */
  metadata?: () => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Cobre `input`, `textarea` e `select` nas imagens. Padrão `true`. */
  maskInputs?: boolean;
  /** Seletores extras cobertos nas imagens (`[data-fox-mask]` é sempre coberto). */
  mask?: string[];
  /** Seletores removidos das imagens (banners, chat...). */
  exclude?: string[];
  /** Parâmetros de query redigidos na URL. */
  redactParams?: string[];
  /** Escala máxima das imagens. Padrão 2. */
  maxPixelRatio?: number;
  accent?: string;
  colorScheme?: 'auto' | 'light' | 'dark';
  /** Onde o host do widget é anexado. Padrão `document.body`. */
  container?: HTMLElement;
  /** Hook de teste: devolve um PNG data URL do viewport. */
  captureFn?: () => Promise<string>;
  fetch?: typeof fetch;
  onSent?: (result: SendResult) => void;
  onError?: (error: Error) => void;
};

export type FoxReportInstance = {
  open(): void;
  close(): void;
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  destroy(): void;
};
