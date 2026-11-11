# Alana Rosa — Limpeza de Alto Padrão
## Especificação de projeto

**Data:** 11 de novembro de 2026
**Cliente final:** Alana da Silva Rosa — Florianópolis, Santa Catarina
**Solicitante:** Rafael Cunha (irmão)
**Caráter:** presente-surpresa. A Fase 1 é construída sem o conhecimento dela.

---

## 1. Intenção

A Alana presta serviço de limpeza de alto padrão em Florianópolis — residências,
escritórios e comercial. Ela é qualificada, fez cursos, vive disso, ganha bem e já
tem nome na região. Tem uma carteira de clientes fixos e também busca novas
oportunidades.

O que falta não é trabalho: é **estrutura**. Hoje a credibilidade dela circula por
indicação, a agenda vive na cabeça e no WhatsApp, e o controle do dinheiro é
informal.

Este projeto entrega três coisas, nesta ordem de importância para ela:

1. **Uma ferramenta de trabalho** — agenda, clientes, orçamentos e controle
   financeiro em um lugar só, com um agente que trabalha junto com ela.
2. **Credibilidade profissional** — um site que sustenta o preço que ela cobra e
   que ela pode mandar para qualquer cliente novo.
3. **Atendimento que não dorme** — um agente que responde, orça e propõe horários
   às duas da manhã de domingo.

### Sucesso se parece com isso

- Ela abre o painel pela manhã e vê o dia dela sem abrir mais nada.
- Um cliente novo pede orçamento às 23h e recebe resposta na hora.
- No fim do mês ela sabe exatamente quanto entrou, quanto saiu e quem deve.
- Ela manda o link do site e o cliente entende, em dez segundos, que aquilo é
  trabalho sério.
- **O agente resolve sozinho o que cabe nas regras dela, e só a incomoda quando
  não cabe.** Ela dorme e acorda com a agenda resolvida.

A regra que não se negocia não é "ela aprova tudo" — um agente que pede autorização
para cada horário livre é só mais uma notificação para ela responder. Marcar dentro
da disponibilidade que ela mesma definiu não é o agente decidindo por ela: é ela
tendo decidido antes. A regra é esta:

> **O agente nunca inventa exceção.** Dentro das regras dela, ele age. Fora das
> regras, ele não negocia, não improvisa e não dá um jeitinho: ele passa para ela
> (regra 5.5).

### O que este projeto não é

- Não é um marketplace de diaristas. É a ferramenta dela.
- Não é um sistema com usuários múltiplos. Há uma profissional: ela.
- Não é um chat que finge trabalhar. Os agentes operam no banco de dados real.

---

## 2. Duas fases, por causa da surpresa

Algumas peças são impossíveis de construir sem ela, por motivo legal e não técnico:
cobrança exige conta bancária no nome dela; WhatsApp exige o número dela.

### Fase 1 — a surpresa (este documento)

Entrega completa e funcionando, povoada com dados de exemplo, em endereço privado:

- Site público
- Fluxo de solicitação de agendamento
- Painel privado com agenda, clientes, serviços e financeiro
- Agente de atendimento (público) e agente dela (painel)
- Formulário de configuração que transforma as respostas dela em sistema real
- Botão que apaga todos os dados de exemplo de uma vez

### Fase 2 — com ela, depois da revelação

- WhatsApp ligado ao número dela
- Pix e cartão, em conta no nome dela (CPF ou MEI)
- Sincronia com Google Calendar
- Google Meu Negócio e busca local em Florianópolis
- Domínio próprio e saída do modo invisível

### Regras da surpresa, enquanto ela não sabe

1. Deploy em endereço privado da Vercel, protegido por senha.
2. `noindex, nofollow` em todas as páginas até ela aprovar.
3. Nenhum meio de cobrança real conectado.
4. Nenhum número de telefone ou e-mail real de cliente dela no repositório ou no
   banco. Os dados de exemplo são inventados e marcados como tal.
5. Nada é publicado em rede social, Google ou diretório.

---

## 3. Arquitetura

Uma única aplicação Next.js (App Router) na Vercel, com três superfícies:

```
  PÚBLICO                      PRIVADO (login dela)
  ─────────────────            ──────────────────────────
  /                 vitrine    /painel            o dia dela e o que o agente fez
  /servicos         serviços   /painel/agenda     semana e mês
  /sobre            história   /painel/clientes   carteira
  /galeria          trabalhos  /painel/servicos   preços
  /agendar          solicita   /painel/financeiro entra e sai
  /orcamento        agente     /painel/assistente o agente dela
                               /configurar        o formulário
```

