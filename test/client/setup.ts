// jsdom não implementa captura de ponteiro; os testes de seleção só precisam dos no-ops.
if (typeof HTMLElement !== 'undefined') {
  HTMLElement.prototype.setPointerCapture = () => {};
  HTMLElement.prototype.releasePointerCapture = () => {};
}
