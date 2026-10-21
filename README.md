# @foxtag/fox-report (Fox Report)

<a href="https://github.com/paulovnas/fox-report"><img src="assets/fox-report.png" width="150" align="right" alt="Logo Fox Report: raposa geométrica dentro de uma moldura de seleção"></a>

Widget universal de relato de bugs para aplicações web, com captura da aba,
da região selecionada e do contexto do momento do erro. Cada relato vira uma
tarefa no Monday, com update detalhado e as duas imagens anexadas.

## Veja funcionando

Fluxo real do widget, capturado na página de demonstração (`examples/demo`):

**1. O app habilita o módulo e o botão aparece** (aqui, no canto inferior direito — configurável com `position`).

<img src="assets/screenshots/1-botao.png" width="760" alt="Página de pedidos com o botão flutuante do Fox Report no canto inferior direito">

**2. O usuário arrasta uma caixa em volta do problema** (ou escolhe "Tela inteira").

<img src="assets/screenshots/2-selecao.png" width="760" alt="Seleção de região: a linha do pedido #10232 destacada e o restante da tela escurecido">

**3. Anota a captura** com a régua de ferramentas: seta, retângulo, círculo, caneta, 4 cores, desfazer e limpar. As marcações ficam gravadas nas imagens enviadas.

<img src="assets/screenshots/3-anotacao.png" width="760" alt="Régua de anotação com círculo em volta de R$ NaN, retângulo no botão e uma seta">

**4. Descreve o problema.** O preview já mostra a região recortada com as anotações; é possível escolher o tipo e anexar um arquivo.

<img src="assets/screenshots/4-formulario.png" width="760" alt="Formulário Relatar um problema com preview anotado, descrição e tipo Bug selecionado">

**5. Envia.** A confirmação é simples — o usuário não vê detalhes de onde o relato foi parar.

<img src="assets/screenshots/5-enviado.png" width="760" alt="Confirmação: Enviado. Obrigado. Seu relato foi encaminhado ao suporte.">

### Rodar a demonstração localmente

A página funciona **sem rede e sem servidor de relatos**: o `fetch` do widget é
substituído por um servidor simulado, então nada é enviado ao Monday.

```bash
npm install
npm run demo                                   # gera examples/demo/fox-report.demo.js
python3 -m http.server 4173 --directory examples/demo
# abra http://localhost:4173
```

A caixa "Módulo Fox Report habilitado" no topo da página mostra o controle do
app sobre o botão (`enabled` / `setEnabled`).

O pacote tem dois pontos de entrada:

- `@foxtag/fox-report` — widget client, sem dependência de framework.
- `@foxtag/fox-report/server` — handler `(Request) => Promise<Response>` que valida o
  relato e o encaminha para a API do Monday.

O token do Monday fica **somente no servidor**. O navegador nunca o recebe.

## Arquitetura

```
navegador                         servidor do app                 Monday
┌──────────────────────┐   POST   ┌──────────────────────┐  GraphQL  ┌────────────────────┐
│ createFoxReport()    │ ───────▶ │ createFoxReportHandler│ ────────▶ │ board do projeto   │
│ captura + contexto   │  JSON    │ valida + rate limit  │           │ Esteira: item +    │
│ (sem token)          │          │ MONDAY_API_TOKEN     │           │ zip + anexos       │
└──────────────────────┘          └──────────────────────┘           └────────────────────┘
```

