/* Renderiza o viewport visível em PNG (html-to-image, MIT) e recorta a área escolhida.
   Inputs e elementos marcados são cobertos na imagem, sem piscar na página. */
import { drawShape } from './annotate';
import type { Rect, Shape } from './types';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** O clone do html-to-image perde o scroll de contêineres internos; desloca os filhos durante a captura. */
function freezeScrolled(): () => void {
  const undo: (() => void)[] = [];
  document.querySelectorAll<HTMLElement>('*').forEach(el => {
    if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight && el !== document.documentElement && el !== document.body) {
      const shift = el.scrollTop;
      Array.from(el.children).forEach(child => {
        const c = child as HTMLElement, before = c.style.translate;
        c.style.translate = `0 ${-shift}px`;
        undo.push(() => { c.style.translate = before; });
      });
    }
  });
  return () => undo.forEach(fn => fn());
}

export type CaptureOptions = { maxPixelRatio?: number; exclude?: string[] };

export async function captureViewport(opts: CaptureOptions = {}): Promise<string> {
  const { toPng } = await import('html-to-image');
  const w = window.innerWidth, h = window.innerHeight, pixelRatio = Math.min(window.devicePixelRatio || 1, opts.maxPixelRatio ?? 2);
  const exclude = (opts.exclude ?? []).filter(Boolean).join(',');
  const options = {
    width: w,
    height: h,
    pixelRatio,
    cacheBust: false,
    backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
    style: {
      transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)`,
      transformOrigin: 'top left',
      width: `${document.documentElement.scrollWidth}px`,
      height: `${document.documentElement.scrollHeight}px`,
    },
    filter: (node: Node) => {
      if (!(node instanceof Element)) return true;
      if (node.hasAttribute('data-fox-ui')) return false;
      if (exclude) { try { if (node.matches(exclude)) return false; } catch { /* seletor inválido é ignorado */ } }
      return true;
    },
  };
  const restore = freezeScrolled();
  try {
    // O Safari desenha imagens tarde no primeiro render; a primeira passada aquece o cache.
    try { await toPng(document.body, options); } catch { /* a segunda passada reporta o erro real */ }
    await sleep(60);
    return await toPng(document.body, options);
  } finally { restore(); }
}

/** Retângulos do viewport a cobrir: inputs, senhas, `[data-fox-mask]` e seletores do app. */
export function maskRects(opts: { maskInputs: boolean; selectors: string[] }): Rect[] {
  const selectors = ['[data-fox-mask]', 'input[type="password"]', ...opts.selectors];
  if (opts.maskInputs) selectors.push('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"])', 'textarea', 'select', '[contenteditable=""]', '[contenteditable="true"]');
  const rects: Rect[] = [], seen = new Set<Element>();
  for (const sel of selectors.filter(Boolean)) {
    let list: Element[] = [];
    try { list = Array.from(document.querySelectorAll(sel)); } catch { continue; }
    for (const el of list) {
      if (seen.has(el) || el.closest('[data-fox-ui]')) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      rects.push({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
    }
  }
  return rects;
}

export const selectorList = (selectors: string[]) => ['[data-fox-mask]', 'input[type="password"]', ...selectors].join(',');

const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Não foi possível ler a captura de tela.'));
  img.src = src;
});

/** Cobre retângulos do viewport com blocos opacos (qualquer escala de captura). */
export async function maskImage(full: string, rects: Rect[], viewport: { w: number; h: number }): Promise<string> {
  if (!rects.length) return full;
  const img = await load(full), sx = img.naturalWidth / viewport.w, sy = img.naturalHeight / viewport.h;
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não consegue mascarar a captura.');
  ctx.drawImage(img, 0, 0);
  ctx.fillStyle = '#3a3f4b';
  for (const r of rects) ctx.fillRect(Math.floor(r.x * sx), Math.floor(r.y * sy), Math.ceil(r.w * sx), Math.ceil(r.h * sy));
  return canvas.toDataURL('image/png');
}

/** Recorta um PNG do viewport para um retângulo em pixels do viewport. */
export async function cropImage(full: string, rect: Rect, viewport: { w: number; h: number }): Promise<string> {
  const img = await load(full), sx = img.naturalWidth / viewport.w, sy = img.naturalHeight / viewport.h;
  const x = Math.max(0, Math.round(rect.x * sx)), y = Math.max(0, Math.round(rect.y * sy));
  const w = Math.max(1, Math.min(img.naturalWidth - x, Math.round(rect.w * sx)));
  const h = Math.max(1, Math.min(img.naturalHeight - y, Math.round(rect.h * sy)));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não consegue recortar a captura.');
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
  return canvas.toDataURL('image/png');
}

/** Grava as anotações (coordenadas do viewport) por cima da imagem, em qualquer escala de captura. */
export async function renderAnnotations(full: string, shapes: Shape[], viewport: { w: number; h: number }): Promise<string> {
  if (!shapes.length) return full;
  const img = await load(full);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Este navegador não consegue desenhar sobre a captura.');
  ctx.drawImage(img, 0, 0);
  ctx.setTransform(img.naturalWidth / viewport.w, 0, 0, img.naturalHeight / viewport.h, 0, 0);
  for (const s of shapes) drawShape(ctx, s);
  return canvas.toDataURL('image/png');
}
