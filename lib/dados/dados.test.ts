import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { CATALOGO } from '../dominio/catalogo'
import { fechar } from '../dominio/financeiro'
import { REGRAS_PADRAO, type Agendamento, type Cliente, type Regras } from '../dominio/tipos'
import {
  HorarioOcupado,
  JanelaSobreposta,
  bloqueiosNoIntervalo,
  concluidosAte,
  confirmados,
  criarAgendamento,
  criarBloqueio,
  criarDisponibilidade,
  listarDisponibilidade,
  mudarStatus,
  ocupados,
} from './agenda'
import { buscarClientePorTelefone, criarCliente } from './cliente'
import { consultar, encerrarConexao } from './db'
import {
  criarDespesa,
  criarPagamento,
  despesasDoPeriodo,
  pagamentosDoPeriodo,
} from './financeiro'
import { carregarRegras, salvarRegras } from './regras'
import { listarServicos, salvarServico } from './servicos'

/**
 * Estes testes falam com um Postgres de verdade (banco `*_teste`, recriado pelo
 * globalSetup). Isolamento: antes de CADA teste todas as tabelas são esvaziadas,
 * então nenhum teste enxerga sobra de outro e a ordem não importa.
 */
beforeAll(async () => {
  const [{ current_database: banco }] = await consultar<{ current_database: string }>(
    'select current_database()',
  )
  if (!banco.endsWith('_teste')) throw new Error(`Banco inesperado para teste: ${banco}`)
})

beforeEach(async () => {
  const tabelas = await consultar<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public'`,
  )
  await consultar(`truncate ${tabelas.map((t) => `"${t.tablename}"`).join(', ')} cascade`)
})

afterAll(async () => {
  await encerrarConexao()
})

const novoCliente = (sobre: Partial<Cliente> = {}): Omit<Cliente, 'id' | 'criadoEm'> => ({
  nome: 'Marina Souza',
  telefone: '(48) 99999-1234',
  email: 'marina@exemplo.com',
  endereco: 'Rua das Flores, 10',
  bairro: 'Trindade',
  tipoImovel: 'apartamento',
  metrosQuadrados: 90,
  observacoes: 'tem gato',
  origem: 'indicacao',
  ...sobre,
})

async function prepararAgendamento(inicio = new Date('2026-12-01T11:00:00Z')) {
  await salvarServico(CATALOGO[0])
  const cliente = await criarCliente(novoCliente())
  const base: Omit<Agendamento, 'id' | 'criadoEm'> = {
    servicoId: CATALOGO[0].id,
    clienteId: cliente.id,
    clienteNovo: false,
    bairro: 'Trindade',
    endereco: 'Rua das Flores, 10',
    inicio,
    fim: new Date(inicio.getTime() + 8 * 3600_000),
    status: 'confirmado',
    faixa: 'verde',
    valorCentavos: 50000,
    observacoes: 'portaria 24h',
  }
  return { cliente, base }
}

