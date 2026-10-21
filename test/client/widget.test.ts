import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, jsonRes, PNG, q, reset, shadow } from './helpers';

const ANNOTATED = 'data:image/png;base64,ANOTADO';
const renderAnnotations = vi.hoisted(() => vi.fn());
vi.mock('../../src/client/capture', async () => {
  const real = await vi.importActual<typeof import('../../src/client/capture')>('../../src/client/capture');
  return { ...real, captureViewport: async () => PNG, maskImage: async (img: string) => img, cropImage: async (img: string) => img, renderAnnotations };
});
import { createFoxReport, type FoxReportInstance, type FoxReportOptions } from '../../src/client/index';

let inst: FoxReportInstance | null = null;

const make = (options: Partial<FoxReportOptions> = {}) => {
  inst = createFoxReport({ endpoint: '/api/fox-report', enabled: true, captureFn: async () => PNG, ...options });
  return inst;
};
const click = (sel: string) => {
  const el = q(sel);
  if (!el) throw new Error(`elemento ausente: ${sel}`);
  el.click();
};

beforeEach(() => { reset(); renderAnnotations.mockReset(); renderAnnotations.mockImplementation(async (img: string, shapes: unknown[]) => (shapes.length ? ANNOTATED : img)); });
afterEach(() => { inst?.destroy(); inst = null; });

describe('montagem e controle do app', () => {
  it('não mostra nada sem enabled: instalar o pacote não exibe o botão', () => {
    make({ enabled: undefined });
    expect(document.querySelector('[data-fox-report]')).toBeNull();
  });

  it('enabled aceita função de configuração do app', () => {
    let flag = false;
    make({ enabled: () => flag });
    expect(document.querySelector('[data-fox-report]')).toBeNull();
    flag = true;
    inst!.setEnabled(true);
    expect(q('.fab')).toBeTruthy();
  });

  it('setEnabled monta e desmonta o widget em runtime', () => {
    make({ enabled: false });
    expect(document.querySelector('[data-fox-report]')).toBeNull();
    inst!.setEnabled(true);
    expect(inst!.isEnabled()).toBe(true);
    expect(q('.fab')).toBeTruthy();
    inst!.setEnabled(false);
    expect(document.querySelector('[data-fox-report]')).toBeNull();
  });

  it('showButton=false não renderiza FAB, mas open() abre o fluxo', async () => {
    make({ showButton: false });
    expect(document.querySelector('[data-fox-report]')).toBeTruthy();
    expect(q('.fab')).toBeNull();
    inst!.open();
    await flush();
    expect(q('.layer')).toBeTruthy();
  });

  it('isola estilos no shadow root e marca o host para as capturas', () => {
    make();
    const host = document.querySelector('[data-fox-report]') as HTMLElement;
    expect(host.hasAttribute('data-fox-ui')).toBe(true);
    expect(host.shadowRoot?.querySelector('style')).toBeTruthy();
    expect(document.head.querySelector('style')).toBeNull();
  });
});

describe('fluxo de relato', () => {
  it('captura, seleciona, descreve e envia o payload com contexto e rede', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ id: '12345', url: 'https://ene.monday.com/boards/1/pulses/12345' }));
    const onSent = vi.fn();
    make({
      project: 'Portal eNe',
      reporter: 'user:ana',
      types: ['Bug', 'Layout'],
      fetch: fetchMock as unknown as typeof fetch,
      onSent,
    });

    click('.fab');
    await flush();
    expect(q('.layer')).toBeTruthy();
    click('.bar .primary');
    await flush();
    click('.tools .done');
    await flush();
    expect(q('.sheet')).toBeTruthy();
    expect(q<HTMLImageElement>('.preview')!.src).toBe(PNG);

    click('.chips button');
    const ta = q<HTMLTextAreaElement>('#fox-text')!;
    ta.value = 'O total do pedido aparece vazio.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    click('.send');
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe('/api/fox-report');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(String(init.body));
    expect(payload.description).toBe('O total do pedido aparece vazio.');
    expect(payload.types).toEqual(['Bug']);
    expect(payload.project).toBe('Portal eNe');
    expect(payload.reporter).toBe('user:ana');
    expect(payload.region).toBe(PNG);
    expect(payload.full).toBe(PNG);
    expect(payload.context.sdk.name).toBe('@foxtag/fox-report');
    expect(Array.isArray(payload.context.network)).toBe(true);
    expect(payload.context.region).toEqual({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });

    expect(onSent).toHaveBeenCalledWith({ id: '12345', url: 'https://ene.monday.com/boards/1/pulses/12345' });
    // confirmação simples: sem link do Monday e sem mencionar onde foi parar
    expect(q('.sent a')).toBeNull();
    expect(q('.sent')!.textContent).toContain('encaminhado ao suporte');
    expect(q('.sent')!.textContent).not.toContain('Monday');

    // "Fechar" é um botão comum (não link), centralizado, e fecha a confirmação
    const close = q<HTMLButtonElement>('.sent ~ .close-btn')!;
    expect(close.textContent).toBe('Fechar');
    expect(q('.sheet .link')).toBeNull();
    close.click();
    expect(q('.sheet')).toBeNull();
  });

  it('não menciona Monday nem mostra link na confirmação mesmo com url do item', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ id: '99', url: 'https://qualquer.monday.com/boards/2/pulses/99' }));
    make({ fetch: fetchMock as unknown as typeof fetch });
    click('.fab');
    await flush();
    click('.bar .primary');
    await flush();
    click('.tools .done');
    await flush();
    const ta = q<HTMLTextAreaElement>('#fox-text')!;
    ta.value = 'Relato com url';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    click('.send');
    await flush();
    expect(q('.sent')).toBeTruthy();
    expect(q('.sent a')).toBeNull();
    expect(q('.sent')!.textContent).not.toContain('monday');
  });

  it('mostra erro quando a captura falha', async () => {
    make({ captureFn: async () => { throw new Error('sem permissão'); } });
    click('.fab');
    await flush();
    expect(q('.toast')!.textContent).toContain('Não foi possível capturar a tela');
    expect(q('.layer')).toBeNull();
  });

  it('mantém a descrição e exibe erro quando o envio falha', async () => {
    const onError = vi.fn();
    make({ fetch: (async () => jsonRes({ error: 'boom' }, 502)) as unknown as typeof fetch, onError });
    click('.fab');
    await flush();
    click('.bar .primary');
    await flush();
    click('.tools .done');
    await flush();
    const ta = q<HTMLTextAreaElement>('#fox-text')!;
    ta.value = 'Layout quebrado';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    click('.send');
    await flush();
    expect(q('.error')!.textContent).toContain('Não foi possível enviar');
    expect(q<HTMLTextAreaElement>('#fox-text')!.value).toBe('Layout quebrado');
    expect(onError).toHaveBeenCalled();
  });
});

