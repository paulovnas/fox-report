export const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
export const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
export const flush = async () => { for (let i = 0; i < 6; i++) await tick(0); };
export function shadow(): ShadowRoot {
  const host = document.querySelector('[data-fox-report]') as HTMLElement | null;
  if (!host?.shadowRoot) throw new Error('widget não montado');
  return host.shadowRoot;
}
export const q = <T extends HTMLElement = HTMLElement>(sel: string) => shadow().querySelector(sel) as T | null;
export const reset = () => {
  document.body.innerHTML = '';
  history.replaceState(null, '', '/');
};
export const jsonRes = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
