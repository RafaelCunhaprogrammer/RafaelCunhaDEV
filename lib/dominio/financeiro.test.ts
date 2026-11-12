import { describe, expect, test } from 'vitest'
import type { Agendamento, Despesa, Intervalo, Pagamento } from './tipos'
import { fechar } from './financeiro'

// Instantes em UTC explícito: o São Paulo de 2026 é UTC-3 o ano todo.
const utc = (texto: string) => new Date(`${texto}:00.000Z`)

// Dezembro de 2026 em São Paulo: [01/12 00:00 -03, 01/01 00:00 -03)
const dezembro: Intervalo = { inicio: utc('2026-12-01T03:00'), fim: utc('2027-01-01T03:00') }

const pagamento = (p: Partial<Pagamento> = {}): Pagamento => ({
  id: 'p',
  agendamentoId: 'a-x',
  clienteId: 'c1',
  valorCentavos: 18000,
  metodo: 'pix',
  dataPrevista: utc('2026-12-10T15:00'),
  status: 'pago',
  pagoEm: utc('2026-12-10T15:00'),
  ...p,
})

const pendente = (p: Partial<Pagamento> = {}): Pagamento =>
  pagamento({ status: 'pendente', pagoEm: null, ...p })

const despesa = (d: Partial<Despesa> = {}): Despesa => ({
  id: 'd',
  descricao: 'Produtos',
  categoria: 'produtos',
  recorrente: false,
  valorCentavos: 5000,
  data: '2026-12-10',
  ...d,
})

const agendamento = (a: Partial<Agendamento> = {}): Agendamento => ({
  id: 'a1',
  servicoId: 's1',
  clienteId: 'c1',
  clienteNovo: false,
  bairro: 'Jurerê',
  endereco: 'Rua A, 1',
  inicio: utc('2026-12-08T12:00'),
  fim: utc('2026-12-08T20:00'),
  status: 'concluido',
  faixa: 'verde',
  valorCentavos: 18000,
  observacoes: '',
  criadoEm: utc('2026-12-01T12:00'),
  ...a,
})

const vazio = { periodo: dezembro, pagamentos: [], despesas: [], agendamentos: [] }