describe('clientes', () => {
  test('cria e lê um cliente, com o telefone normalizado', async () => {
    const criado = await criarCliente(novoCliente())
    expect(criado.telefone).toBe('+5548999991234')
    expect(criado.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(criado.criadoEm).toBeInstanceOf(Date)

    const lido = await buscarClientePorTelefone('48 99999-1234')
    expect(lido).toEqual(criado)
    expect(lido).toMatchObject({ nome: 'Marina Souza', metrosQuadrados: 90, origem: 'indicacao' })
  })

  test('campos opcionais nulos voltam nulos', async () => {
    const criado = await criarCliente(novoCliente({ email: null, metrosQuadrados: null }))
    expect(criado.email).toBeNull()
    expect(criado.metrosQuadrados).toBeNull()
  })

  test('telefone inexistente devolve null', async () => {
    expect(await buscarClientePorTelefone('48 98888-0000')).toBeNull()
  })

  test('telefone duplicado em outro formato não cria segundo cliente', async () => {
    await criarCliente(novoCliente())
    await expect(
      criarCliente(novoCliente({ nome: 'Outra', telefone: '+55 48 99999-1234' })),
    ).rejects.toThrow()
    const [{ n }] = await consultar<{ n: string }>('select count(*) as n from clientes')
    expect(n).toBe('1')
  })
})

describe('servicos', () => {
  test('o catálogo real inteiro faz ida e volta sem perder campo nenhum', async () => {
    for (const [i, servico] of CATALOGO.entries()) await salvarServico(servico, i)
    const lidos = await listarServicos()
    expect(lidos).toEqual(CATALOGO)
    // Sanidade: o catálogo exercita os campos que importam (não é tudo nulo/vazio).
    expect(CATALOGO.some((s) => s.perguntasAvaliacao.length > 0)).toBe(true)
    expect(CATALOGO.some((s) => s.duracaoVisitaMin !== null)).toBe(true)
    expect(CATALOGO.some((s) => s.minimoHoras !== null)).toBe(true)
    expect(CATALOGO.some((s) => s.podeExigirEquipe)).toBe(true)
    expect(CATALOGO.some((s) => s.precoCentavos === null)).toBe(true)
  })

  test('duracaoEstimadaMin e duracaoVisitaMin são colunas independentes', async () => {
    await salvarServico({
      ...CATALOGO[0],
      id: 'teste',
      duracaoEstimadaMin: 480,
      duracaoVisitaMin: 60,
    })
    await salvarServico({
      ...CATALOGO[0],
      id: 'teste2',
      duracaoEstimadaMin: null,
      duracaoVisitaMin: 90,
    })
    const lidos = Object.fromEntries((await listarServicos()).map((s) => [s.id, s]))
    expect(lidos.teste).toMatchObject({ duracaoEstimadaMin: 480, duracaoVisitaMin: 60 })
    expect(lidos.teste2).toMatchObject({ duracaoEstimadaMin: null, duracaoVisitaMin: 90 })
  })

  test('perguntas preservam a ordem e salvar de novo atualiza em vez de duplicar', async () => {
    const s = { ...CATALOGO[0], id: 'p', perguntasAvaliacao: ['c?', 'a?', 'b?'] }
    await salvarServico(s)
    await salvarServico({ ...s, perguntasAvaliacao: ['z?', 'a?'], ativo: false })
    const lidos = (await listarServicos()).filter((x) => x.id === 'p')
    expect(lidos).toHaveLength(1)
    expect(lidos[0].perguntasAvaliacao).toEqual(['z?', 'a?'])
    expect(lidos[0].ativo).toBe(false)
  })
})

describe('regras', () => {
  test('sem linha gravada, devolve os padrões do domínio', async () => {
    expect(await carregarRegras()).toEqual(REGRAS_PADRAO)
  })

  test('todos os campos fazem ida e volta, e há uma linha só', async () => {
    const regras: Regras = {
      deslocamentoMin: 45,
      antecedenciaMinHoras: 12,
      maxServicosDia: 3,
      maxHorasDia: 9,
      maxServicosSemana: 7,
      maxHorasSemana: 33,
      m2MaximoDiaManutencao: 160,
      m2MaximoDiaAcumulada: 70,
      bairrosAtendidos: ['Trindade', 'Centro', 'Lagoa da Conceição'],
      podeFecharComClienteNovo: true,
      prazoRespostaHoras: 4,
      horaFimSilencio: 8,
      agentePausado: true,
    }
    // Garante que o teste cobre todos os campos do tipo: nenhum ficou no padrão.
    for (const chave of Object.keys(REGRAS_PADRAO) as (keyof Regras)[]) {
      expect(regras[chave], chave).not.toEqual(REGRAS_PADRAO[chave])
    }
    await salvarRegras(regras)
    expect(await carregarRegras()).toEqual(regras)

    await salvarRegras({ ...regras, agentePausado: false })
    expect((await carregarRegras()).agentePausado).toBe(false)
    const [{ n }] = await consultar<{ n: string }>('select count(*) as n from regras')
    expect(n).toBe('1')
  })
})

describe('disponibilidade', () => {
  test('grava e lê as horas como "HH:mm"', async () => {
    await criarDisponibilidade({ diaSemana: 1, horaInicio: '08:00', horaFim: '12:30' })
    const [janela] = await listarDisponibilidade()
    expect(janela).toMatchObject({ diaSemana: 1, horaInicio: '08:00', horaFim: '12:30' })
  })

  test('janela que cruza outra do mesmo dia é recusada', async () => {
    await criarDisponibilidade({ diaSemana: 2, horaInicio: '08:00', horaFim: '12:00' })
    await expect(
      criarDisponibilidade({ diaSemana: 2, horaInicio: '11:00', horaFim: '15:00' }),
    ).rejects.toThrow(JanelaSobreposta)
    // Contida por inteiro dentro da outra também cruza.
    await expect(
      criarDisponibilidade({ diaSemana: 2, horaInicio: '09:00', horaFim: '10:00' }),
    ).rejects.toThrow(JanelaSobreposta)
    expect(await listarDisponibilidade()).toHaveLength(1)
  })

  test('janelas que apenas encostam, ou de dias diferentes, são aceitas', async () => {
    await criarDisponibilidade({ diaSemana: 3, horaInicio: '08:00', horaFim: '12:00' })
    await criarDisponibilidade({ diaSemana: 3, horaInicio: '12:00', horaFim: '18:00' })
    await criarDisponibilidade({ diaSemana: 4, horaInicio: '08:00', horaFim: '12:00' })
    expect(await listarDisponibilidade()).toHaveLength(3)
  })

  test('janela com fim antes do início é recusada', async () => {
    await expect(
      criarDisponibilidade({ diaSemana: 1, horaInicio: '12:00', horaFim: '08:00' }),
    ).rejects.toThrow()
  })
})

describe('agendamentos', () => {
  test('ida e volta de todos os campos', async () => {
    const { base } = await prepararAgendamento()
    const criado = await criarAgendamento(base)
    expect(criado).toMatchObject(base)
    expect(criado.criadoEm).toBeInstanceOf(Date)
    const [lido] = await confirmados({
      inicio: new Date('2026-12-01T00:00:00Z'),
      fim: new Date('2026-12-02T00:00:00Z'),
    })
    expect(lido).toEqual(criado)
  })

  test('dois agendamentos ativos no mesmo horário: o segundo falha', async () => {
    const { base } = await prepararAgendamento()
    await criarAgendamento(base)
    await expect(criarAgendamento({ ...base })).rejects.toThrow(HorarioOcupado)
    // aguardando_ela também segura o horário
    await expect(criarAgendamento({ ...base, status: 'aguardando_ela' })).rejects.toThrow(
      HorarioOcupado,
    )
  })

  test('duas conversas concorrentes disputando o mesmo horário: exatamente uma vence', async () => {
    const { base, cliente } = await prepararAgendamento()
    const outro = await criarCliente(novoCliente({ nome: 'Outro', telefone: '48 98888-7777' }))
    // Duas chamadas simultâneas, em conexões distintas do pool.
    const resultados = await Promise.allSettled([
      criarAgendamento({ ...base, clienteId: cliente.id }),
      criarAgendamento({ ...base, clienteId: outro.id }),
    ])
    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const rejeitado = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejeitado.reason).toBeInstanceOf(HorarioOcupado)
    const [{ n }] = await consultar<{ n: string }>('select count(*) as n from agendamentos')
    expect(n).toBe('1')
  })

  test('cancelado ou recusado liberam o horário', async () => {
    const { base } = await prepararAgendamento()
    const primeiro = await criarAgendamento(base)
    await mudarStatus(primeiro.id, 'cancelado')
    const segundo = await criarAgendamento(base)
    expect(segundo.status).toBe('confirmado')
    // Um terceiro cancelado convive com o ativo no mesmo horário...
    await criarAgendamento({ ...base, status: 'recusado' })
    // ...mas reativar o cancelado colide com o ativo.
    await expect(mudarStatus(primeiro.id, 'confirmado')).rejects.toThrow(HorarioOcupado)
  })

  test('mudarStatus em id inexistente lança', async () => {
    await expect(mudarStatus('00000000-0000-0000-0000-000000000000', 'cancelado')).rejects.toThrow()
  })

  test('confirmados e ocupados filtram por status e por interseção com o intervalo', async () => {
    const { base } = await prepararAgendamento(new Date('2026-12-01T11:00:00Z'))
    const confirmado = await criarAgendamento(base)
    const aguardando = await criarAgendamento({
      ...base,
      inicio: new Date('2026-12-02T11:00:00Z'),
      fim: new Date('2026-12-02T19:00:00Z'),
      status: 'aguardando_ela',
    })
    await criarAgendamento({
      ...base,
      inicio: new Date('2026-12-03T11:00:00Z'),
      fim: new Date('2026-12-03T19:00:00Z'),
      status: 'cancelado',
    })
    const semana = { inicio: new Date('2026-11-30T00:00:00Z'), fim: new Date('2026-12-07T00:00:00Z') }
    expect((await confirmados(semana)).map((a) => a.id)).toEqual([confirmado.id])
    expect((await ocupados(semana)).map((a) => a.id)).toEqual([confirmado.id, aguardando.id])
    // Termina exatamente quando o intervalo começa: não toca.
    expect(
      await confirmados({ inicio: base.fim, fim: new Date(base.fim.getTime() + 3600_000) }),
    ).toEqual([])
  })

  test('concluidosAte devolve só concluídos que começaram antes do limite', async () => {
    const { base } = await prepararAgendamento()
    const feito = await criarAgendamento({ ...base, status: 'concluido' })
    expect((await concluidosAte(new Date('2026-12-31T00:00:00Z'))).map((a) => a.id)).toEqual([
      feito.id,
    ])
    expect(await concluidosAte(base.inicio)).toEqual([])
  })
})

