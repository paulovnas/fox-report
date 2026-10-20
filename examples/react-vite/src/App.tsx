import { useEffect, useMemo, useState } from 'react';
import { createEneReport } from '@ene/report';

type Mode = 'off' | 'module' | 'custom';

export default function App() {
  // Simula a configuração do próprio app (feature flag vinda do backend, tela de settings etc.).
  const [moduleEnabled, setModuleEnabled] = useState(true);
  const [mode, setMode] = useState<Mode>('module');
  const [sent, setSent] = useState<string | null>(null);

  const enabled = moduleEnabled && mode !== 'off';
  const report = useMemo(() => createEneReport({
    endpoint: '/api/ene-report',
    project: 'Portal eNe',
    // O pacote nasce desligado; o app decide ligar pela própria configuração.
    enabled: false,
    // No modo "gatilho próprio" não há FAB: o app abre o fluxo com open().
    showButton: mode !== 'custom',
    reporter: 'demo:ana',
    types: ['Bug', 'Layout', 'Conteúdo', 'Outro'],
    metadata: () => ({ app: 'react-vite-example', version: '0.1.0', env: 'demo' }),
    onSent: result => setSent(result.url ?? result.id),
    onError: error => console.error('[eNe Report]', error),
  }), [mode]);

  // enabled também aceita função, mas aqui o app controla em runtime com setEnabled.
  useEffect(() => {
    report.setEnabled(enabled);
    return () => report.destroy();
  }, [report, enabled]);

  return (
    <main>
      <h1>Exemplo React + Vite</h1>
      <p>Simule a tela de pedidos e teste o controle condicional do botão de relato.</p>

      <section>
        <h2>Configuração do app</h2>
        <label>
          <input type="checkbox" checked={moduleEnabled} onChange={e => setModuleEnabled(e.target.checked)} />
          Módulo eNe Report habilitado
        </label>
        <fieldset>
          <legend>Modo de integração</legend>
          {(['off', 'module', 'custom'] as const).map(value => (
            <label key={value}>
              <input type="radio" name="mode" checked={mode === value} onChange={() => setMode(value)} />
              {value === 'off' ? 'Desligado' : value === 'module' ? 'Botão do SDK (padrão)' : 'Gatilho próprio (showButton: false)'}
            </label>
          ))}
        </fieldset>
        {mode === 'custom' && enabled && (
          <button type="button" onClick={() => report.open()}>Relatar problema (gatilho próprio)</button>
        )}
        <p>
          {enabled ? 'O módulo está ligado.' : 'O módulo está desligado: nenhum botão do SDK aparece.'}
        </p>
        {sent && <p>Relato enviado: {sent}</p>}
      </section>

      <section className="card">
        <h2>Pedido #1042</h2>
        <p>Cliente: Maria Silva</p>
        <p>Total: R$ 0,00</p>
        <input placeholder="Campo sensível (mascarado nas capturas)" />
        <button type="button">Salvar</button>
      </section>
    </main>
  );
}