describe('fechar', () => {
  test('entrou soma só os pagamentos pagos dentro do período', () => {
    const f = fechar({
      ...vazio,
      pagamentos: [
        pagamento({ id: '1', valorCentavos: 18000 }),
        pagamento({ id: '2', valorCentavos: 9000 }),
        pendente({ id: '3', valorCentavos: 7000 }),
      ],
    })
    expect(f.entrou).toBe(27000)
  })

  test('a receber soma pendentes e concluídos sem pagamento, sem contar duas vezes', () => {
    const f = fechar({
      ...vazio,
      agendamentos: [agendamento({ id: 'a1', valorCentavos: 18000 })],
      pagamentos: [pendente({ id: 'p1', agendamentoId: 'a1', valorCentavos: 18000 })],
    })
    expect(f.aReceber).toBe(18000)
  })

  test('concluído sem nenhuma linha de pagamento entra em a receber', () => {
    const f = fechar({
      ...vazio,
      agendamentos: [agendamento({ id: 'a1', valorCentavos: 18000 })],
    })
    expect(f.aReceber).toBe(18000)
  })

  test('concluído que já tem pagamento pago não volta a aparecer em a receber', () => {
    const f = fechar({
      ...vazio,
      agendamentos: [agendamento({ id: 'a1', valorCentavos: 18000 })],
      pagamentos: [pagamento({ agendamentoId: 'a1', valorCentavos: 18000 })],
    })
    expect(f.entrou).toBe(18000)
    expect(f.aReceber).toBe(0)
  })

  test('saldo é entrou menos saiu', () => {
    const f = fechar({
      ...vazio,
      pagamentos: [pagamento({ valorCentavos: 30000 })],
      despesas: [despesa({ valorCentavos: 4500 })],
    })
    expect(f.saiu).toBe(4500)
    expect(f.saldo).toBe(25500)
  })

  test('saldo negativo é permitido', () => {
    const f = fechar({
      ...vazio,
      pagamentos: [pagamento({ valorCentavos: 10000 })],
      despesas: [despesa({ valorCentavos: 25000 })],
    })
    expect(f.saldo).toBe(-15000)
  })

  test('período sem movimento devolve tudo zero', () => {
    expect(fechar(vazio)).toEqual({ entrou: 0, saiu: 0, saldo: 0, aReceber: 0 })
  })

  test('pagamento pago fora do período não entra', () => {
    const f = fechar({
      ...vazio,
      pagamentos: [pagamento({ pagoEm: utc('2026-11-20T15:00'), dataPrevista: utc('2026-11-20T15:00') })],
    })
    expect(f.entrou).toBe(0)
  })

  // Review Focus 5 — soma exata
  test('a soma de muitos valores fecha exatamente', () => {
    const pagamentos = Array.from({ length: 100 }, (_, i) =>
      pagamento({ id: `p${i}`, valorCentavos: 18333 }),
    )
    const f = fechar({ ...vazio, pagamentos })
    expect(f.entrou).toBe(1833300)
    expect(Number.isInteger(f.entrou)).toBe(true)
  })

  test('caixa conta quando chega: pago fora do período com vencimento dentro não entra', () => {
    const f = fechar({
      ...vazio,
      pagamentos: [
        pagamento({
          dataPrevista: utc('2026-12-20T15:00'),
          pagoEm: utc('2027-01-05T15:00'),
        }),
      ],
    })
    expect(f.entrou).toBe(0)
  })

  test('caixa conta quando chega: pago dentro do período com vencimento antes entra', () => {
    const f = fechar({
      ...vazio,
      pagamentos: [
        pagamento({ dataPrevista: utc('2026-11-20T15:00'), pagoEm: utc('2026-12-03T15:00') }),
      ],
    })
    expect(f.entrou).toBe(18000)
  })

  describe('pendente com vencimento fora do período', () => {
    test('atrasado (vencimento antes do período) continua a receber', () => {
      const f = fechar({
        ...vazio,
        pagamentos: [pendente({ dataPrevista: utc('2026-10-15T15:00') })],
      })
      expect(f.aReceber).toBe(18000)
    })

    test('vencimento depois do fim do período não entra', () => {
      const f = fechar({
        ...vazio,
        pagamentos: [pendente({ dataPrevista: utc('2027-01-10T15:00') })],
      })
      expect(f.aReceber).toBe(0)
    })

    test('concluído sem pagamento de mês anterior também continua a receber', () => {
      const f = fechar({
        ...vazio,
        agendamentos: [
          agendamento({ inicio: utc('2026-10-08T12:00'), fim: utc('2026-10-08T20:00') }),
        ],
      })
      expect(f.aReceber).toBe(18000)
    })

    test('concluído sem pagamento depois do fim do período não entra', () => {
      const f = fechar({
        ...vazio,
        agendamentos: [
          agendamento({ inicio: utc('2027-01-08T12:00'), fim: utc('2027-01-08T20:00') }),
        ],
      })
      expect(f.aReceber).toBe(0)
    })
  })

  describe('despesas são datas de calendário em São Paulo', () => {
    test('despesa de 2026-12-31 cai em dezembro, não em janeiro', () => {
      const dez = fechar({ ...vazio, despesas: [despesa({ data: '2026-12-31' })] })
      expect(dez.saiu).toBe(5000)

      const janeiro: Intervalo = { inicio: utc('2027-01-01T03:00'), fim: utc('2027-02-01T03:00') }
      const jan = fechar({ ...vazio, periodo: janeiro, despesas: [despesa({ data: '2026-12-31' })] })
      expect(jan.saiu).toBe(0)
    })

    test('despesa de 2027-01-01 não cai em dezembro', () => {
      expect(fechar({ ...vazio, despesas: [despesa({ data: '2027-01-01' })] }).saiu).toBe(0)
    })

    test('despesa de 2026-12-01 cai em dezembro', () => {
      expect(fechar({ ...vazio, despesas: [despesa({ data: '2026-12-01' })] }).saiu).toBe(5000)
    })

    test('despesa de 2026-11-30 não cai em dezembro', () => {
      expect(fechar({ ...vazio, despesas: [despesa({ data: '2026-11-30' })] }).saiu).toBe(0)
    })

    test('período cujo fim é o último milissegundo de dezembro também inclui o dia 31', () => {
      const fimExato: Intervalo = { inicio: dezembro.inicio, fim: new Date(dezembro.fim.getTime() - 1) }
      expect(fechar({ ...vazio, periodo: fimExato, despesas: [despesa({ data: '2026-12-31' })] }).saiu).toBe(5000)
    })
  })

  describe('agendamentos que não são trabalho feito', () => {
    test.each(['cancelado', 'recusado', 'aguardando_ela', 'confirmado'] as const)(
      '%s não contribui com nada, mesmo com valor',
      (status) => {
        const f = fechar({
          ...vazio,
          agendamentos: [agendamento({ status, valorCentavos: 18000 })],
        })
        expect(f).toEqual({ entrou: 0, saiu: 0, saldo: 0, aReceber: 0 })
      },
    )
  })

  describe('limites do período: fechado no início, aberto no fim', () => {
    test('pagamento no primeiro instante do período entra', () => {
      const f = fechar({ ...vazio, pagamentos: [pagamento({ pagoEm: dezembro.inicio })] })
      expect(f.entrou).toBe(18000)
    })

    test('pagamento um milissegundo antes do período não entra', () => {
      const f = fechar({
        ...vazio,
        pagamentos: [pagamento({ pagoEm: new Date(dezembro.inicio.getTime() - 1) })],
      })
      expect(f.entrou).toBe(0)
    })

    test('pagamento no último milissegundo do período entra', () => {
      const f = fechar({
        ...vazio,
        pagamentos: [pagamento({ pagoEm: new Date(dezembro.fim.getTime() - 1) })],
      })
      expect(f.entrou).toBe(18000)
    })

    test('pagamento exatamente em fim pertence ao período seguinte, não aos dois', () => {
      const janeiro: Intervalo = { inicio: dezembro.fim, fim: utc('2027-02-01T03:00') }
      const p = pagamento({ pagoEm: dezembro.fim })
      expect(fechar({ ...vazio, pagamentos: [p] }).entrou).toBe(0)
      expect(fechar({ ...vazio, periodo: janeiro, pagamentos: [p] }).entrou).toBe(18000)
    })
  })
})
