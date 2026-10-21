// jsdom não implementa captura de ponteiro; os testes de seleção só precisam dos no-ops.
if (typeof HTMLElement !== 'undefined') {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
}

// jsdom não implementa canvas; um contexto que aceita qualquer chamada evita ruído nos testes de anotação.
if (typeof HTMLCanvasElement !== 'undefined') {
  const ctx = new Proxy({}, { get: (_t, prop) => (prop === 'canvas' ? null : () => {}), set: () => true });
  HTMLCanvasElement.prototype.getContext = (() => ctx) as unknown as typeof HTMLCanvasElement.prototype.getContext;
}