Um board por projeto (grupos **Esteira**/**Histórico**); a automação do
Monday move itens finalizados para Histórico (ver "Organização no Monday").

O widget é ativado apenas quando o app decide (`enabled` padrão é `false`).
Instalar o pacote não exibe botão nenhum.

## Requisitos

- Node.js 18.17+ no servidor (fetch, `FormData` e `Blob` nativos).
- Navegador com suporte a Shadow DOM e `PointerEvent` (navegadores atuais).
- Token de API do Monday com permissão para criar quadro, colunas, grupos,
  itens, updates e anexos no board informado (`boardId`).

## Instalação

```bash
npm install @foxtag/fox-report
```

Alternativa offline (sem registry): gere o tarball e instale o arquivo:

```bash
npm run build
npm pack            # gera fox-report-0.1.0.tgz
npm install /caminho/fox-report-0.1.0.tgz
```

Dependência de runtime: `html-to-image` (captura do DOM no navegador).

## Release

O workflow [`.github/workflows/release.yml`](.github/workflows/release.yml)
publica no npm a cada tag `v*` (roda typecheck, testes, build e
`npm publish --provenance`):

1. Configure o secret **`NPM_TOKEN`** (token *Automation* gerado em
   npmjs.com → Access Tokens) em GitHub → Settings → Secrets and variables →
   Actions do repositório.
2. Suba a versão e crie a tag: `npm version patch` (ou `minor`/`major`) —
   cria commit + tag `v0.x.y`.
3. `git push --follow-tags` — a Action publica e o release aparece no npm;
   crie a release correspondente na aba **Releases** do GitHub para o
   changelog.

## Configuração mínima

O SDK **não lê variáveis de ambiente nem arquivos de configuração**: as chaves
são parâmetros passados na criação. De onde o app as obtém — `.env`, secrets
manager, config central, banco — **é decisão de cada projeto**; basta chegar
no parâmetro do SDK. Nos exemplos usamos `process.env`/`.env.local` apenas
por ser o caminho comum em Node.

- **Servidor:** `token` (obrigatório) em `createFoxReportHandler` e
  `createBoardTemplate` — nunca no navegador.
- **Cliente:** não precisa de chave; só `endpoint`, `project` e o controle
  `enabled`.

### 1. Servidor: token + projeto

Um exemplo obtendo o token de variável de ambiente (uma das opções):

```dotenv
# .env.local do SEU app — só um exemplo de origem; use o que preferir.
MONDAY_API_TOKEN=seu-token-do-monday
```

O projeto pode vir da configuração do servidor ou do relato:

```ts
// app/api/fox-report/route.ts (Next.js App Router)
import { createFoxReportHandler } from '@foxtag/fox-report/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let handler: ReturnType<typeof createFoxReportHandler> | null = null;
function getHandler() {
  if (!handler) {
    const token = process.env.MONDAY_API_TOKEN;
    const boardId = process.env.MONDAY_BOARD_ID;
    if (!token || !boardId) throw new Error('MONDAY_API_TOKEN e MONDAY_BOARD_ID não configurados.');
    handler = createFoxReportHandler({
      token,
      boardId, // board criado por você (duplicando o template do Fox Report)
      project: process.env.MONDAY_PROJECT ?? 'Portal eNe',
    });
  }
  return handler;
}

export function POST(request: Request) { return getHandler()(request); }
export function OPTIONS(request: Request) { return getHandler()(request); }
```

Em Express/Fastify ou qualquer runtime com `Request`/`Response` web, adapte a
requisição para o padrão Fetch e chame o handler. O exemplo
`examples/react-vite/server.mjs` mostra a adaptação com `node:http`.

### 2. Cliente: só aparece quando o app habilitar

```ts
import { createFoxReport } from '@foxtag/fox-report';

const report = createFoxReport({
  endpoint: '/api/fox-report',
  project: 'Portal eNe',
  enabled: appConfig.foxReportEnabled, // config do SEU app; padrão do pacote é false
});
```

`enabled` aceita `boolean` ou `() => boolean`. O padrão é `false`: a simples
instalação do pacote não cria botão. Para alternar em runtime (feature flag,
tela de configurações), use `report.setEnabled(true | false)`.

Se o app já tem o próprio botão de feedback, desligue o FAB e abra o fluxo:

```ts
const report = createFoxReport({
  endpoint: '/api/fox-report',
  project: 'Portal eNe',
  enabled: true,
  showButton: false,
});

document.querySelector('#meu-botao')!.addEventListener('click', () => report.open());
```

Destrua a instância quando o app desmontar:

```ts
report.destroy();
```

## Exemplos

### React (Vite)

`examples/react-vite` contém uma demo executável:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { createFoxReport } from '@foxtag/fox-report';

export function App() {
  const [moduleEnabled, setModuleEnabled] = useState(true);
  const [customTrigger, setCustomTrigger] = useState(false);

  const report = useMemo(() => createFoxReport({
    endpoint: '/api/fox-report',
    project: 'Portal eNe',
    enabled: false,                 // o app liga abaixo
    showButton: !customTrigger,     // gatilho próprio quando true
    reporter: 'user:ana',
    metadata: () => ({ app: 'portal', version: '2.3.0' }),
    onSent: result => console.log('relato', result.id, result.url),
  }), [customTrigger]);

  useEffect(() => {
    report.setEnabled(moduleEnabled);
    return () => report.destroy();
  }, [report, moduleEnabled]);

  return (
    <>
      <label>
        <input type="checkbox" checked={moduleEnabled} onChange={e => setModuleEnabled(e.target.checked)} />
        Fox Report habilitado
      </label>
      <label>
        <input type="checkbox" checked={customTrigger} onChange={e => setCustomTrigger(e.target.checked)} />
        Usar gatilho próprio
      </label>
      {customTrigger && moduleEnabled && <button onClick={() => report.open()}>Relatar problema</button>}
    </>
  );
}
```

```bash
cd examples/react-vite
cp .env.example .env.local   # preencha o token
npm install
npm run api                  # API em http://localhost:8787
npm run dev                  # app em http://localhost:5173 (proxy /api)
```

### Next.js (App Router)

`examples/nextjs/app/api/fox-report/route.ts` é o endpoint e
`examples/nextjs/app/page.tsx` é o componente client com o controle
condicional (`NEXT_PUBLIC_FOX_REPORT_ENABLED` e `setEnabled`).

```bash
cd examples/nextjs
cp .env.example .env.local   # preencha o token
npm install
npm run dev
```

Importante: o módulo que cria o handler deve ser inicializado na requisição
(como no exemplo) para que `next build` não exija o token.

## O que cada relato contém

- Descrição obrigatória e tipos escolhidos (chips).
- Projeto (define o board no Monday) e reporter opcional.
- **PNG da região selecionada** e **PNG da aba inteira**. Depois de arrastar a
  área, o usuário pode anotar a captura com a régua de ferramentas (seta,
  retângulo, círculo, caneta, 4 cores, desfazer e limpar); as marcações ficam
  gravadas nas duas imagens e o desenho fica restrito à área escolhida. Os
  rótulos são textos de `strings` (`toolArrow`, `toolRect`, `annotateHint`...).
- URL redigida, título, viewport, DPR, scroll e data/hora da captura.
- Caminho e texto dos elementos sob a região (até 8).
- Erros de console e exceções não tratadas dos últimos 60s (até 30).
- Requisições `fetch`/`XMLHttpRequest` da janela configurada (até 50).
- `metadata()` do app (versão, ambiente, usuário — JSON até 8 KB).
- Versão do SDK.

Inputs, `textarea`, `select`, `input[type=password]` e elementos com
`data-fox-mask` são cobertos nas imagens. Use `mask`/`exclude` para seletores
adicionais.

O servidor redige novamente `context.url` e `network[].url` com a mesma lista
padrão do cliente (`token`, `password`, `secret`, `api_key`, `session`...).
Isso protege contra um POST direto no endpoint que ignore a redação do
widget; parâmetros adicionais podem ser informados em `redactParams`.

## Organização no Monday

> **Guias:** [compatibilidade do board com o SDK](docs/monday-board.md) ·
> [prompt pronto para um agente de IA criar/configurar o board](docs/ai-board-prompt.md)

**O handler publica em um board fixo, informado por `boardId`** — ele nunca
cria board, então o board que você apontar já vem com as automações
configuradas. Fluxo recomendado:

1. Crie o board do projeto **duplicando o "Fox Report — Template"**
   (`createBoardTemplate`) e renomeie a cópia — a duplicação copia as
   automações.
2. Configure as automações no template uma vez (Status → Histórico; receita
   abaixo).
3. Informe o `boardId` da cópia no handler.

O handler garante (de forma idempotente) que o board tem os grupos e colunas
do padrão — sem tocar no resto do board:

- Grupos: **Esteira** (novos relatos são sempre criados aqui) e **Histórico**.
- Colunas:

| Coluna | Tipo | Conteúdo |
| --- | --- | --- |
| Name | name | descrição (até 140 caracteres) |
| Status | status | Novo, Em andamento, Em análise, Bloqueado, Adiado, Resolvido, Não será tratado — relatos nascem em **Novo** |
| Tipo | status | Bug, Layout, Conteúdo ou Outro (finalidade separada do Status) |
| Página | link | URL do relato + título |
| Capturado em | date | data do relato |
| Projeto | text | projeto informado |
| Reporter | text | identificação opcional |
| App | text | `metadata.app`/`version` |
| Browser | text | user agent |
| Viewport | text | largura × altura e DPR |
| Console | numbers | quantidade de erros |
| Requests | numbers | quantidade de requisições |

Cada item recebe um **update** em HTML formatado (títulos em negrito, listas)
com relato, página, elementos,
console, requisições, metadados e uma seção de anexos. O update recebe:

- `region.png` (região selecionada) e `full.png` (aba inteira);
- **`fox-report-<item>.zip`** — pacote com tudo: `report.json`, `network.json`
  (URLs redigidas, headers com nomes sensíveis redigidos, corpos quando
  `networkBodies` estiver ativo), `console.json`, `metadata.json`,
  `region.png`, `full.png` e o anexo do usuário em `anexo/`;
- o **arquivo anexado pelo usuário** no widget (documento, zip, log…), com o
  nome original.

### Movimentação automática para Histórico

A movimentação é feita pela **automação nativa do Monday** (o SDK não move
itens). A API do Monday não permite criar automações, então configure-a uma
vez por board — ou configure-a no template e duplique o board (automações são
copiadas na duplicação). Receita (repetir para cada status final):

1. No board, abra **Automações** e escolha **"Quando o status mudar, mover
   item para outro grupo"** (*When a status changes, move item to another
   group*).
2. Condição: coluna **Status** = **Resolvido** → mover para grupo
   **Histórico**.
3. Repita com **Status** = **Não será tratado** → **Histórico**.

Itens com os demais status (Novo, Em andamento, Em análise, Bloqueado,
Adiado) permanecem na Esteira.

### Template de boards

`createBoardTemplate({ token, workspaceId })` cria (ou reaproveita) o board
**"Fox Report — Template"** no padrão da ferramenta. Para um novo projeto:

- configure as automações no template uma vez;
- duplique o board no Monday e renomeie para o nome do projeto (a duplicação
  copia as automações);
- informe o `boardId` da cópia no handler do app.

O handler **nunca cria board** — um `boardId` errado ou apagado devolve 502
com a mensagem do Monday.

### Servidor (Node)

```js
// scripts/create-template.mjs
import { createBoardTemplate } from '@foxtag/fox-report/server';
const { boardId, boardUrl } = await createBoardTemplate({
  token: process.env.MONDAY_API_TOKEN,
  workspaceId: process.env.MONDAY_WORKSPACE_ID,
});
console.log(boardUrl); // configure as automações, duplique por projeto e use o boardId da cópia
```

A resposta do relato inclui `id`, `boardId`, `updateId`, `attachments`
(`region`, `full`, `zip` e `attachment` quando houver anexo) e, quando o slug
da conta é acessível, `url` do item. `handler.ready()` garante colunas/grupos
antes do primeiro relato.

## Referência do cliente

`createFoxReport(options): FoxReportInstance`

| Opção | Padrão | Descrição |
| --- | --- | --- |
| `endpoint` | — | rota do app que recebe o relato |
| `project` | — | projeto, gravado na coluna e usado pelo servidor (até 120 caracteres) |
| `enabled` | `false` | `boolean` ou `() => boolean` |
| `showButton` | `true` | `false` esconde o FAB; use `open()` |
| `reporter` | — | `string` ou `() => string` |
| `position` | `bottom-right` | canto do FAB |
| `offset` | `0` | distância extra em px |
| `zIndex` | `2147483000` | camada do widget |
| `accent` | laranja Fox | cor do FAB e do envio |
| `colorScheme` | `auto` | tema do widget: `'light'`, `'dark'` ou `'auto'` (segue o sistema) |
| `types` | Bug/Layout/Conteúdo/Outro | chips de tipo (`[]` esconde) |
| `strings` | pt-BR | sobrescreve textos |
| `captureConsole` | `true` | erros de console e exceções |
| `network` | `true` | registra fetch/XHR |
| `networkBodies` | `false` | inclui corpos textuais (≤2000) |
| `networkLimit` | `50` | requisições guardadas |
| `networkWindowMs` | `120000` | janela das requisições |
| `maxAttachmentBytes` | 10 MB | tamanho máximo do anexo do usuário |
| `metadata` | — | função sync/async com dados do app |
| `maskInputs` | `true` | cobre campos nas imagens |
| `mask` | `[]` | seletores extras cobertos |
| `exclude` | `[]` | seletores removidos das imagens |
| `redactParams` | lista segura | parâmetros de URL redigidos |
| `maxPixelRatio` | `2` | escala máxima da captura |
| `container` | `document.body` | onde o host é anexado |
| `captureFn` | — | hook de teste/captura customizada |
| `fetch` | `globalThis.fetch` | cliente HTTP customizado |
| `onSent` | — | `({ id, url? }) => void` |
| `onError` | — | `(Error) => void` |

Métodos: `open()`, `close()`, `setEnabled(boolean)`, `isEnabled()`,
`destroy()`.

## Referência do servidor

`createFoxReportHandler(options)` devolve uma função
`(req: Request) => Promise<Response>` com `ready()` para garantir colunas e
grupos antes do primeiro relato.

| Opção | Padrão | Descrição |
| --- | --- | --- |
| `token` | obrigatório | token do Monday (server-side) |
| `boardId` | obrigatório | ID do board que recebe os relatos (duplicado do template); nunca cria board |
| `project` | `Geral` | projeto padrão, gravado na coluna quando o relato não envia |
| `allowedOrigins` | só mesma origem | origens cross-origin permitidas |
| `maxBodyBytes` | 48 MB | limite do JSON |
| `maxImageBytes` | 10 MB | limite de cada PNG |
| `maxAttachmentBytes` | 10 MB | limite do anexo do usuário (o Monday aceita até 500 MB por arquivo) |
| `maxDescription` | 4000 | limite da descrição |
| `redactParams` | — | parâmetros de URL extras redigidos (além da lista padrão) |
| `rateLimit` | 10/min por IP | `false` desliga |
| `fetch` | global | cliente HTTP para testes/proxy |
| `logger` | — | `(scope, message) => void` |
| `onReport` | — | callback após criar o item |

> **Migração da v0.1:** `workspaceId`/`boardPrefix`/criação automática de
> boards saíram — o handler agora exige `boardId` (duplicado do template,
> com automações prontas). Vários projetos = um endpoint (e um `boardId`)
> por projeto.

Respostas: `201` com `{ id, url?, boardId, updateId, attachments }`;
`400` validação; `403` origem; `413` tamanho; `415` content-type;
`429` rate limit; `502` erro do Monday; `405` método.

## Limitações reais do navegador

- **Não é screenshot do sistema operacional.** O widget reconstrói o DOM com
  `html-to-image`. Conteúdo fora do viewport não entra, e iframes de outra
  origem, vídeos protegidos (DRM), canvas “tainted” e imagens sem CORS podem
  sair vazios ou fazer a captura falhar. Não há como contornar isso apenas
  com JavaScript.
- **Sem permissão de tela.** Não é necessário autorizar captura, mas também
  não é possível capturar outras abas, janelas, barra do navegador ou
  extensões.
- **CSP e recursos externos.** Estilos são injetados no shadow root; páginas
  com CSP restritiva podem bloquear estilos inline ou imagens/fontes usadas na
  reconstrução. O erro é exibido ao usuário e enviado ao `onError`.
- **Mascaramento é best-effort.** Cobrimos campos de formulário, senhas e
  seletores indicados, mas não há detecção automática de PII. O update inclui
  texto de elementos e a imagem completa da aba: trate o quadro como dado
  sensível.
- **Console** guarda apenas `console.error`, `error` e
  `unhandledrejection` dos últimos 60 segundos (até 30 entradas). `console.log`
  e eventos anteriores à criação do SDK não entram.
- **Network** cobre somente `fetch` e `XMLHttpRequest` iniciados após o SDK.
  WebSocket, EventSource, `sendBeacon`, navegações e recursos estáticos não são
  registrados. Corpos são opt-in, apenas textuais, truncados em 500 caracteres
  e podem não estar disponíveis em respostas opacas. A redação atua por nome de
  parâmetro; parâmetros desconhecidos podem conter dados sensíveis.
- **Imagens** viajam como data URL PNG e têm limite de 10 MB cada no servidor.
  Páginas muito grandes ou com muitos elementos podem falhar/ficar lentas.
- **Sem fila offline.** Se o envio falhar, a descrição é mantida na tela para
  nova tentativa, mas não há armazenamento local nem retry automático.
- **Sem listagem/download.** O widget não lista relatos nem gera ZIP; o
  acompanhamento acontece no Monday. Textos são pt-BR com override via
  `strings` (sem multi-locale).
- **Autenticação é responsabilidade do app.** O handler aplica CORS, rate
  limit e limites de tamanho, mas não autentica usuários. Coloque o endpoint
  atrás da sessão/proxy do seu app; não exponha o token no cliente.
- **Monday**: o token precisa dos escopos de criação; erros de permissão viram
  `502` com detalhe. A coluna Tipo usa os quatro rótulos padrão (tipos fora
  deles caem em “Outro”). Anexos são feitos no update e podem demorar alguns
  segundos para aparecer. Limites de rate limit do próprio Monday se aplicam.

## Desenvolvimento e testes

```bash
npm install
npm run typecheck
npm test                 # vitest + jsdom (client) e fetch mockado (server)
npm run build
```

Teste real com a API do Monday (cria template/boards de teste, itens, update, zip e anexos; requer
`.env.local` com `MONDAY_API_TOKEN`):

```bash
npm run build
npm run test:integration
```

O teste verifica via GraphQL nome do quadro, 10 colunas, grupos por projeto,
update com seções, `region.png`/`full.png` anexados e que uma segunda execução
não duplica quadro, colunas nem grupos. O token nunca é impresso.

## Créditos

Partes do widget e do hardening do handler foram adaptadas do
[bugframe](https://github.com/vmatheus3/bug-frame), de vmatheus3 e
colaboradores, sob licença MIT. A captura usa
[html-to-image](https://github.com/bubkoo/html-to-image), de W.Y., também MIT.
Veja `THIRD_PARTY_NOTICES.md`.