describe('anexo do usuário e tema', () => {
  const pickFile = async (input: HTMLInputElement, file: File) => {
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await flush();
  };

  it('permite anexar arquivo, mostrar o nome e enviar no payload', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ id: '7' }));
    make({ fetch: fetchMock as unknown as typeof fetch });
    click('.fab');
    await flush();
    click('.bar .primary');
    await flush();
    click('.tools .done');
    await flush();

    const input = q<HTMLInputElement>('#fox-attach')!;
    expect(input).toBeTruthy();
    await pickFile(input, new File(['conteúdo do log'], 'erro-do-app.log', { type: 'text/plain' }));
    expect(q('.attach-btn')!.textContent).toContain('erro-do-app.log');
    expect(q('.attach-size')!.textContent).toContain('B');

    const ta = q<HTMLTextAreaElement>('#fox-text')!;
    ta.value = 'Com anexo';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    click('.send');
    await flush();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.attachment.name).toBe('erro-do-app.log');
    expect(payload.attachment.type).toBe('text/plain');
    expect(payload.attachment.size).toBe(16);
    expect(payload.attachment.dataUrl).toContain('base64,');
  });

  it('permite remover o anexo antes de enviar', async () => {
    make();
    click('.fab');
    await flush();
    click('.bar .primary');
    await flush();
    click('.tools .done');
    await flush();
    const input = q<HTMLInputElement>('#fox-attach')!;
    await pickFile(input, new File(['x'], 'arquivo.zip', { type: 'application/zip' }));
    expect(q('.attach-btn')!.textContent).toContain('arquivo.zip');
    click('.attach-clear');
    expect(q('.attach-btn')!.textContent).not.toContain('arquivo.zip');
    expect(q('.attach-btn')!.textContent).toContain('Anexar arquivo');
  });

  it('recusa arquivo acima do limite configurado', async () => {
    make({ maxAttachmentBytes: 10 });
    click('.fab');
    await flush();
    click('.bar .primary');
    await flush();
    click('.tools .done');
    await flush();
    const input = q<HTMLInputElement>('#fox-attach')!;
    await pickFile(input, new File(['conteúdo maior que dez bytes'], 'grande.txt', { type: 'text/plain' }));
    expect(q('.attach-note')!.textContent).toContain('grande demais');
    expect(q('.attach-btn')!.textContent).toContain('Anexar arquivo');
  });

  it('colorScheme força o tema light ou dark', () => {
    make({ colorScheme: 'dark' });
    expect(q('.fox')!.getAttribute('data-scheme')).toBe('dark');
    inst!.destroy();
    inst = null;
    make({ colorScheme: 'light' });
    expect(q('.fox')!.getAttribute('data-scheme')).toBe('light');
  });

  it('position muda o canto do FAB (padrão bottom-right)', () => {
    make();
    expect(q('.fab-wrap.bottom-right')).toBeTruthy();
    inst!.destroy();
    inst = null;
    make({ position: 'top-left' });
    expect(q('.fab-wrap.top-left')).toBeTruthy();
    expect(q('.fab-wrap.bottom-right')).toBeNull();
  });
});

