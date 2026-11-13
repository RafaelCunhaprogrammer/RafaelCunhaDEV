# Retomar o projeto no VS Code

Documento de passagem, escrito em 13/11/2026. Serve para você, ou para uma sessão
nova do Claude, continuar o projeto em outra máquina sem redescobrir nada.

---

## 1. Onde o projeto está

**Repositório:** `RafaelCunhaprogrammer/RafaelCunhaDEV`
**Branch de trabalho:** `ccr-4a052c45-61tybg` — é nela que está tudo. A `main` não
tem este trabalho.

Documentos que valem ler, nesta ordem:

| Arquivo | O que é |
|---|---|
| `docs/superpowers/specs/2026-11-11-alana-rosa-design.md` | A especificação. É a autoridade: quando o código e ela divergem, uma das duas está errada e isso é um defeito |
| `docs/superpowers/plans/2026-11-11-alana-rosa.md` | O plano de implementação, 20 tarefas |
| `docs/RETOMAR.md` | Este arquivo |

---

## 2. Instalar na sua máquina

### 2.1 Pré-requisitos

- **Node 22** ou mais novo (o projeto foi construído no 22.23). `node -v` para conferir.
- **Git**
- **Postgres 16** com a extensão `btree_gist` — ver a seção 2.3, que dá dois caminhos.
- **VS Code**

### 2.2 Clonar e instalar

```bash
git clone https://github.com/RafaelCunhaprogrammer/RafaelCunhaDEV.git
cd RafaelCunhaDEV
git checkout ccr-4a052c45-61tybg
npm install
npm test
```

`npm test` tem de passar com **179 testes** e não precisa de banco nenhum. Se passar,
sua instalação está correta e você pode programar sem Postgres por um bom tempo —
toda a lógica de regras é pura e testada sem banco.

### 2.3 O Postgres

O jeito mais simples, se você tiver Docker:

```bash
docker run -d --name pg-alana -p 5433:5432 \
  -e POSTGRES_PASSWORD=alana -e POSTGRES_DB=alana postgres:16
docker exec -it pg-alana psql -U postgres -c "create database alana_teste"
```

Sem Docker, instale o Postgres 16 nativo, crie os dois bancos (`alana` e
`alana_teste`) e garanta que `create extension btree_gist` funciona — o esquema
cria a extensão sozinho, mas o usuário precisa ter permissão.

Depois aplique o esquema:

```bash
psql "postgresql://postgres:alana@localhost:5433/alana" -f supabase/migrations/0001_schema.sql
```

### 2.4 Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha. O `.env.local` é ignorado pelo
git de propósito — **nunca comite valores reais**.

```
DATABASE_URL=postgresql://postgres:alana@localhost:5433/alana
DATABASE_URL_TESTE=postgresql://postgres:alana@localhost:5433/alana_teste
```

O nome do banco de teste **tem de terminar em `_teste`**. Há duas verificações no
código que recusam rodar os testes contra qualquer outro nome, porque eles derrubam
o esquema e truncam todas as tabelas.

### 2.5 Comandos

| Comando | O que faz |
|---|---|
| `npm test` | Suíte de regras, 179 testes, **sem banco** |
| `npm run test:db` | Testes de banco. **Hoje falha no arranque** — ver seção 4 |
| `npm run test:tudo` | As duas |
| `npm run dev` | Sobe o site em desenvolvimento |
| `npm run build` | Compila. Tem de passar antes de qualquer deploy |
| `npm run lint` | ESLint |

### 2.6 VS Code

Extensões que ajudam neste projeto: ESLint, Tailwind CSS IntelliSense, e a oficial
do Postgres se quiser inspecionar o banco pela interface.

Para continuar com o Claude dentro do VS Code, instale a extensão do Claude Code.
Uma sessão nova lê a especificação, o plano e este arquivo, e tem contexto para
seguir — foi por isso que este documento existe.

---

## 3. Estado do trabalho

**Seis tarefas de vinte. 179 testes passando. A branch está verde.**

| Tarefa | Estado |
|---|---|
| T1 Base do projeto e tipos do domínio | completa, revisada |
| T2 Regra de orçamento | completa, revisada |
| T3 Conflito de horário e horários livres | completa, revisada |
| T3.5 Catálogo real da Allana | completa, revisada |
| T4 Faixas de autonomia do agente | completa, revisada |
| T5 Fechamento financeiro | completa, revisada |
| **T6 Banco e camada de dados** | **pela metade** — ver seção 4 |
| T7 a T19 | não começadas |

O que falta: dados de exemplo, login, a rota que recebe o pedido, notificação,
site público, fluxo de agendamento, painel, os dois agentes, pausar o agente, o
formulário de configuração, e o fechamento com deploy privado.

