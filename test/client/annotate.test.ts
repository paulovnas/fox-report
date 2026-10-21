import { describe, expect, it } from 'vitest';
import { arrowHead, drawShape, isMeaningful } from '../../src/client/annotate';
import type { Shape } from '../../src/client/types';

describe('annotate', () => {
  it('isMeaningful descarta cliques soltos', () => {
    const p = { x: 5, y: 5 };
    expect(isMeaningful({ tool: 'rect', color: '#f00', pts: [p, { x: 6, y: 6 }] })).toBe(false);
    expect(isMeaningful({ tool: 'rect', color: '#f00', pts: [p, { x: 40, y: 40 }] })).toBe(true);
    expect(isMeaningful({ tool: 'pen', color: '#f00', pts: [p, p] })).toBe(false);
    expect(isMeaningful({ tool: 'pen', color: '#f00', pts: [p, { x: 9, y: 9 }, { x: 12, y: 3 }] })).toBe(true);
  });

  it('a cabeça da seta fica atrás da ponta, simétrica ao eixo', () => {
    const [l, r] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(l.x).toBeLessThan(100);
    expect(r.x).toBeCloseTo(l.x);
    expect(l.y).toBeCloseTo(-r.y);
  });

  it('desenha cada ferramenta no contexto', () => {
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, k) => (...a: unknown[]) => { calls.push(String(k)); void a; }, set: () => true }) as unknown as CanvasRenderingContext2D;
    const pts = [{ x: 0, y: 0 }, { x: 50, y: 40 }];
    const run = (tool: Shape['tool']) => { calls.length = 0; drawShape(ctx, { tool, color: '#f00', pts }); return [...calls]; };
    expect(run('rect')).toContain('rect');
    expect(run('ellipse')).toContain('ellipse');
    expect(run('arrow').filter(c => c === 'lineTo')).toHaveLength(3);
    expect(run('pen')).toContain('lineTo');
    expect(run('pen').at(-1)).toBe('restore');
  });
});
