# Compatibilidade do board no Monday

O que o Fox Report **exige** de um board no Monday, o que ele **cria sozinho**
e o que é apenas **convenção opcional**. Verificado contra o código atual
(`src/server/monday.ts`, `src/server/handler.ts`).

## Como o SDK decide o board

1. O relato chega ao endpoint do app com `project` (ou o `project` padrão da
   configuração do servidor).
2. O handler procura um board **com esse nome** no workspace informado
   (`workspaceId`, obrigatório), com paginação de até 2.000 boards.
3. Existe → reutiliza. Não existe → cria (`create_board`, público) e remove o
   grupo padrão que o Monday inventa.
4. O nome do board é `boardPrefix` + `project` (sem prefixo, o próprio nome do
   projeto). Board já existente com o mesmo nome é sempre reutilizado — nunca
   duplicado.

## Requisitos de compatibilidade (mudar isso quebra o preenchimento)

| Requisito | Por quê |
| --- | --- |
| **Grupo `Esteira`** | Todo relato novo é criado nesse grupo. Se não existir, o SDK cria; mas renomear o grupo existente gera um segundo grupo "Esteira" vazio. |
| **Colunas com estes títulos exatos** | Os valores são gravados por busca de título: `Status`, `Tipo`, `Página`, `Capturado em`, `Projeto`, `Reporter`, `App`, `Browser`, `Viewport`, `Console`, `Requests`. Se um título faltar, o SDK recria a coluna (ficando com colunas duplicadas se você renomear as antigas). |
| **Label `Novo` na coluna Status** | Relatos novos nascem com esse label. Se não existir, o SDK usa o primeiro label existente — o board perde a semântica de triagem. |
| **Labels `Bug`, `Layout`, `Conteúdo`, `Outro` na coluna Tipo** | O primeiro tipo do relato vira o label. Tipos fora da lista caem em `Outro` (ou no primeiro label, se `Outro` não existir). |
| **Token com permissões** | Ler boards do workspace, criar board/colunas/grupos, criar item/update e anexar arquivos ao update. |
| **`workspaceId` numérico válido** | É onde todos os boards de projeto são criados/procurados. |

## O que o SDK cria sozinho (idempotente)

- Board do projeto (busca por nome; cria se não existir).
- Colunas da tabela abaixo, **com estes conteúdos**:

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

- Grupos `Esteira` e `Histórico` (em board recém-criado, o grupo padrão do
  Monday é removido).
- Item na Esteira, update em HTML (relato, página, elementos, console,
  requisições, metadados) e anexos `region.png` + `full.png` no update.

## Convenções opcionais (não afetam o funcionamento)

- Kind do board (público/privado), descrição, cores, ordem visual dos grupos.
- Colunas extras criadas por você (o SDK ignora o que não conhece).
- Renomear o board depois (o SDK procura pelo nome atual a cada provisionamento
  em memória — renomear muda para qual board os próximos relatos vão).
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