describe('bloqueios', () => {
  test('grava e lê os que tocam o intervalo', async () => {
    const b = await criarBloqueio({
      inicio: new Date('2026-12-10T12:00:00Z'),
      fim: new Date('2026-12-12T12:00:00Z'),
      motivo: 'viagem',
    })
    const dentro = await bloqueiosNoIntervalo({
      inicio: new Date('2026-12-11T00:00:00Z'),
      fim: new Date('2026-12-11T12:00:00Z'),
    })
    expect(dentro).toEqual([b])
    expect(
      await bloqueiosNoIntervalo({ inicio: b.fim, fim: new Date(b.fim.getTime() + 1000) }),
    ).toEqual([])
  })
})

describe('despesas: a data é um dia de calendário, nunca um instante', () => {
  const fusos = ['America/Sao_Paulo', 'UTC', 'Pacific/Auckland', 'America/Los_Angeles', 'Pacific/Kiritimati']
  const original = process.env.TZ
  afterAll(() => {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  })

  test.each(fusos)('"2026-03-01" volta "2026-03-01" com o processo em %s', async (tz) => {
    process.env.TZ = tz
    for (const dia of ['2026-03-01', '2026-12-31', '2026-01-01', '2026-10-18']) {
      const criada = await criarDespesa({
        descricao: 'Material',
        categoria: 'insumos',
        recorrente: false,
        valorCentavos: 12345,
        data: dia,
      })
      expect(criada.data).toBe(dia)
      const [lida] = await despesasDoPeriodo({
        inicio: new Date(`${dia}T12:00:00-03:00`),
        fim: new Date(`${dia}T13:00:00-03:00`),
      })
      expect(lida.data).toBe(dia)
      expect(typeof lida.data).toBe('string')
    }
  })

  test('a leitura crua do driver (sem o tratamento de db.ts) devolveria Date: por isso o tratamento existe', async () => {
    process.env.TZ = 'America/Los_Angeles'
    const cru = new pg.Client({ connectionString: process.env.DATABASE_URL })
    await cru.connect()
    const { rows } = await cru.query(`select '2026-03-01'::date as d`)
    await cru.end()
    expect(rows[0].d).toBeInstanceOf(Date)
    // Em UTC-8 o dia local desse Date é 1º de março; em UTC+ seria outro: o valor
    // depende do fuso do servidor, que é exatamente o defeito.
    expect(rows[0].d.getTimezoneOffset()).not.toBe(0)
  })

  test('despesasDoPeriodo usa os dias de São Paulo: fim de mês e virada de dia', async () => {
    for (const data of ['2026-02-28', '2026-03-01', '2026-03-31', '2026-04-01']) {
      await criarDespesa({
        descricao: data,
        categoria: 'x',
        recorrente: false,
        valorCentavos: 100,
        data,
      })
    }
    // Março em São Paulo: [01/03 00:00-03:00, 01/04 00:00-03:00)
    const marco = {
      inicio: new Date('2026-03-01T00:00:00-03:00'),
      fim: new Date('2026-04-01T00:00:00-03:00'),
    }
    const lidas = await despesasDoPeriodo(marco)
    expect(lidas.map((d) => d.data)).toEqual(['2026-03-01', '2026-03-31'])
  })

  test('valor em centavos volta como número inteiro', async () => {
    const criada = await criarDespesa({
      descricao: 'Produto',
      categoria: 'insumos',
      recorrente: true,
      valorCentavos: 9999,
      data: '2026-03-05',
    })
    expect(criada.valorCentavos).toBe(9999)
    expect(Number.isInteger(criada.valorCentavos)).toBe(true)
    expect(criada.recorrente).toBe(true)
  })
})