---

## 4. A Tarefa 6, que está pela metade

Commit `f5548e4`, marcado `wip:` de propósito.

**Pronto e testado:** `lib/dominio/telefone.ts`, normalização para E.164 com DDD 48
padrão, 13 testes passando. `(48) 99999-1234`, `48999991234` e `+5548999991234`
passam a ser o mesmo cliente.

**Escrito mas nunca verificado:** `supabase/migrations/0001_schema.sql` (aplica
limpo), e `lib/dados/` com `db.ts`, `cliente.ts`, `servicos.ts`, `regras.ts`,
`agenda.ts`, `financeiro.ts`. O arquivo `lib/dados/dados.test.ts` nunca rodou com
sucesso.

**O defeito conhecido, com a correção já diagnosticada:**

`npm run test:db` falha no arranque. O `globalSetup` em
`lib/dados/testes/preparar-banco.ts` lê `process.env.DATABASE_URL_TESTE`, mas o
`test.env` do vitest só chega aos *workers*, não ao globalSetup. Corrija de uma
destas duas formas: importe `URL_TESTE` de `vitest.db.config.ts`, ou repita o
mesmo fallback dentro do globalSetup.

**Intocado:** rodar e corrigir `dados.test.ts`, a suíte completa, a autorrevisão do
diff, e o relatório final da tarefa.

---

## 5. Decisões tomadas, para não serem redescobertas

Estas custaram discussão e revisão. Mudá-las é legítimo; mudá-las sem saber que
existiram, não.

### Regras de negócio

- **O agente nunca inventa exceção.** Dentro das regras da Allana ele age; fora
  delas não negocia, não improvisa, não dá um jeitinho — passa para ela. Toda a
  Tarefa 4 existe para implementar isso.
- **Serviço sem tabela de preço nunca devolve número.** A garantia é estrutural, não
  só testada: todo caminho que não sabe precificar devolve a mesma constante
  congelada, sem dígito algum, e a união de tipos impede o consumidor de ler um
  valor sem antes checar que ele existe.
- **"Faltou informação" não é escalada.** O agente pergunta e refaz o orçamento. Se
  isso virasse escalada, a Allana receberia notificação por cliente que não deu um
  detalhe, concluiria que o agente não resolve nada, e voltaria ao WhatsApp.
- **Visita técnica: o serviço é vermelho, a visita é verde.** Pós-obra e afins não
  têm preço antes de ela ver o lugar, então o trabalho vai para ela. Mas a visita em
  si é uma hora dentro do expediente, e o agente a marca sozinho.
- **Duração vem do catálogo, nunca do pedido do cliente.** Sem isso, um cliente
  informaria "duração: 2 horas" num serviço de diária e encaixaria oito horas de
  trabalho num vão de duas.
- **Mais de uma diária escala.** `orcar` precifica duas diárias, mas agendar
  dezesseis horas seguidas é impossível; ela decide como partir os dias.
- **O agente nunca cobra acima da tabela dela em silêncio.** Quando um orçamento por
  hora atinge a diária mais barata para o mesmo tempo, ele avisa. Não é desconto, é
  honestidade sobre a tabela dela.
- **A coleira nasce curta.** `podeFecharComClienteNovo` começa `false` e
  `bairrosAtendidos` começa vazio. O sistema nasce apertado e ela afrouxa quando
  confiar — nunca o contrário.
- **Teto de carga em horas, não só em número de serviços.** Duas diárias de oito
  horas num dia são dezesseis horas de trabalho, impossíveis.

### Técnicas

- **Fuso horário:** proibido assumir `-03:00` fixo para São Paulo, e proibido usar
  `getHours`/`setHours` para significar hora local. O Brasil não tem horário de
  verão hoje, o que torna o atalho correto **agora** e perigoso depois. Quatro testes
  em Nova York, Lord Howe e Chatham ficam vermelhos se alguém trocar pelo atalho.
  Isso foi medido: antes desses testes, os 21 testes de agenda passavam **todos**
  contra a implementação proibida.
- **Dinheiro em centavos inteiros**, sempre. Nunca ponto flutuante. Formatação em
  reais só na borda de apresentação.
- **Instante e data de calendário são tipos diferentes.** Pagamento acontece num
  momento (`timestamptz`); despesa acontece num dia (`date`, string
  `'YYYY-MM-DD'`). Nunca compare um com o outro: uma despesa de 31 de dezembro às
  22h cairia em janeiro.
- **O driver do Postgres desliza datas.** O `pg` converte colunas `date` em objetos
  `Date` no fuso do processo. Está resolvido em dois níveis — o pool sobrescreve o
  parser do OID 1082 e as queries usam `to_char` — e testado em cinco fusos.
