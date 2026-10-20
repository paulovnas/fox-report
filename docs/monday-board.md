# Compatibilidade do board no Monday

O que o Fox Report **exige** de um board no Monday, o que ele **cria sozinho**
e o que é apenas **convenção opcional**. Verificado contra o código atual
(`src/server/monday.ts`, `src/server/handler.ts`, `src/server/bundle.ts`).

## Como o SDK decide o board

1. O handler é criado com um **`boardId` fixo** — o board que receberá os
   relatos daquela rota. O SDK **nunca cria board**; se o ID não existir, o
   relato falha com 502 e a mensagem do Monday.
2. Modelo de operação: duplique o **"Fox Report — Template"** para cada
   projeto (a duplicação copia colunas, grupos e automações) e informe o
   `boardId` da cópia no app. Um endpoint por projeto.
3. No primeiro relato (e em `handler.ready()`), o SDK garante — de forma
   idempotente — que o board tem os grupos e colunas do padrão, **sem
   alterar nada mais** do board (grupos/colunas que você criou ficam intactos).

## Requisitos de compatibilidade (mudar isso quebra o preenchimento)

| Requisito | Por quê |
| --- | --- |
| **Board existente com `boardId` válido** | O handler não cria board; token sem acesso ao board falha na hora. |
| **Grupo `Esteira`** | Todo relato novo é criado nesse grupo. Se não existir, o SDK cria; mas renomear o grupo existente gera um segundo grupo "Esteira" vazio. |
| **Colunas com estes títulos exatos** | Os valores são gravados por busca de título: `Status`, `Tipo`, `Página`, `Capturado em`, `Projeto`, `Reporter`, `App`, `Browser`, `Viewport`, `Console`, `Requests`. Se um título faltar, o SDK recria a coluna (ficando com colunas duplicadas se você renomear as antigas). |
| **Label `Novo` na coluna Status** | Relatos novos nascem com esse label. Se não existir, o SDK usa o primeiro label existente — o board perde a semântica de triagem. |
| **Labels `Bug`, `Layout`, `Conteúdo`, `Outro` na coluna Tipo** | O primeiro tipo do relato vira o label. Tipos fora da lista caem em `Outro` (ou no primeiro label, se `Outro` não existir). |
| **Token com permissões** | Ler o board, criar colunas/grupos, criar item/update e anexar arquivos ao update (`updates:write`). |

## O que o SDK cria sozinho (idempotente, dentro do board informado)

- **Nada é criado fora do board** (`boardId`): nem board, nem workspace.
- Colunas que faltarem, da tabela abaixo:

| Coluna | Tipo Monday | Conteúdo gravado |
| --- | --- | --- |
| Status | status | label `Novo` no item novo |
| Tipo | status | primeiro tipo do relato (Bug/Layout/Conteúdo/Outro) |
| Página | link | URL redigida + título da página |
| Capturado em | date | data do relato (YYYY-MM-DD) |
| Projeto | text | nome do projeto |
| Reporter | text | identificação opcional (≤120) |
| App | text | `metadata.app`/`version` do app (≤200) |
| Browser | text | user agent (≤200) |
| Viewport | text | `larguraxaltura dpr N` |
| Console | numbers | quantidade de erros de console |
| Requests | numbers | quantidade de requisições capturadas |

- Grupos `Esteira` e `Histórico` (somente se ainda não existirem no board).
- Item na Esteira, update em HTML (relato, página, elementos, console,
  requisições, metadados) e anexos no update:
  - `region.png` (região selecionada) e `full.png` (aba inteira);
  - `fox-report-<itemId>.zip` — pacote completo do relato: `report.json`,
    `network.json` (URLs redigidas, headers de request/response com nomes
    sensíveis redigidos, corpos quando `networkBodies` ativo), `console.json`,
    `metadata.json`, `region.png`, `full.png` e o anexo do usuário em `anexo/`;
  - o **arquivo anexado pelo usuário** (qualquer tipo), com o nome original
    sanitizado — limite configurável (`maxAttachmentBytes`, padrão 10 MB;
    o Monday aceita até 500 MB por arquivo).

## Convenções opcionais (não afetam o funcionamento)

- Kind do board (público/privado), descrição, cores, ordem visual dos grupos.
- Colunas extras criadas por você (o SDK ignora o que não conhece).
- Grupos e itens próprios no board (o SDK só cria na Esteira e não remove
  nada que não criou).
- Renomear o board (o `boardId` não muda; a coluna Projeto é que identifica o
  projeto).
- Automações de movimentação (abaixo) — **necessárias para o fluxo
  Esteira→Histórico**, mas o SDK funciona sem elas (itens apenas não se movem).

## Automações de movimentação (configuração manual, não via API)

A API do Monday **não cria automações**. Configure na interface, uma vez por
board (ou no template, antes de duplicar — a duplicação copia automações):

1. Automações → **"Quando o status mudar, mover item para outro grupo"**.
2. Condição: coluna **Status** = **Resolvido** → mover para **Histórico**.
3. Repetir com **Status** = **Não será tratado** → **Histórico**.

Status restantes (Novo, Em andamento, Em análise, Bloqueado, Adiado) ficam na
Esteira.

## Valores da coluna Status

`Novo` (inicial) · `Em andamento` · `Em análise` · `Bloqueado` · `Adiado` ·
`Resolvido` · `Não será tratado` — os dois últimos disparam a movimentação.

## Template pronto

`createBoardTemplate({ token, workspaceId })` cria (ou reaproveita) o board
**"Fox Report — Template"** com todas as colunas e grupos do padrão. Fluxo
recomendado: configure as automações no template → duplique por projeto →
renomeie a cópia para o nome do projeto.
