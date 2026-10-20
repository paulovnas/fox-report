# Prompt pronto: criar e configurar um board Fox Report no Monday

Copie o bloco abaixo e envie a um agente de IA (com acesso à API do Monday,
ex.: MCP do Monday). Ele pede as informações necessárias antes de agir e não
presume capacidades que a API não tem. Referência dos requisitos:
[monday-board.md](monday-board.md).

---

```text
Quero que você crie e configure um board no Monday.com no padrão da
ferramenta Fox Report (SDK @foxtag/fox-report). Antes de executar qualquer
operação, faça o seguinte:

1. COLETE AS INFORMAÇÕES QUE FALTAM — não presuma nada:
   - Token de API do Monday (somente servidor; nunca o exiba de volta nem o
     registre em logs).
   - ID numérico do workspace onde o board deve ficar.
   - Nome do projeto que o board representará.
   - Se já existe um board para esse projeto no workspace (se existir, o
     correto é REUTILIZÁ-LO, nunca criar duplicado).

2. O QUE VOCÊ PODE FAZER VIA API (execute):
   - Procurar board pelo nome no workspace informado (com paginação).
   - Criar o board se não existir (board_kind: public).
   - Garantir os grupos exatamente com os títulos "Esteira" e "Histórico".
   - Em board recém-criado, remover o grupo padrão criado automaticamente
     pelo Monday (board novo não tem itens). Em board existente, NUNCA
     remova grupos nem itens que você não criou — eles podem ser do usuário.
   - Garantir as colunas com estes títulos e tipos exatos, criando apenas as
     que faltarem:
       Status (status; labels: Novo, Em andamento, Em análise, Bloqueado,
         Adiado, Resolvido, Não será tratado — "Novo" é o label inicial)
       Tipo (status; labels: Bug, Layout, Conteúdo, Outro)
       Página (link) | Capturado em (date) | Projeto (text) | Reporter (text)
       App (text) | Browser (text) | Viewport (text)
       Console (numbers) | Requests (numbers)
   - Verificar ao final, por query, que grupos e colunas existem.

3. INFORME-ME O boardId FINAL (número) — é ele que o app configura no
   servidor: createFoxReportHandler({ token, boardId, project }).
   O SDK NUNCA cria board; quem decide o board é esta configuração.

4. O QUE VOCÊ NÃO PODE FAZER VIA API (diga ao usuário para fazer na interface
   do Monday; não invente mutação de automação):
   - Criar automações. A API do Monday não permite. O usuário deve abrir o
     board → Automações e criar, para cada status final:
       "Quando o status mudar, mover item para outro grupo":
         Status = Resolvido → mover para o grupo Histórico
         Status = Não será tratado → mover para o grupo Histórico
   - Se eu disser que vou duplicar o board template ("Fox Report — Template")
     para outros projetos, lembre-me de que a duplicação copia as automações
     configuradas no template — e o boardId da cópia é o que vai no app.

5. LIMITES E CUIDADOS:
   - Renomear colunas/grupos depois quebra a compatibilidade com o SDK (ele
     preenche por título e cria duplicatas ao não encontrar). Não renomeie
     nada do padrão.
   - O label "Novo" precisa existir na coluna Status (é o status inicial dos
     relatos).
   - Não crie itens de teste sem eu pedir; se criar, remova ao final.
   - Nunca imprima o token em texto claro na conversa.

Resuma no final: o que fez via API, o que ficou para eu fazer manualmente na
interface (automações), o boardId/URL do board e qualquer desvio encontrado.
```

---

Depois do board pronto, configure a rota do app com `token` + `boardId`
(e `project`, se quiser) e os relatos passam a criar itens na **Esteira**
automaticamente.