- **Sobreposição de disponibilidade é impossível no banco**, por restrição de
  exclusão `gist`, não por checagem na aplicação. Janelas adjacentes (08–12 e 12–18)
  continuam permitidas.
- **Trava de agendamento duplo:** índice único parcial em `agendamentos (inicio)`
  para status ativos. Impede mesmo instante de início; sobreposição parcial segue
  sendo trabalho da regra testada, dentro da transação.
- **`is_demo` em toda tabela.** É o que permite apagar os dados de exemplo sem tocar
  nos reais quando ela assumir.
- **Banco de desenvolvimento é Postgres puro, não Supabase.** A conta tinha atingido
  o limite de dois projetos gratuitos, e escolher qual projeto seu apagar é decisão
  sua. As migrações ficam em `supabase/migrations/` por continuidade, para quando
  você escolher onde hospedar. Toda query é portável.
- **Login será sessão própria de usuário único**, não Supabase Auth — consequência
  da decisão acima, e mais simples para um painel de uma pessoa.

### Processo

- Toda tarefa passa por um revisor novo, que não sabe o que o autor pretendia.
  Achado importante abre rodada de correção, seguida de re-revisão com escopo
  fechado. Achado menor vai para a revisão final.
- O implementador comita; só depois o trabalho é enviado. Não se comita trabalho de
  subagente pela metade, para a branch não ficar vermelha.

---

## 6. Pendências menores, para a revisão final

- O teste de exatidão de cem pagamentos **não prova nada** sobre ponto flutuante:
  18333 é inteiro e cem somas de inteiros são exatas em IEEE double. A segurança vem
  do tipo e da ausência de matemática fracionária. Renomear o teste.
- O teste de 31 de dezembro não pega erro de fuso; quem pega são os de 1º de janeiro
  e 1º de dezembro. Corrigir o nome e apontar para eles.
- O teste de invariante "amarela sem alternativa não usa mensagem de lista" é guiado
  por cenários, não por propriedade: pega o bug original, mas é vacuoso em vários
  cenários sem contador que prove que o ramo executou, e a checagem de dois-pontos é
  heurística.
- Documentar em `fechar()` que o status de pagamento é estado de hoje, então
  "a receber" de mês passado é "em aberto hoje, vencido até aquele mês".
- Comentar que `comPagamento` conta pagamento de qualquer status de propósito. Se um
  status cancelado ou estornado for acrescentado, o agendamento desaparece de
  "a receber".
- `nao_entendi` hoje mistura erro de programação do chamador com confusão de
  conversa. O painel dela não pode mostrar bug vestido de caso de cliente.
- A janela de alternativas foi ancorada perto do dia pedido; conferir no uso real se
  sete dias para trás é a distância certa.

---

## 7. Requisito crítico para a demonstração

Quando a Tarefa 7 gerar os dados de exemplo, ela **tem** de preencher
`bairrosAtendidos` com bairros reais de Florianópolis e `podeFecharComClienteNovo`
como `true`.

Motivo: o sistema nasce com a coleira curta, o que está certo. Mas sem esses dois
campos preenchidos o agente escala **100% dos pedidos**, e o caminho verde fica
inalcançável. Você abriria o painel para a Allana e veria só escaladas — o agente
pareceria inútil exatamente no momento que importa.

---

## 8. Perguntas abertas para a Allana

Nenhuma bloqueia o trabalho, e a seção 7 do formulário de configuração pergunta
todas a ela de todo jeito. Mas se você puder puxar o assunto, elas melhoram o
sistema antes:

1. **O pacote de horas é intencionalmente mais caro por hora?** Oito horas de pacote
   dão R$ 560,00. A diária de manutenção, pelo mesmo tempo, é R$ 500,00. O ponto de
   equilíbrio é em 7 horas e 8 minutos. Pode ser proposital — ambiente pequeno tem
   mais deslocamento e preparo por trabalho — ou pode ser que ela nunca tenha
   cruzado as duas tabelas.
2. **Revitalização de piso:** visita técnica, orçamento por avaliação, ou tem preço
   de diária? Está como visita técnica provisoriamente, por decisão sua.
3. **Quantas diárias por semana ela aguenta?** Oito horas de limpeza pesada é
   trabalho físico sério, e é o agente que vai encher essa agenda. O teto está
   conservador até ela dizer.

---

## 9. As regras da surpresa, enquanto ela não sabe

- Deploy em endereço privado, protegido por senha.
- `noindex, nofollow` em todas as páginas.
- Nenhum meio de cobrança real conectado.
- Nenhum telefone ou e-mail real de cliente dela no repositório ou no banco. Os
  dados de exemplo são inventados e marcados com `is_demo`.
- Nada publicado em rede social, Google ou diretório.