describe('pagamentos e o fechamento do período', () => {
  test('ida e volta e leitura do período alimentam o fechar do domínio', async () => {
    const { base, cliente } = await prepararAgendamento(new Date('2026-03-10T11:00:00Z'))
    const ag = await criarAgendamento({ ...base, status: 'concluido' })
    const pago = await criarPagamento({
      agendamentoId: ag.id,
      clienteId: cliente.id,
      valorCentavos: 50000,
      metodo: 'pix',
      dataPrevista: new Date('2026-03-10T20:00:00Z'),
      status: 'pago',
      pagoEm: new Date('2026-03-11T15:00:00Z'),
    })
    expect(pago.pagoEm).toEqual(new Date('2026-03-11T15:00:00Z'))
    await criarDespesa({
      descricao: 'Luvas',
      categoria: 'insumos',
      recorrente: false,
      valorCentavos: 8000,
      data: '2026-03-12',
    })

    const periodo = {
      inicio: new Date('2026-03-01T00:00:00-03:00'),
      fim: new Date('2026-04-01T00:00:00-03:00'),
    }
    const fechamento = fechar({
      periodo,
      pagamentos: await pagamentosDoPeriodo(periodo),
      despesas: await despesasDoPeriodo(periodo),
      agendamentos: await concluidosAte(periodo.fim),
    })
    expect(fechamento).toEqual({ entrou: 50000, saiu: 8000, saldo: 42000, aReceber: 0 })
  })

  test('cobrança pendente que vence depois do período ainda impede dupla contagem', async () => {
    const { base, cliente } = await prepararAgendamento(new Date('2026-03-10T11:00:00Z'))
    const ag = await criarAgendamento({ ...base, status: 'concluido' })
    await criarPagamento({
      agendamentoId: ag.id,
      clienteId: cliente.id,
      valorCentavos: 50000,
      metodo: null,
      dataPrevista: new Date('2026-05-10T12:00:00Z'), // depois do período
      status: 'pendente',
      pagoEm: null,
    })
    const periodo = {
      inicio: new Date('2026-03-01T00:00:00-03:00'),
      fim: new Date('2026-04-01T00:00:00-03:00'),
    }
    const lidos = await pagamentosDoPeriodo(periodo)
    expect(lidos).toHaveLength(1) // a linha vem, senão o concluído seria contado de novo
    const f = fechar({
      periodo,
      pagamentos: lidos,
      despesas: [],
      agendamentos: await concluidosAte(periodo.fim),
    })
    expect(f.aReceber).toBe(0)
  })

  test('pago sem data de pagamento (ou o contrário) é recusado pelo banco', async () => {
    const { base, cliente } = await prepararAgendamento()
    const ag = await criarAgendamento(base)
    await expect(
      criarPagamento({
        agendamentoId: ag.id,
        clienteId: cliente.id,
        valorCentavos: 100,
        metodo: null,
        dataPrevista: new Date(),
        status: 'pago',
        pagoEm: null,
      }),
    ).rejects.toThrow()
  })
})

describe('is_demo', () => {
  test('toda tabela tem is_demo boolean not null default false', async () => {
    const colunas = await consultar<{ table_name: string; is_nullable: string; column_default: string }>(
      `select table_name, is_nullable, column_default from information_schema.columns
       where table_schema = 'public' and column_name = 'is_demo'`,
    )
    const tabelas = await consultar<{ tablename: string }>(
      `select tablename from pg_tables where schemaname = 'public'`,
    )
    expect(colunas.map((c) => c.table_name).sort()).toEqual(tabelas.map((t) => t.tablename).sort())
    for (const c of colunas) {
      expect(c.is_nullable).toBe('NO')
      expect(c.column_default).toBe('false')
    }
  })
})