**Camadas.** As regras de negócio ficam em módulos puros, sem banco e sem React,
em `lib/dominio/`: `agenda.ts`, `orcamento.ts`, `financeiro.ts`. Eles recebem dados
e devolvem decisões. São eles que os testes cobrem, e são eles que as rotas da API,
as páginas e as ferramentas dos agentes chamam — as três entram pela mesma porta,
então não existe caminho onde a regra valha diferente.

O acesso ao banco fica em `lib/dados/`, uma função por operação. As páginas não
escrevem SQL.

**Decisões técnicas**

| Peça | Escolha | Por quê |
|---|---|---|
| Framework | Next.js App Router, TypeScript | Padrão da plataforma, renderização no servidor para o site carregar rápido no celular |
| Hospedagem | Vercel | Deploy privado com senha de graça, que é exatamente o que a surpresa exige |
| Banco, login e fotos | Supabase (recomendado) | Postgres, autenticação e armazenamento de imagem numa conta só. Provisionamento segue a skill `vercel-storage` na hora de implementar |
| Agentes | AI SDK pelo Vercel AI Gateway | Troca de modelo sem reescrever código |
| Estilo | Tailwind | Velocidade, e o design é autoral e não de biblioteca |
| Testes | Vitest nas regras, Playwright nos fluxos | As regras de dinheiro e de horário não podem errar |

---

## 4. Modelo de dados

Toda tabela carrega `is_demo boolean default false`. É isso que permite apagar os
dados de exemplo sem tocar nos reais quando ela assumir o sistema.

| Tabela | Guarda | Campos que importam |
|---|---|---|
| `perfil` | Ela. Uma linha só | nome, apresentação, história, telefone, cidade, bairros atendidos, redes |
| `servicos` | O que ela faz | nome, descrição, forma de cobrança (`hora`, `m2`, `diaria`, `sob_orcamento`), preço base, duração estimada, ativo |
| `clientes` | A carteira | nome, telefone, e-mail, endereço, tipo de imóvel, metragem, observações, origem (`indicacao`, `site`, `instagram`), frequência |
| `agendamentos` | A agenda | cliente, serviço, início, duração, endereço, status, valor combinado, observações |
| `pagamentos` | O que entra | agendamento, cliente, valor, método, data prevista, data paga, status |
| `despesas` | O que sai | descrição, categoria, valor, data, recorrente |
| `disponibilidade` | Quando ela trabalha | dia da semana, hora início, hora fim |
| `bloqueios` | Quando não | início, fim, motivo |
| `depoimentos` | Prova social | nome, texto, serviço, publicado |
| `galeria` | Trabalhos | imagem, legenda, serviço, ordem |
| `conversas` / `mensagens` | Histórico dos agentes | papel, conteúdo, ferramentas chamadas |
| `respostas_configuracao` | O formulário dela | seção, pergunta, resposta, respondido em |

**Ciclo de vida de um agendamento**

```
                      ┌─ cabe nas regras ──> confirmado ──> concluido ──> pago
pedido do cliente ────┤                           │              │
                      └─ não cabe ──> aguardando_ela ─┐          └─> (a receber)
                                            │         │
                                      (ela decide)    └──> cancelado
                                       ├─> confirmado
                                       └─> recusado
```

O agente **confirma direto** o pedido que cabe nas regras dela (regra 5.5). O que
não cabe vira `aguardando_ela`, que **segura o horário** enquanto ela não responde,
para o horário não ser vendido duas vezes. Se ela não responder no prazo, a reserva
cai e o cliente é avisado com honestidade.

Uma solicitação do site que não casa com nenhum telefone existente cria um cliente
novo com origem `site`. Não existe tabela separada de lead: um interessado já é um
cliente com histórico vazio.

---

## 5. As regras que não podem errar

Estas têm teste automático antes de existir implementação. As regras 5.5, 5.6 e 5.7
são as mais delicadas do projeto: é onde o agente age sem ninguém olhando.

**5.1 Conflito de horário.** Dois agendamentos confirmados não podem se sobrepor.
A duração considerada é a do serviço mais um intervalo de deslocamento
configurável (padrão 30 minutos) quando o endereço seguinte é diferente. Um
agendamento `aguardando_ela` **bloqueia** o horário enquanto a decisão dela não
sai, para o agente não vender o mesmo horário duas vezes.

**5.2 Horários livres.** Calculados, nunca cadastrados:
`disponibilidade − bloqueios − agendamentos confirmados`, em blocos do tamanho do
serviço pedido, respeitando antecedência mínima (padrão 24 horas).

