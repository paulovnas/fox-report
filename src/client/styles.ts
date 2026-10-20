/* Todos os estilos ficam no shadow root: a página não estiliza a ferramenta e vice-versa. */
export const CSS_TEXT = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.ene { --ene-ink: #14171f; --ene-bg: #ffffff; --ene-muted: #5b6577; --ene-line: #d5dbe6; --ene-soft: #eef1f6; --ene-ok: #15803d; --ene-err: #b91c1c; --ene-accent: #c2410c; --ene-on-accent: #ffffff;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; font-size: 16px; line-height: 1.4; color: var(--ene-ink); -webkit-text-size-adjust: 100%; }
.ene[data-scheme="dark"] { --ene-ink: #eef1f7; --ene-bg: #1b2030; --ene-muted: #9aa5ba; --ene-line: #38405a; --ene-soft: #262c40; --ene-ok: #4ade80; --ene-err: #f87171; }
@media (prefers-color-scheme: dark) { .ene[data-scheme="auto"] { --ene-ink: #eef1f7; --ene-bg: #1b2030; --ene-muted: #9aa5ba; --ene-line: #38405a; --ene-soft: #262c40; --ene-ok: #4ade80; --ene-err: #f87171; } }
button { font: inherit; color: inherit; }
.fab-wrap { position: fixed; z-index: var(--ene-z, 2147483000); display: block;
  --ix: calc(16px + var(--ene-x, 0px)); --iy: calc(16px + var(--ene-y, 0px)); }
.fab-wrap.bottom-right { right: calc(var(--ix) + env(safe-area-inset-right, 0px)); bottom: calc(var(--iy) + env(safe-area-inset-bottom, 0px)); }
.fab-wrap.bottom-left { left: calc(var(--ix) + env(safe-area-inset-left, 0px)); bottom: calc(var(--iy) + env(safe-area-inset-bottom, 0px)); }
.fab-wrap.top-right { right: calc(var(--ix) + env(safe-area-inset-right, 0px)); top: calc(var(--iy) + env(safe-area-inset-top, 0px)); }
.fab-wrap.top-left { left: calc(var(--ix) + env(safe-area-inset-left, 0px)); top: calc(var(--iy) + env(safe-area-inset-top, 0px)); }
.fab { position: relative; width: 48px; height: 48px; border-radius: 50%; border: 2px solid #fff; background: var(--ene-accent); color: var(--ene-on-accent); display: grid; place-items: center; box-shadow: 0 4px 14px rgba(10,14,24,.3); cursor: pointer; padding: 0; }
.fab:focus-visible, .ene button:focus-visible, .ene textarea:focus-visible, .layer:focus-visible { outline: 3px solid #2563eb; outline-offset: 2px; }
.fab svg { width: 24px; height: 24px; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
.layer { position: fixed; z-index: calc(var(--ene-z, 2147483000) + 1); inset: 0; background: rgba(10,14,24,.5); touch-action: none; cursor: crosshair; user-select: none; -webkit-user-select: none; outline-offset: -4px; }
.rect { position: absolute; border: 2px solid #fff; outline: 2px dashed var(--ene-accent); background: transparent; box-shadow: 0 0 0 100vmax rgba(10,14,24,.55); pointer-events: none; }
.bar { position: absolute; left: 50%; top: calc(env(safe-area-inset-top, 0px) + 8px); transform: translateX(-50%); width: max-content; max-width: calc(100vw - 16px); padding: 8px 10px; display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px; background: #14171f; color: #fff; border-radius: 14px; box-shadow: 0 6px 20px rgba(10,14,24,.4); cursor: default; pointer-events: none; }
.bar > span { flex: 0 1 auto; padding: 0 4px; }
@media (max-width: 600px) { .bar > span { flex: 1 1 100%; text-align: center; } }
.bar button { min-height: 44px; padding: 0 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,.5); background: transparent; color: #fff; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; pointer-events: auto; }
.bar button.primary { background: #fff; color: #14171f; font-weight: 600; }
.bar svg { width: 18px; height: 18px; }
.backdrop { position: fixed; z-index: calc(var(--ene-z, 2147483000) + 2); inset: 0; background: rgba(10,14,24,.55); }
.sheet { position: absolute; left: 0; right: 0; max-height: 92vh; max-height: 92dvh; overflow-y: auto; background: var(--ene-bg); color: var(--ene-ink); border-radius: 18px 18px 0 0; padding: 14px 16px calc(16px + env(safe-area-inset-bottom, 0px)); display: flex; flex-direction: column; gap: 10px; box-shadow: 0 -8px 30px rgba(10,14,24,.35); outline: none; }
@media (min-width: 801px) { .sheet { left: 50%; right: auto; width: 480px; transform: translateX(-50%); bottom: 24px !important; border-radius: 18px; } }
.sheet header { display: flex; align-items: center; justify-content: space-between; }
.sheet h2 { margin: 0; font-size: 20px; }
.x { width: 44px; height: 44px; border: 0; background: none; display: grid; place-items: center; cursor: pointer; }
.x svg { width: 20px; height: 20px; }
.preview { display: block; max-width: 100%; max-height: 30vh; max-height: 30dvh; margin: 0 auto; border: 1px solid var(--ene-line); border-radius: 10px; object-fit: contain; background: var(--ene-soft); }
.link { align-self: flex-start; min-height: 44px; padding: 0; border: 0; background: none; color: #2563eb; text-decoration: underline; cursor: pointer; }
.ene[data-scheme="dark"] .link { color: #8ab4ff; }
@media (prefers-color-scheme: dark) { .ene[data-scheme="auto"] .link { color: #8ab4ff; } }
.sheet label { font-weight: 600; }
.sheet textarea { width: 100%; padding: 10px 12px; border: 1px solid var(--ene-line); border-radius: 10px; font: inherit; font-size: 16px; resize: vertical; color: inherit; background: var(--ene-bg); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; border: 0; margin: 0; padding: 0; min-width: 0; }
.chips legend { padding: 0; font-weight: 600; margin-bottom: 6px; }
.chips button { min-height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid var(--ene-line); background: var(--ene-bg); cursor: pointer; }
.chips button.is-on { background: var(--ene-ink); color: var(--ene-bg); border-color: var(--ene-ink); }
.send { min-height: 48px; border: 0; border-radius: 12px; background: var(--ene-accent); color: var(--ene-on-accent); font-size: 17px; font-weight: 600; cursor: pointer; }
.send:disabled { opacity: .45; cursor: not-allowed; }
.error { margin: 0; color: var(--ene-err); font-size: 15px; }
.sent { display: grid; justify-items: center; gap: 6px; padding: 24px 0; text-align: center; color: var(--ene-ok); } .sent span { color: var(--ene-muted); } .sent svg { width: 28px; height: 28px; }
.sent a { color: #2563eb; font-weight: 600; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media print { .ene { display: none !important; } }
`;
