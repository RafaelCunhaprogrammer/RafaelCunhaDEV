-- Allana Rosa: esquema inicial (Postgres puro, sem nada específico de provedor).
-- O diretório mantém o nome "supabase/migrations" só para que uma mudança futura
-- para um provedor hospedado encontre as migrações onde espera.
--
-- Convenções:
--   * dinheiro: integer em centavos, nunca numeric/float;
--   * instante: timestamptz; dia de calendário: date (nunca comparados entre si);
--   * toda tabela carrega is_demo, para apagar os dados de exemplo sem tocar nos reais.

create extension if not exists btree_gist;

-- Ela. Uma linha só (id fixo em true).
create table perfil (
  id boolean primary key default true check (id),
  nome text not null,
  apresentacao text not null default '',
  historia text not null default '',
  telefone text,
  cidade text not null default 'Florianópolis',
  bairros_atendidos text[] not null default '{}',
  redes jsonb not null default '{}'::jsonb,
  is_demo boolean not null default false
);

create table servicos (
  id text primary key,
  nome text not null,
  descricao text not null default '',
  forma_cobranca text not null
    check (forma_cobranca in ('diaria', 'hora', 'avaliacao', 'visita_tecnica')),
  duracao_estimada_min integer check (duracao_estimada_min > 0),
  -- Duração da visita técnica: compromisso de agenda à parte do trabalho em si.
  duracao_visita_min integer check (duracao_visita_min > 0),
  preco_centavos integer check (preco_centavos >= 0),
  minimo_horas integer check (minimo_horas > 0),
  pode_exigir_equipe boolean not null default false,
  -- Lista ordenada, sem identidade própria, que só existe dentro do serviço.
  perguntas_avaliacao text[] not null default '{}',
  ativo boolean not null default true,
  ordem integer not null default 0,
  is_demo boolean not null default false
);

create table clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- Sempre na forma normalizada (E.164); quem grava normaliza antes.
  telefone text not null unique check (telefone ~ '^\+[1-9][0-9]{7,14}$'),
  email text,
  endereco text not null default '',
  bairro text not null default '',
  tipo_imovel text not null default '',
  metros_quadrados integer check (metros_quadrados > 0),
  observacoes text not null default '',
  origem text not null check (origem in ('indicacao', 'site', 'instagram')),
  frequencia text,
  criado_em timestamptz not null default now(),
  is_demo boolean not null default false
);

create table agendamentos (
  id uuid primary key default gen_random_uuid(),
  servico_id text not null references servicos (id),
  cliente_id uuid not null references clientes (id),
  cliente_novo boolean not null default false,
  bairro text not null default '',
  endereco text not null default '',
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null
    check (status in ('aguardando_ela', 'confirmado', 'concluido', 'cancelado', 'recusado')),
  faixa text not null check (faixa in ('verde', 'amarela', 'vermelha')),
  valor_centavos integer not null check (valor_centavos >= 0),
  observacoes text not null default '',
  criado_em timestamptz not null default now(),
  is_demo boolean not null default false,
  check (fim > inicio)
);

-- Regra 5.7: dois pedidos disputando o mesmo horário não podem ambos valer.
-- Barra só INÍCIOS idênticos; a sobreposição parcial continua a cargo de
-- `conflita` dentro da transação (exigiria range types aqui, e a regra de
-- domínio já está testada).
create unique index agendamento_horario_unico
  on agendamentos (inicio)
  where status in ('aguardando_ela', 'confirmado');

create index agendamentos_inicio_idx on agendamentos (inicio);

create table pagamentos (
  id uuid primary key default gen_random_uuid(),
  agendamento_id uuid not null references agendamentos (id),
  cliente_id uuid not null references clientes (id),
  valor_centavos integer not null check (valor_centavos >= 0),
  metodo text,
  data_prevista timestamptz not null,
  status text not null check (status in ('pendente', 'pago')),
  pago_em timestamptz,
  is_demo boolean not null default false,
  check ((status = 'pago') = (pago_em is not null))
);

create table despesas (
  id uuid primary key default gen_random_uuid(),
  descricao text not null,
  categoria text not null default '',
  recorrente boolean not null default false,
  valor_centavos integer not null check (valor_centavos >= 0),
  data date not null,
  is_demo boolean not null default false
);

-- Janelas semanais. 0 = domingo ... 6 = sábado. Horas na parede de São Paulo.
create table disponibilidade (
  id uuid primary key default gen_random_uuid(),
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  is_demo boolean not null default false,
  check (hora_fim > hora_inicio),
  -- Duas janelas do mesmo dia não podem se sobrepor (encostar é permitido:
  -- 08-12 e 12-18). Sem isso a agenda ofereceria o mesmo horário duas vezes.
  constraint disponibilidade_sem_sobreposicao exclude using gist (
    dia_semana with =,
    tsrange(timestamp '2000-01-01' + hora_inicio, timestamp '2000-01-01' + hora_fim) with &&
  )
);

create table bloqueios (
  id uuid primary key default gen_random_uuid(),
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text not null default '',
  is_demo boolean not null default false,
  check (fim > inicio)
);

create table depoimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  texto text not null,
  servico_id text references servicos (id),
  publicado boolean not null default false,
  is_demo boolean not null default false
);

create table galeria (
  id uuid primary key default gen_random_uuid(),
  imagem text not null,
  legenda text not null default '',
  servico_id text references servicos (id),
  ordem integer not null default 0,
  is_demo boolean not null default false
);

create table conversas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes (id),
  canal text not null default 'site',
  criada_em timestamptz not null default now(),
  is_demo boolean not null default false
);

create table mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references conversas (id) on delete cascade,
  papel text not null check (papel in ('cliente', 'agente', 'ela', 'sistema')),
  conteudo text not null,
  ferramentas jsonb not null default '[]'::jsonb,
  criada_em timestamptz not null default now(),
  is_demo boolean not null default false
);

create table respostas_configuracao (
  id uuid primary key default gen_random_uuid(),
  secao text not null,
  pergunta text not null,
  resposta text,
  respondido_em timestamptz,
  is_demo boolean not null default false,
  unique (secao, pergunta)
);

-- Regras dela. Uma linha só (id fixo em true). Os padrões espelham REGRAS_PADRAO.
create table regras (
  id boolean primary key default true check (id),
  deslocamento_min integer not null default 30,
  antecedencia_min_horas integer not null default 24,
  max_servicos_dia integer not null default 2,
  max_horas_dia integer not null default 8,
  max_servicos_semana integer not null default 6,
  max_horas_semana integer not null default 30,
  m2_maximo_dia_manutencao integer not null default 150,
  m2_maximo_dia_acumulada integer not null default 80,
  bairros_atendidos text[] not null default '{}',
  pode_fechar_com_cliente_novo boolean not null default false,
  prazo_resposta_horas integer not null default 2,
  hora_fim_silencio integer not null default 9,
  agente_pausado boolean not null default false,
  is_demo boolean not null default false
);