**5.3 Orçamento.** Pela forma de cobrança do serviço: por hora, por metro
quadrado, por diária. Serviço marcado `sob_orcamento` **nunca devolve número** —
devolve "a Alana avalia e retorna com o valor". Inventar preço de serviço que não
tem tabela é pior que não responder.

**5.4 Financeiro.** Sem dupla contagem:
- **Entrou** = pagamentos com status `pago` e data paga no período
- **A receber** = pagamentos `pendente` + agendamentos `concluido` sem pagamento
- **Saiu** = despesas no período
- **Saldo** = entrou − saiu

**5.5 Até onde o agente vai sozinho.** Três faixas. É o coração do projeto.

**Verde — o agente confirma na hora, sem incomodar ninguém.** Todas as condições
juntas:

- o horário está dentro da disponibilidade dela e livre, com o deslocamento contado
- o serviço tem forma de cobrança com tabela — ou seja, dá preço fechado
- o endereço está na região atendida
- respeita a antecedência mínima
- não passa do limite de carga do dia nem da semana (regra 5.6)

Confirmado, ele registra, avisa o cliente e deixa o recado no painel para ela ver
quando acordar. **Este é o caminho normal, e é onde a maioria dos pedidos morre
resolvida.**

**Amarela — o agente tenta resolver antes de incomodar.** O pedido não cabe, mas há
saída: o horário está ocupado, cai fora do expediente, é para amanhã e a antecedência
é de 24 horas, ou lotaria o dia. O agente **oferece até duas alternativas** que
cabem na faixa verde. Se o cliente aceitar uma, confirma — e ninguém precisou acordar
a Alana.

**Vermelha — vai para ela, sempre.** Aqui o agente não negocia:

- serviço `sob_orcamento`, que não tem preço de tabela
- pedido de desconto, parcelamento ou qualquer conversa de valor fora da tabela
- endereço fora da região atendida
- cancelamento em cima da hora, com dinheiro envolvido
- o cliente pedir para falar com ela
- qualquer coisa que o agente não entendeu

**O que é "o cliente insistiu".** Precisa ser regra, ou o agente escala tudo ou nada.
Escala para ela quando acontece **qualquer um** destes:

1. o cliente recusou as duas alternativas oferecidas
2. o cliente pediu para falar com a Alana
3. o cliente voltou ao mesmo pedido já recusado uma terceira vez
4. o cliente alegou urgência ou emergência
5. o pedido caiu na faixa vermelha

**Como ela é avisada.** Notificação no celular com o caso resumido em duas linhas, o
que o agente já tentou, e dois botões: aceitar ou recusar. Ela responde com um toque,
sem abrir conversa. Em uma linha de texto, se quiser, ela manda a contraproposta e o
agente leva ao cliente.

**Se ela não responder.** Prazo configurável, padrão 2 horas em horário comercial, e
até as 9h da manhã se o pedido chegou de madrugada. Passado o prazo, a reserva cai e
o agente diz a verdade ao cliente: "a Alana vai avaliar e te retorna". **O cliente
nunca fica no silêncio**, e ela nunca é acordada de madrugada por um pedido que pode
esperar o café.

**O freio.** Um botão no painel: *pausar o agente*. Pausado, ele continua atendendo e
anotando, e não confirma mais nada. Para a semana em que ela está doente, viajando ou
simplesmente sem querer gente nova.

**5.6 Limite de carga.** O agente não pode encher a agenda dela até a exaustão só
porque havia espaço no calendário. Teto configurável por dia e por semana — padrão
dois serviços por dia e seis horas de trabalho — e respeito aos dias que ela marcou
como livres. Estourar o teto é faixa amarela: o agente oferece outro dia.

**5.7 Dois clientes, um horário.** Agora que o agente confirma sozinho, duas
conversas simultâneas podem fechar o mesmo horário. A reserva é feita em transação
com trava no banco: o segundo pedido falha e cai na faixa amarela, com alternativas.
Teste: dois pedidos disparados no mesmo instante para o mesmo horário resultam em um
confirmado e um com alternativas — nunca em dois confirmados.

**5.8 Limpeza dos dados de exemplo.** O botão apaga toda linha com `is_demo = true`
e nenhuma outra, em todas as tabelas, em uma transação. Teste: povoar com exemplo
e real, limpar, conferir que o real sobreviveu inteiro.

---

## 6. Os agentes

Dois, com poderes diferentes, porque quem fala com o cliente não pode ver o
faturamento dela.

