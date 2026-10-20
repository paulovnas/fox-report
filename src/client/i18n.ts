import type { Strings } from './types';

export const DEFAULT_STRINGS: Strings = {
  button: 'Relatar um problema',
  loading: 'Carregando…',
  captureFailed: 'Não foi possível capturar a tela. Tente de novo.',
  selectHint: 'Arraste uma caixa em volta do problema',
  selectTooSmall: 'Arraste uma área maior ou escolha Tela inteira.',
  selectCutFailed: 'Não foi possível recortar essa área. Tente de novo ou escolha Tela inteira.',
  wholeScreen: 'Tela inteira',
  cancel: 'Cancelar',
  title: 'Relatar um problema',
  anotherArea: 'Escolher outra área',
  previewAlt: 'Área selecionada',
  descriptionLabel: 'O que está errado ou faltando?',
  descriptionPlaceholder: 'Diga o que você vê e o que esperava.',
  typesLabel: 'Tipo (opcional)',
  send: 'Enviar relato',
  sending: 'Enviando…',
  sentTitle: 'Enviado. Obrigado.',
  sentBody: 'O relato foi registrado no quadro do Monday.',
  openItem: 'Abrir a tarefa no Monday',
  sendFailed: 'Não foi possível enviar o relato. Sua descrição foi mantida, tente de novo.',
  close: 'Fechar',
};

export function resolveStrings(overrides: Partial<Strings> | undefined): Strings {
  return { ...DEFAULT_STRINGS, ...(overrides ?? {}) };
}
