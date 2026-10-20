import { afterEach, describe, expect, it } from 'vitest';
import { buildContext, componentName, domPath, redactUrl, resetConsoleErrors } from '../../src/client/context';

afterEach(() => { resetConsoleErrors(); document.body.innerHTML = ''; });

describe('redactUrl', () => {
  it('substitui parâmetros sensíveis e preserva os demais', () => {
    const url = redactUrl('https://app.ene.com/pedidos?token=abc123&pedido=42&api_key=zzz');
    expect(url).toContain('token=%5Bredacted%5D');
    expect(url).toContain('api_key=%5Bredacted%5D');
    expect(url).toContain('pedido=42');
  });

  it('aceita lista própria de parâmetros', () => {
    expect(redactUrl('https://x.dev/?cpf=123&id=1', ['cpf'])).not.toContain('123');
    expect(redactUrl('https://x.dev/?cpf=123&id=1', ['cpf'])).toContain('id=1');
  });

  it('não quebra com URL inválida', () => {
    expect(redactUrl('http://[url-invalida')).toBe('http://[url-invalida');
  });

  it('redige também URLs relativas', () => {
    expect(redactUrl('/pedidos?token=abc&id=7')).toBe('/pedidos?token=%5Bredacted%5D&id=7');
  });
});

describe('buildContext', () => {
  it('monta o contexto com dados limitados da página', () => {
    document.title = 'Pedidos';
    document.body.innerHTML = '<main data-component="OrderList"><div id="row-1">Pedido 42</div></main>';
    const ctx = buildContext({ region: { x: 0, y: 0, w: 100, h: 100 }, metadata: { app: 'eNe' }, includeConsole: false, network: [] });
    expect(ctx.title).toBe('Pedidos');
    expect(ctx.url).toContain('http://localhost');
    expect(ctx.viewport.w).toBe(window.innerWidth);
    expect(ctx.metadata.app).toBe('eNe');
    expect(ctx.network).toEqual([]);
    expect(ctx.sdk.name).toBe('@ene/report');
    expect(ctx.sdk.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('omite elementos quando não há região', () => {
    document.body.innerHTML = '<main><div>texto</div></main>';
    expect(buildContext({ region: null, metadata: {}, includeConsole: false }).elements).toEqual([]);
  });
});

describe('localização de elementos', () => {
  it('identifica componente e caminho DOM', () => {
    document.body.innerHTML = '<section data-screen="checkout"><div class="card"><span id="total">R$ 10</span></div></section>';
    const span = document.getElementById('total')!;
    expect(componentName(span)).toContain('screen:checkout');
    expect(domPath(span)).toContain('div.card');
    expect(domPath(span)).toContain('#total');
  });
});