### 6.1 Agente de atendimento — público

Atende 24 horas e **fecha agendamento sozinho** dentro da faixa verde da regra 5.5.
É ele que faz o trabalho pesado: listar serviços, orçar (5.3), achar horário (5.2),
confirmar, remarcar dentro das regras, mandar lembrete, e passar para ela só o que
não couber.

Não pode: ver dado financeiro, ver outros clientes, dar desconto, cobrar, aceitar
serviço sem preço de tabela, atender fora da região, ou prometer o que ela não
ofereceu.

Quando confirma, diz "está marcado" — porque está. Quando escala, não enrola o
cliente: diz que vai confirmar com a Alana e dá o prazo.

### 6.2 Agente dela — painel

Conversa, não formulário. Ela escreve ou fala como falaria com uma secretária:

> "quanto entrou esse mês?"
> "remarca a dona Helena pra quinta de manhã"
> "quem está devendo?"
> "faz um orçamento de apartamento de 120 metros, pós-obra"
> "lembra de mim amanhã de levar o aspirador na casa da Cristina"

Pode tudo o que ela pode: agenda, clientes, serviços, pagamentos, despesas,
resumos.

**Confirmação obrigatória, aqui sim.** No painel o contexto é outro: ela está
conversando, e o risco é o agente entender errado uma frase ambígua. Então ações que
mexem na vida de alguém — cancelar, remarcar um cliente já confirmado, registrar
pagamento, mudar preço — o agente **propõe** e a interface mostra um cartão com o que
vai acontecer e um botão. A ferramenta executa depois do toque dela.

Isso não contradiz a autonomia da regra 5.5: lá o agente age dentro de regras que ela
escreveu antes, com o pedido do cliente na mão. Aqui ele estaria interpretando uma
frase dela, agora — e interpretar frase é onde erro acontece.

**O resumo da madrugada.** Primeira coisa que ela vê ao abrir o painel: o que o
agente confirmou, o que negociou e o que está esperando ela decidir. Em dez segundos
ela sabe o que aconteceu enquanto dormia.

Nenhum dos dois agentes tem ferramenta de exclusão permanente.

**Idioma e tom:** português do Brasil, como se fala em Florianópolis. Direto,
respeitoso, sem gerúndio de call center. O tom final sai das respostas dela no
formulário (seção 7.9).

---

## 7. O formulário de configuração

Em `/configurar`, privado. Não é pesquisa: **é a instalação do sistema**. Cada
resposta grava configuração real. Quando ela termina, o site é dela e não mais uma
demonstração.

Salva a cada passo, pode ser preenchido em pedaços, e sai em PDF para quem preferir
preencher numa conversa.

| # | Seção | O que colhe | Onde vira |
|---|---|---|---|
| 7.1 | Sobre você | Como quer ser chamada, uma frase sobre o trabalho, a história, anos de experiência | Home, página Sobre |
| 7.2 | Qualificação | Cursos, certificados, especialidades, o que te diferencia | Seção de credibilidade |
| 7.3 | Serviços | O que faz, como cobra, quanto, quanto tempo leva | Tabela `servicos`, orçamentos |
| 7.4 | Região | Bairros, até onde vai, cobra deslocamento | Agendamento, site |
| 7.5 | Agenda | Dias, horários, intervalo entre serviços, antecedência mínima, quantos serviços por dia aguenta, dias sagrados | `disponibilidade`, limite de carga (5.6) |
| 7.6 | Clientes | Os fixos: nome, telefone, serviço, frequência, valor | `clientes`, `agendamentos` |
| 7.7 | Dinheiro | Como recebe, Pix, cobra antecipado, despesas fixas | Financeiro, Fase 2 |
| 7.8 | Imagem | Fotos de trabalhos, depoimentos de clientes | `galeria`, `depoimentos` |
| 7.9 | O agente | Tom, o que nunca dizer, o que fazer quando não souber, o que sempre perguntar | Instruções dos agentes |
| 7.10 | A coleira do agente | Quanta liberdade ele tem: pode fechar com cliente novo sozinho? até que horário pode marcar? aceita pedido para o dia seguinte? em quanto tempo ela consegue responder uma notificação? | Faixas da regra 5.5 |

As seções 7.9 e 7.10 são as mais importantes e as que ninguém pensa em perguntar.
A 7.9 impede o agente de falar em nome da Alana de um jeito que a Alana não falaria.
A 7.10 é onde ela ajusta a coleira: no primeiro mês talvez queira aprovar cliente
novo na mão e, vendo que o agente acerta, vá soltando. **O sistema nasce com a
coleira curta e ela afrouxa quando confiar — nunca o contrário.**

