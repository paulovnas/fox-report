import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flush, jsonRes, PNG, q, reset } from './helpers';

vi.mock('../../src/client/capture', async () => {
  const real = await vi.importActual<typeof import('../../src/client/capture')>('../../src/client/capture');
  return { ...real, captureViewport: async () => PNG, maskImage: async (img: string) => img, cropImage: async () => PNG };
});
import { createEneReport, type EneReportInstance, type EneReportOptions } from '../../src/client/index';

let inst: EneReportInstance | null = null;

const make = (options: Partial<EneReportOptions> = {}) => {
  inst = createEneReport({ endpoint: '/api/ene-report', enabled: true, captureFn: async () => PNG, ...options });
  return inst;
};
const click = (sel: string) => {
  const el = q(sel);
  if (!el) throw new Error(`elemento ausente: ${sel}`);
  el.click();
};

beforeEach(() => { reset(); });
afterEach(() => { inst?.destroy(); inst = null; });

describe('montagem e controle do app', () => {
  it('não mostra nada sem enabled: instalar o pacote não exibe o botão', () => {
    make({ enabled: undefined });
    expect(document.querySelector('[data-ene-report]')).toBeNull();
  });

  it('enabled aceita função de configuração do app', () => {
    let flag = false;
    make({ enabled: () => flag });
    expect(document.querySelector('[data-ene-report]')).toBeNull();
    flag = true;
    inst!.setEnabled(true);
    expect(q('.fab')).toBeTruthy();
  });

  it('setEnabled monta e desmonta o widget em runtime', () => {
    make({ enabled: false });
    expect(document.querySelector('[data-ene-report]')).toBeNull();
    inst!.setEnabled(true);
    expect(inst!.isEnabled()).toBe(true);
    expect(q('.fab')).toBeTruthy();
    inst!.setEnabled(false);
    expect(document.querySelector('[data-ene-report]')).toBeNull();
  });

  it('showButton=false não renderiza FAB, mas open() abre o fluxo', async () => {
    make({ showButton: false });
    expect(document.querySelector('[data-ene-report]')).toBeTruthy();
    expect(q('.fab')).toBeNull();
    inst!.open();
    await flush();
    expect(q('.layer')).toBeTruthy();
  });

  it('isola estilos no shadow root e marca o host para as capturas', () => {
    make();
    const host = document.querySelector('[data-ene-report]') as HTMLElement;
    expect(host.hasAttribute('data-ene-ui')).toBe(true);
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
    expect(q('.sheet')).toBeTruthy();
    expect(q<HTMLImageElement>('.preview')!.src).toBe(PNG);

    click('.chips button');
    const ta = q<HTMLTextAreaElement>('#ene-text')!;
    ta.value = 'O total do pedido aparece vazio.';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    click('.send');
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(endpoint).toBe('/api/ene-report');
    expect(init.method).toBe('POST');
    const payload = JSON.parse(String(init.body));
    expect(payload.description).toBe('O total do pedido aparece vazio.');
    expect(payload.types).toEqual(['Bug']);
    expect(payload.project).toBe('Portal eNe');
    expect(payload.reporter).toBe('user:ana');
    expect(payload.region).toBe(PNG);
    expect(payload.full).toBe(PNG);
    expect(payload.context.sdk.name).toBe('@ene/report');
    expect(Array.isArray(payload.context.network)).toBe(true);
    expect(payload.context.region).toEqual({ x: 0, y: 0, w: window.innerWidth, h: window.innerHeight });

    expect(onSent).toHaveBeenCalledWith({ id: '12345', url: 'https://ene.monday.com/boards/1/pulses/12345' });
    expect(q('.sent a')!.getAttribute('href')).toContain('12345');
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
    const ta = q<HTMLTextAreaElement>('#ene-text')!;
    ta.value = 'Layout quebrado';
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    click('.send');
    await flush();
    expect(q('.error')!.textContent).toContain('Não foi possível enviar');
    expect(q<HTMLTextAreaElement>('#ene-text')!.value).toBe('Layout quebrado');
    expect(onError).toHaveBeenCalled();
  });
});
