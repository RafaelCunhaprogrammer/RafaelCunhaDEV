import { dataLocalISO } from '../dominio/tempo'
import type { Despesa, Intervalo, Pagamento } from '../dominio/tipos'
import { consultar } from './db'

type LinhaPagamento = {
  id: string
  agendamento_id: string
  cliente_id: string
  valor_centavos: number
  metodo: string | null
  data_prevista: Date
  status: Pagamento['status']
  pago_em: Date | null
}

const COLUNAS_PAGAMENTO = `p.id, p.agendamento_id, p.cliente_id, p.valor_centavos,
  p.metodo, p.data_prevista, p.status, p.pago_em`

const paraPagamento = (l: LinhaPagamento): Pagamento => ({
  id: l.id,
  agendamentoId: l.agendamento_id,
  clienteId: l.cliente_id,
  valorCentavos: l.valor_centavos,
  metodo: l.metodo,
  dataPrevista: l.data_prevista,
  status: l.status,
  pagoEm: l.pago_em,
})

export async function criarPagamento(novo: Omit<Pagamento, 'id'>): Promise<Pagamento> {
  const linhas = await consultar<LinhaPagamento>(
    `insert into pagamentos as p (agendamento_id, cliente_id, valor_centavos, metodo,
       data_prevista, status, pago_em)
     values ($1, $2, $3, $4, $5, $6, $7) returning ${COLUNAS_PAGAMENTO}`,
    [
      novo.agendamentoId,
      novo.clienteId,
      novo.valorCentavos,
      novo.metodo,
      novo.dataPrevista,
      novo.status,
      novo.pagoEm,
    ],
  )
  return paraPagamento(linhas[0])
}

/**
 * Tudo o que `fechar` pode precisar para o período: pagamentos pagos dentro dele e
 * pagamentos que vencem antes do fim, e também qualquer pagamento de um agendamento
 * que começou antes do fim (senão um concluído cuja cobrança vence depois seria
 * contado como "sem pagamento"). É um conjunto de leitura: quem filtra o que entra
 * em cada total é `fechar`, não esta função.
 */
export async function pagamentosDoPeriodo(periodo: Intervalo): Promise<Pagamento[]> {
  const linhas = await consultar<LinhaPagamento>(
    `select ${COLUNAS_PAGAMENTO}
     from pagamentos p join agendamentos a on a.id = p.agendamento_id
     where p.data_prevista < $2
        or (p.pago_em >= $1 and p.pago_em < $2)
        or a.inicio < $2
     order by p.data_prevista`,
    [periodo.inicio, periodo.fim],
  )
  return linhas.map(paraPagamento)
}

type LinhaDespesa = {
  id: string
  descricao: string
  categoria: string
  recorrente: boolean
  valor_centavos: number
  data: string
}

// `data` vem do driver como texto 'YYYY-MM-DD' (ver db.ts); to_char torna isso
// explícito aqui também, para a leitura não depender da configuração do driver.
const COLUNAS_DESPESA = `id, descricao, categoria, recorrente, valor_centavos,
  to_char(data, 'YYYY-MM-DD') as data`

const paraDespesa = (l: LinhaDespesa): Despesa => ({
  id: l.id,
  descricao: l.descricao,
  categoria: l.categoria,
  recorrente: l.recorrente,
  valorCentavos: l.valor_centavos,
  data: l.data,
})

export async function criarDespesa(nova: Omit<Despesa, 'id'>): Promise<Despesa> {
  const linhas = await consultar<LinhaDespesa>(
    `insert into despesas (descricao, categoria, recorrente, valor_centavos, data)
     values ($1, $2, $3, $4, $5::date) returning ${COLUNAS_DESPESA}`,
    [nova.descricao, nova.categoria, nova.recorrente, nova.valorCentavos, nova.data],
  )
  return paraDespesa(linhas[0])
}

/**
 * Despesas dos dias de calendário (em São Paulo) que o período toca, ambos os
 * extremos inclusivos: do dia de `inicio` ao dia do último instante antes de `fim`.
 * É a mesma janela de dias que `fechar` usa; datas comparam com datas, nunca com
 * instantes.
 */
export async function despesasDoPeriodo(periodo: Intervalo): Promise<Despesa[]> {
  const primeiroDia = dataLocalISO(periodo.inicio)
  const ultimoDia = dataLocalISO(new Date(periodo.fim.getTime() - 1))
  const linhas = await consultar<LinhaDespesa>(
    `select ${COLUNAS_DESPESA} from despesas
     where data >= $1::date and data <= $2::date order by data, id`,
    [primeiroDia, ultimoDia],
  )
  return linhas.map(paraDespesa)
}
