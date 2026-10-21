/* Todos os estilos ficam no shadow root: a página não estiliza a ferramenta e vice-versa. */
export const CSS_TEXT = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.fox { --fox-ink: #14171f; --fox-bg: #ffffff; --fox-muted: #5b6577; --fox-line: #d5dbe6; --fox-soft: #eef1f6; --fox-ok: #15803d; --fox-err: #b91c1c; --fox-accent: #c2410c; --fox-on-accent: #ffffff;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.4; color: var(--fox-ink); -webkit-text-size-adjust: 100%; }
.fox[data-scheme="dark"] { --fox-ink: #eef1f7; --fox-bg: #1b2030; --fox-muted: #9aa5ba; --fox-line: #38405a; --fox-soft: #262c40; --fox-ok: #4ade80; --fox-err: #f87171; }
@media (prefers-color-scheme: dark) { .fox[data-scheme="auto"] { --fox-ink: #eef1f7; --fox-bg: #1b2030; --fox-muted: #9aa5ba; --fox-line: #38405a; --fox-soft: #262c40; --fox-ok: #4ade80; --fox-err: #f87171; } }
button { font: inherit; color: inherit; }
.fab-wrap { position: fixed; z-index: var(--fox-z, 2147483000); display: block;
  --ix: calc(16px + var(--fox-x, 0px)); --iy: calc(16px + var(--fox-y, 0px)); }
.fab-wrap.bottom-right { right: calc(var(--ix) + env(safe-area-inset-right, 0px)); bottom: calc(var(--iy) + env(safe-area-inset-bottom, 0px)); }
.fab-wrap.bottom-left { left: calc(var(--ix) + env(safe-area-inset-left, 0px)); bottom: calc(var(--iy) + env(safe-area-inset-bottom, 0px)); }
.fab-wrap.top-right { right: calc(var(--ix) + env(safe-area-inset-right, 0px)); top: calc(var(--iy) + env(safe-area-inset-top, 0px)); }
.fab-wrap.top-left { left: calc(var(--ix) + env(safe-area-inset-left, 0px)); top: calc(var(--iy) + env(safe-area-inset-top, 0px)); }
.fab { position: relative; width: 48px; height: 48px; border-radius: 50%; border: 2px solid #fff; background: var(--fox-accent); color: var(--fox-on-accent); display: grid; place-items: center; box-shadow: 0 4px 14px rgba(10,14,24,.3); cursor: pointer; padding: 0; }
.fab:focus-visible, .fox button:focus-visible, .fox textarea:focus-visible, .layer:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
.fab svg { width: 24px; height: 24px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
.layer { position: fixed; z-index: calc(var(--fox-z, 2147483000) + 1); inset: 0; background: rgba(10,14,24,.5); touch-action: none; cursor: crosshair; user-select: none; -webkit-user-select: none; outline-offset: -4px; }
.rect { position: absolute; border: 2px solid #fff; outline: 2px dashed var(--fox-accent); background: transparent; box-shadow: 0 0 0 100vmax rgba(10,14,24,.55); pointer-events: none; }
.bar { position: absolute; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 8px); transform: translateX(-50%); width: max-content; max-width: calc(100vw - 16px); padding: 8px 10px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; background: #14171f; color: #fff; border-radius: 14px; box-shadow: 0 6px 20px rgba(10,14,24,.4); cursor: default; pointer-events: none; }
.bar > span { flex: 0 1 auto; padding: 0 4px; }
@media (max-width: 600px) { .bar > span { flex: 1 1 100%; text-align: center; } }
.bar button { min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,.5); background: transparent; color: #fff; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; pointer-events: auto; }
.bar button.primary { background: #fff; color: #14171f; font-weight: 600; }
.bar svg { width: 18px; height: 18px; }
.layer.annotating { background: transparent; cursor: default; }
.draw { position: absolute; inset: 0; width: 100%; height: 100%; cursor: crosshair; touch-action: none; }
.tools { position: absolute; transform: translateX(-50%); width: max-content; max-width: calc(100vw - 16px); padding: 6px 8px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; background: #14171f; color: #fff; border-radius: 14px; box-shadow: 0 6px 20px rgba(10,14,24,.4); cursor: default; }
.tools button { min-height: 44px; border-radius: 10px; border: 1px solid transparent; background: transparent; color: #fff; display: inline-flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; }
.tools .tool { width: 44px; padding: 0; }
.tools .tool[aria-pressed="true"] { background: #fff; color: #14171f; }
.tools .tool:disabled { opacity: .35; cursor: not-allowed; }
.tools .swatch { width: 32px; min-height: 32px; height: 32px; padding: 0; border-radius: 50%; border: 2px solid transparent; }
.tools .swatch[aria-pressed="true"] { border-color: #fff; box-shadow: 0 0 0 2px #14171f inset; }
.tools .text-btn { padding: 0 10px; border-color: rgba(255,255,255,.5); }
.tools .done { padding: 0 16px; background: #fff; color: #14171f; font-weight: 600; }
.tools .done:disabled { opacity: .6; cursor: progress; }
.tools svg { width: 20px; height: 20px; }
.tools .text-btn svg { width: 16px; height: 16px; }
.tools .sep { width: 1px; height: 24px; background: rgba(255,255,255,.25); }
@media (max-width: 600px) { .tools { left: 50% !important; top: auto !important; bottom: calc(env(safe-area-inset-bottom, 0px) + 8px) !important; } .tools .sep { display: none; } }
.backdrop { position: fixed; z-index: calc(var(--fox-z, 2147483000) + 2); inset: 0; background: rgba(10,14,24,.55); }
.sheet { position: absolute; left: 0; right: 0; max-height: 92vh; max-height: 92dvh; overflow-y: auto; background: var(--fox-bg); color: var(--fox-ink); border-radius: 18px 18px 0 0; padding: 14px 16px calc(16px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 10px; box-shadow: 0 -8px 30px rgba(10,14,24,.35); outline: none; }
@media (min-width: 801px) { .sheet { left: 50%; right: auto; width: 480px; transform: translateX(-50%); bottom: 24px !important; border-radius: 18px; } }
.sheet header { display: flex; align-items: center; justify-content: space-between; }
.sheet h2 { margin: 0; font-size: 20px; }
.x { width: 44px; height: 44px; border: 0; background: none; display: grid; place-items: center; cursor: pointer; }
.x svg { width: 20px; height: 20px; }
.preview { display: block; max-width: 100%; max-height: 30vh; max-height: 30dvh; margin: 0 auto; border: 1px solid var(--fox-line); border-radius: 10px; object-fit: contain; background: var(--fox-soft); }
.link { align-self: flex-start; min-height: 44px; padding: 0; border: 0; background: none; color: #2563eb; text-decoration: underline; cursor: pointer; }
.fox[data-scheme="dark"] .link { color: #8ab4ff; }
@media (prefers-color-scheme: dark) { .fox[data-scheme="auto"] .link { color: #8ab4ff; } }
.sheet label { font-weight: 600; }
.sheet textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--fox-line); border-radius: 10px; font: inherit; font-size: 16px; resize: vertical; color: inherit; background: var(--fox-bg); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; border: 0; margin: 0; padding: 0; min-width: 0; }
.chips legend { padding: 0; font-weight: 600; margin-bottom: 6px; }
.chips button { min-height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid var(--fox-line); background: var(--fox-bg); cursor: pointer; }
.chips button.is-on { background: var(--fox-ink); color: var(--fox-bg); border-color: var(--fox-ink); }
.send { min-height: 48px; border: 0; border-radius: 12px; background: var(--fox-accent); color: var(--fox-on-accent); font-size: 17px; font-weight: 600; cursor: pointer; }
.send:disabled { opacity: .45; cursor: not-allowed; }
.error { margin: 0; color: var(--fox-err); font-size: 15px; }
.attach { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.attach-input { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; clip-path: inset(50%); }
.attach-btn { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px dashed var(--fox-line); background: var(--fox-bg); color: var(--fox-muted); font-size: 14px; cursor: pointer; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.attach-btn:hover, .attach-input:focus-visible + .attach-btn { border-color: var(--fox-accent); color: var(--fox-ink); }
.attach-size { color: var(--fox-muted); font-size: 13px; }
.attach-clear { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid var(--fox-line); background: var(--fox-bg); color: var(--fox-muted); cursor: pointer; }
.attach-clear svg { width: 12px; height: 12px; }
.attach-note { color: var(--fox-err); font-size: 13px; }
.sent { display: grid; justify-items: center; gap: 6px; padding: 20px 0 8px; text-align: center; color: var(--fox-ok); } .sent span { color: var(--fox-muted); }
.sent-icon { width: 56px; height: 56px; border-radius: 50%; display: grid; place-items: center; margin-bottom: 6px; background: rgba(21,128,61,.16); } .sent .sent-icon span { color: inherit; } .sent-icon svg { width: 28px; height: 28px; }
.close-btn { align-self: center; min-width: 140px; min-height: 44px; padding: 0 28px; border: 0; border-radius: 12px; background: var(--fox-accent); color: var(--fox-on-accent); font-size: 16px; font-weight: 600; cursor: pointer; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media print { .fox { display: none !important; } }
`;
