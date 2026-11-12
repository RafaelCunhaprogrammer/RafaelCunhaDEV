import { dataLocalISO } from './tempo'
import type { Agendamento, Centavos, Despesa, Intervalo, Pagamento } from './tipos'

/**
 * Fechamento financeiro de um período (regra 5.4).
 *
 * Cada centavo precisa ser contado uma vez só. Os erros possíveis são dois:
 * contar a mesma venda como "a receber" duas vezes, e deslocar um dia de
 * calendário por comparar data com instante em UTC.
 *
 * Período: fechado no início, aberto no fim, [inicio, fim). Quem fecha meses em
 * sequência passa fim = início do mês seguinte, e um pagamento exatamente nesse
 * instante pertence a um mês só.
 *
 * Instantes e datas de calendário nunca são comparados entre si:
 * - `Pagamento.pagoEm` e `dataPrevista` são instantes e comparam com o período
 *   como instantes;
 * - `Despesa.data` é uma data de calendário em São Paulo e compara como texto
 *   'YYYY-MM-DD' com as datas locais do primeiro e do último dia do período
 *   (obtidas por `dataLocalISO`, no FUSO).
 *
 * Módulo puro: sem relógio, sem I/O. Soma inteira de centavos.
 */

export type Fechamento = {
  entrou: Centavos
  saiu: Centavos
  saldo: Centavos
  aReceber: Centavos
}

const somar = (valores: Centavos[]): Centavos => valores.reduce((total, v) => total + v, 0)

export function fechar(params: {
  periodo: Intervalo
  pagamentos: Pagamento[]
  despesas: Despesa[]
  agendamentos: Agendamento[]
}): Fechamento {
  const { periodo, pagamentos, despesas, agendamentos } = params

  const noPeriodo = (instante: Date) => instante >= periodo.inicio && instante < periodo.fim
  // Ainda não passou do fim do período: vencido antes dele continua devido.
  const ateOFim = (instante: Date) => instante < periodo.fim

  // Despesa é um dia, não um instante: compara datas locais, ambas inclusivas.
  const primeiroDia = dataLocalISO(periodo.inicio)
  const ultimoDia = dataLocalISO(new Date(periodo.fim.getTime() - 1))
  const diaNoPeriodo = (data: string) => data >= primeiroDia && data <= ultimoDia

  // Entrou: dinheiro conta quando chega (pagoEm), não quando era esperado.
  const entrou = somar(
    pagamentos.filter((p) => p.status === 'pago' && p.pagoEm !== null && noPeriodo(p.pagoEm))
      .map((p) => p.valorCentavos),
  )

  const saiu = somar(despesas.filter((d) => diaNoPeriodo(d.data)).map((d) => d.valorCentavos))

  // A receber = o que está pendente + o que foi feito e nem virou cobrança.
  // Um concluído que já tem QUALQUER linha de pagamento (pendente ou pago) é
  // contado pela linha, nunca de novo pelo agendamento.
  const comPagamento = new Set(pagamentos.map((p) => p.agendamentoId))

  const pendentes = pagamentos.filter((p) => p.status === 'pendente' && ateOFim(p.dataPrevista))
  const concluidosSemPagamento = agendamentos.filter(
    (a) => a.status === 'concluido' && !comPagamento.has(a.id) && ateOFim(a.inicio),
  )

  const aReceber = somar([
    ...pendentes.map((p) => p.valorCentavos),
    ...concluidosSemPagamento.map((a) => a.valorCentavos),
  ])

  return { entrou, saiu, saldo: entrou - saiu, aReceber }
}