describe('anotações na seleção da região', () => {
  const drag = (el: HTMLElement, from: [number, number], to: [number, number]) => {
    const ev = (type: string, [x, y]: [number, number]) => el.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, button: 0 }));
    ev('pointerdown', from);
    ev('pointermove', to);
    ev('pointerup', to);
  };
  const open = async (fetchMock?: ReturnType<typeof vi.fn>) => {
    make(fetchMock ? { fetch: fetchMock as unknown as typeof fetch } : {});
    click('.fab');
    await flush();
    drag(q('.layer')!, [100, 100], [400, 300]);
    await flush();
  };

  it('depois de selecionar a área, continua na tela com a régua de ferramentas', async () => {
    await open();
    expect(q('.layer.annotating')).toBeTruthy();
    expect(q('.sheet')).toBeNull();
    expect(q('.tools')!.getAttribute('role')).toBe('toolbar');
    expect(q('.tools [data-tool="arrow"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('.tools .tool[data-tool="rect"]')).toBeTruthy();
    expect(q('.tools .tool[data-tool="ellipse"]')).toBeTruthy();
    expect(q('.tools .tool[data-tool="pen"]')).toBeTruthy();
  });

  it('troca de ferramenta e de cor', async () => {
    await open();
    click('.tools [data-tool="ellipse"]');
    expect(q('.tools [data-tool="ellipse"]')!.getAttribute('aria-pressed')).toBe('true');
    expect(q('.tools [data-tool="arrow"]')!.getAttribute('aria-pressed')).toBe('false');
    const second = shadow().querySelectorAll<HTMLElement>('.tools .swatch')[1];
    second.click();
    expect(q(`.tools .swatch[data-color="${second.dataset.color}"]`)!.getAttribute('aria-pressed')).toBe('true');
  });

  it('desfazer e limpar só ficam ativos com marcações', async () => {
    await open();
    expect(q<HTMLButtonElement>('[data-act="undo"]')!.disabled).toBe(true);
    const canvas = q('canvas.draw')!;
    drag(canvas, [150, 150], [300, 250]);
    drag(canvas, [160, 160], [320, 260]);
    expect(q<HTMLButtonElement>('[data-act="undo"]')!.disabled).toBe(false);
    click('[data-act="undo"]');
    expect(q<HTMLButtonElement>('[data-act="clear"]')!.disabled).toBe(false);
    click('[data-act="clear"]');
    expect(q<HTMLButtonElement>('[data-act="undo"]')!.disabled).toBe(true);
  });

  it('grava as marcações na imagem enviada; clique solto não vira marca', async () => {
    const fetchMock = vi.fn(async () => jsonRes({ id: '1' }));
    await open(fetchMock);
    click('.tools [data-tool="rect"]');
    const canvas = q('canvas.draw')!;
    drag(canvas, [150, 150], [152, 151]); // pequeno demais
    drag(canvas, [150, 150], [350, 280]);
    click('.tools .done');
    await flush();

    const [, shapes, viewport] = renderAnnotations.mock.calls[0];
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ tool: 'rect', pts: [{ x: 150, y: 150 }, { x: 350, y: 280 }] });
    expect(viewport).toEqual({ w: window.innerWidth, h: window.innerHeight });

    const ta = q<HTMLTextAreaElement>('#fox-text')!;
    ta.value = 'Botão desalinhado';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    click('.send');
    await flush();
    const payload = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(payload.region).toBe(ANNOTATED);
    expect(payload.full).toBe(ANNOTATED);
  });

  it('o desenho fica preso à área escolhida', async () => {
    await open();
    drag(q('canvas.draw')!, [10, 10], [900, 900]);
    click('.tools .done');
    await flush();
    const shape = renderAnnotations.mock.calls[0][1][0];
    expect(shape.pts[0]).toEqual({ x: 100, y: 100 });
    expect(shape.pts[1]).toEqual({ x: 400, y: 300 });
  });

  it('sem marcações, "Continuar" segue direto com a imagem original', async () => {
    await open();
    click('.tools .done');
    await flush();
    expect(q('.sheet')).toBeTruthy();
    expect(q<HTMLImageElement>('.preview')!.src).toBe(PNG);
  });

  it('"Escolher outra área" volta à seleção descartando as marcações', async () => {
    await open();
    drag(q('canvas.draw')!, [150, 150], [300, 250]);
    click('.tools .text-btn');
    await flush();
    expect(q('.layer.annotating')).toBeNull();
    expect(q('.layer')).toBeTruthy();
    drag(q('.layer')!, [50, 50], [300, 300]);
    await flush();
    click('.tools .done');
    await flush();
    expect(renderAnnotations.mock.calls[0][1]).toEqual([]);
  });

  it('Escape cancela e desfaz com Ctrl+Z', async () => {
    await open();
    drag(q('canvas.draw')!, [150, 150], [300, 250]);
    q('.layer')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(q<HTMLButtonElement>('[data-act="undo"]')!.disabled).toBe(true);
    q('.layer')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(q('.layer')).toBeNull();
  });
});
