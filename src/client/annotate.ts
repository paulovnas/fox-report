/* Anotações sobre a captura: formas em coordenadas do viewport, desenhadas igual no canvas ao vivo e na imagem final. */
import type { Pt, Shape, Tool } from './types';

export const TOOLS: Tool[] = ['arrow', 'rect', 'ellipse', 'pen'];
export const COLORS = ['#ef4444', '#facc15', '#3b82f6', '#22c55e'];
const LINE = 4;
const MIN_DRAG = 4;

/** Uma forma só vale se o gesto saiu do lugar (um clique solto não vira marca). */
export function isMeaningful(s: Shape): boolean {
  if (s.tool === 'pen') return s.pts.length > 2;
  const [a, b] = s.pts;
  return Math.hypot(b.x - a.x, b.y - a.y) >= MIN_DRAG;
}

/** Pontos da cabeça da seta em `to`, apontando de `from` para `to`. */
export function arrowHead(from: Pt, to: Pt): [Pt, Pt] {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const len = Math.min(26, Math.max(12, Math.hypot(to.x - from.x, to.y - from.y) * 0.35));
  const wing = (delta: number): Pt => ({ x: to.x - len * Math.cos(angle + delta), y: to.y - len * Math.sin(angle + delta) });
  return [wing(Math.PI / 6), wing(-Math.PI / 6)];
}

export function drawShape(ctx: CanvasRenderingContext2D, s: Shape): void {
  const [a, b] = [s.pts[0], s.pts[s.pts.length - 1]];
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.lineWidth = LINE;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (s.tool === 'rect') ctx.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  else if (s.tool === 'ellipse') ctx.ellipse((a.x + b.x) / 2, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2);
  else if (s.tool === 'arrow') {
    const [l, r] = arrowHead(a, b);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(r.x, r.y);
  } else {
    ctx.moveTo(s.pts[0].x, s.pts[0].y);
    for (const p of s.pts.slice(1)) ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}
