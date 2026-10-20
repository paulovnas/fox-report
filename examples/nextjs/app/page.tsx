'use client';

import { useEffect, useMemo, useState } from 'react';
import { createFoxReport } from '@foxtag/fox-report';

export default function Page() {
  const [moduleEnabled, setModuleEnabled] = useState(process.env.NEXT_PUBLIC_FOX_REPORT_ENABLED !== 'false');
  const [useOwnTrigger, setUseOwnTrigger] = useState(false);
  const [sent, setSent] = useState<string | null>(null);

  const report = useMemo(() => createFoxReport({
    endpoint: '/api/fox-report',
    project: 'Portal eNe (Next.js)',
    enabled: false,
    showButton: !useOwnTrigger,
    reporter: 'demo:next',
    metadata: () => ({ app: 'next-example', version: '0.1.0' }),
    onSent: result => setSent(result.url ?? result.id),
    onError: error => console.error('[Fox Report]', error),
  }), [useOwnTrigger]);

  useEffect(() => {
    report.setEnabled(moduleEnabled);
    return () => report.destroy();
  }, [report, moduleEnabled]);

  return (
    <main>
      <h1>Exemplo Next.js (App Router)</h1>
      <p>A mesma tela mostra o controle condicional e o gatilho próprio.</p>

      <section style={{ display: 'grid', gap: 8, marginBottom: 24 }}>
        <label>
          <input type="checkbox" checked={moduleEnabled} onChange={event => setModuleEnabled(event.target.checked)} />
          Módulo Fox Report habilitado
        </label>
        <label>
          <input type="checkbox" checked={useOwnTrigger} onChange={event => setUseOwnTrigger(event.target.checked)} />
          Usar gatilho próprio (showButton: false + open())
        </label>
        {useOwnTrigger && moduleEnabled && (
          <button type="button" onClick={() => report.open()}>Relatar problema</button>
        )}
        {!moduleEnabled && <p>Desligado: nenhum botão do SDK aparece.</p>}
        {sent && <p>Relato enviado: {sent}</p>}
      </section>

      <section style={{ border: '1px solid #ddd', borderRadius: 12, padding: 16, maxWidth: 420 }}>
        <h2>Pedido #1042</h2>
        <p>Total: R$ 0,00</p>
        <input placeholder="Campo sensível (mascarado)" />
      </section>
    </main>
  );
}
