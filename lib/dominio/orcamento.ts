import { reais, type Centavos, type Servico } from './tipos'

export type Medida = { horas?: number; metrosQuadrados?: number; diarias?: number }

export type Orcamento =
  | { tipo: 'fechado'; valor: Centavos; detalhe: string }
  | { tipo: 'sob_orcamento'; mensagem: string }

const SOB_ORCAMENTO: Orcamento = Object.freeze({
  tipo: 'sob_orcamento',
  mensagem: 'A Alana avalia e te retorna com o valor.',
})

/** Medida utilizável: número finito e positivo. Zero, negativo, NaN e Infinity não são. */
function medidaValida(medida: number | undefined): medida is number {
  return typeof medida === 'number' && Number.isFinite(medida) && medida > 0
}

/** Quantidade para o cliente, em pt-BR: vírgula decimal. */
function formatarQuantidade(quantidade: number): string {
  return String(quantidade).replace('.', ',')
}

function plural(quantidade: number, singular: string, pluralForma: string): string {
  return `${formatarQuantidade(quantidade)} ${quantidade === 1 ? singular : pluralForma}`
}

/**
 * Regra 5.3: só devolve valor quando há tabela de preço e a medida exigida
 * pela forma de cobrança. Em qualquer dúvida, devolve sob_orcamento — nunca um número.
 * Só a medida da forma de cobrança do serviço é considerada; as demais são ignoradas.
 */
export function orcar(servico: Servico, medida: Medida): Orcamento {
  const preco = servico.precoCentavos
  if (preco === null || !Number.isFinite(preco) || preco <= 0) return SOB_ORCAMENTO

  let quantidade: number | undefined
  switch (servico.formaCobranca) {
    case 'hora':
      quantidade = medida.horas
      break
    case 'm2':
      quantidade = medida.metrosQuadrados
      break
    case 'diaria':
      quantidade = medida.diarias
      break
    default:
      return SOB_ORCAMENTO
  }
  if (!medidaValida(quantidade)) return SOB_ORCAMENTO

  const valor = Math.round(preco * quantidade)
  // Valor zero (medida minúscula) ou fora do inteiro seguro (medida absurda) não é orçamento.
  if (valor <= 0 || !Number.isSafeInteger(valor)) return SOB_ORCAMENTO

  const descricao =
    servico.formaCobranca === 'hora'
      ? plural(quantidade, 'hora', 'horas')
      : servico.formaCobranca === 'diaria'
        ? plural(quantidade, 'diária', 'diárias')
        : `${formatarQuantidade(quantidade)} m²`

  return { tipo: 'fechado', valor, detalhe: `${descricao} × ${reais(preco)}` }
}