---

## 8. Design

O site tem um trabalho: sustentar o preço dela. Limpeza de alto padrão não se
anuncia com balão amarelo e "melhor preço da cidade".

- **Paleta** sóbria: off-white, verde profundo, um dourado contido em detalhe
- **Tipografia** serifada no título, sans no corpo — autoridade com legibilidade
- **Espaço branco** generoso. Página limpa de empresa de limpeza não é piada, é
  argumento.
- **Fotos grandes**, pouco texto. O trabalho dela se mostra.
- **Celular primeiro.** Os clientes dela chegam pelo telefone, quase todos.
- **Acessível:** contraste aprovado, navegação por teclado, tema claro e escuro.

O painel segue outra lógica: densidade de informação, o dia dela acima da dobra,
nada de enfeite. Ferramenta, não vitrine.

---

## 9. Testes

**Vitest, nas regras (seção 5):** conflito de horário com e sem deslocamento,
horários livres com bloqueio e com antecedência, orçamento nas quatro formas de
cobrança, serviço `sob_orcamento` não devolvendo número, financeiro sem dupla
contagem, limpeza de exemplo preservando o real.

**Playwright, nos fluxos:** solicitar agendamento do site até a solicitação
aparecer no painel; login do painel; confirmar uma solicitação; registrar
pagamento; preencher uma seção do formulário e ver o site mudar.

**Nas ferramentas dos agentes:** cada ferramenta testada direto, e um teste que
garante que nenhuma ferramenta destrutiva executa sem a confirmação.

---

## 10. Privacidade e LGPD

- O formulário de agendamento colhe o mínimo: nome, telefone, endereço do serviço.
- Consentimento explícito no envio, com finalidade declarada.
- Dados de cliente servem para prestar o serviço, e nada mais. Sem rastreador de
  terceiro, sem pixel, sem revenda.
- Analytics só o da Vercel, que não usa cookie nem identifica pessoa.
- O painel é dela: um usuário, autenticado.
- Segredos em variável de ambiente. Nenhuma chave no repositório.

---

## 11. Riscos

| Risco | Resposta |
|---|---|
| Os dados de exemplo parecerem reais e ela se confundir | Faixa visível "dados de exemplo" em todo o painel enquanto houver `is_demo` |
| O agente marcar algo sozinho e furar a agenda dela | Ele só confirma na faixa verde (5.5), com conflito e deslocamento calculados (5.1) e trava no banco contra horário vendido duas vezes (5.7) |
| O agente encher a agenda dela até a exaustão | Teto de serviços por dia e de horas por semana (5.6), definido por ela |
| Ela não confiar no agente e conferir tudo na mão, perdendo o ganho | Coleira ajustável (7.10): começa curta e ela afrouxa ao ver que acerta. E o resumo da madrugada no topo do painel, para conferir em dez segundos |
| Notificação de madrugada atrapalhando o sono dela | Pedido de madrugada espera as 9h; só horário comercial notifica na hora (5.5) |
| O cliente ficar no vácuo esperando decisão dela | Prazo com queda automática: vencido o prazo, o agente assume e diz que ela retorna (5.5) |
| O agente inventar preço | Serviço sem tabela devolve "ela retorna com o valor" (5.3), com teste |
| Ela não gostar e o presente virar peso | A Fase 1 não compromete nada: nada no ar, nada cobrando, nada no nome dela. Se ela não quiser, não custou nada além do meu trabalho |
| A surpresa vazar por indexação | `noindex` e senha no deploy desde o primeiro commit, não depois |
| Ela achar complicado | O painel abre no dia de hoje, e o agente aceita conversa em vez de formulário. Quem sabe usar WhatsApp sabe usar isso |

---

## 12. Fora de escopo nesta fase

Explicitamente deixados de fora, por decisão e não por esquecimento: aplicativo
nativo, múltiplas profissionais ou equipe, emissão de nota fiscal, controle de
estoque de produtos de limpeza, assinatura recorrente automática, integração
contábil. Nenhum deles é necessário para ela trabalhar melhor na segunda-feira.

---

## 13. Pendências para a Fase 2, com ela

1. Número de WhatsApp e escolha do provedor (Meta Cloud API ou Twilio)
2. CPF ou abertura de MEI, conta e chave Pix
3. Meio de pagamento, provisionado pelo Marketplace da Vercel
4. Fotos reais e depoimentos autorizados pelos clientes
5. Domínio próprio
6. Aprovação dela para sair do modo invisível
