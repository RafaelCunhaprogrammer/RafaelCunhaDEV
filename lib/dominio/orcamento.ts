import { reais, type Centavos, type Servico } from './tipos'

export type Medida = { horas?: number; metrosQuadrados?: number; diarias?: number }

export type Orcamento =
  | { tipo: 'fechado'; valor: Centavos; detalhe: string }
  | { tipo: 'sob_orcamento'; mensagem: string }

const SOB_ORCAMENTO: Orcamento = {
  tipo: 'sob_orcamento',
  mensagem: 'A Alana avalia e te retorna com o valor.',
}

/** Medida utilizável: número finito e positivo. Zero, negativo, NaN e Infinity não são. */
function medidaValida(medida: number | undefined): medida is number {
  return typeof medida === 'number' && Number.isFinite(medida) && medida > 0
}

function plural(quantidade: number, singular: string, pluralForma: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : pluralForma}`
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
  let descricaoQuantidade: string
  switch (servico.formaCobranca) {
    case 'hora':
      quantidade = medida.horas
      descricaoQuantidade = medidaValida(quantidade) ? plural(quantidade, 'hora', 'horas') : ''
      break
    case 'm2':
      quantidade = medida.metrosQuadrados
      descricaoQuantidade = `${String(quantidade).replace(".", ",")} m²`
      break
    case 'diaria':
      quantidade = medida.diarias
      descricaoQuantidade = medidaValida(quantidade) ? plural(quantidade, 'diária', 'diárias') : ''
      break
    default:
      return SOB_ORCAMENTO
  }
  if (!medidaValida(quantidade)) return SOB_ORCAMENTO

  return {
    tipo: 'fechado',
    valor: Math.round(preco * quantidade),
    detalhe: `${descricaoQuantidade} × ${reais(preco)}`,
  }
}
