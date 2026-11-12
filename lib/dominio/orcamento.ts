import { reais, type Centavos, type Servico } from './tipos'

export type Medida = { horas?: number; diarias?: number }

export type Orcamento =
  | { tipo: 'fechado'; valor: Centavos; detalhe: string }
  | { tipo: 'avaliacao'; mensagem: string; perguntas: string[] }
  | { tipo: 'visita_tecnica'; mensagem: string }
  | { tipo: 'abaixo_do_minimo'; minimoHoras: number; mensagem: string }

/** A diária é de 8 horas; horas além disso não são pacote, são diária ou equipe. */
const HORAS_POR_DIARIA = 8

const VISITA_TECNICA: Orcamento = Object.freeze({
  tipo: 'visita_tecnica',
  mensagem:
    'Para esse serviço a Allana precisa conhecer o local antes de passar o valor. Posso agendar uma visita técnica para você?',
})

const MENSAGEM_AVALIACAO =
  'A Allana consegue te passar o valor depois de saber alguns detalhes. Pode me responder as perguntas abaixo?'

const PERGUNTAS_GERAIS: readonly string[] = Object.freeze([
  'Qual é o tamanho aproximado do local?',
  'Como está o grau de sujeira: manutenção em dia ou acumulada?',
])

const PERGUNTA_HORAS = 'Quantas horas de serviço você precisa?'
const PERGUNTA_DIARIAS = 'Quantas diárias você precisa?'

/** Avaliação com perguntas congeladas; nunca carrega valor. */
function avaliacao(mensagem: string, perguntas: readonly string[]): Orcamento {
  return Object.freeze({
    tipo: 'avaliacao' as const,
    mensagem,
    perguntas: Object.freeze([...perguntas]) as string[],
  })
}

/** Avaliação com as perguntas cadastradas no serviço, ou as gerais se não houver. */
function avaliacaoDoServico(servico: Servico): Orcamento {
  const proprias = servico.perguntasAvaliacao
  return avaliacao(MENSAGEM_AVALIACAO, proprias.length > 0 ? proprias : PERGUNTAS_GERAIS)
}

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
 * Regra 5.3 e seção 14: só devolve valor quando a forma de cobrança é diária ou
 * hora, há preço de tabela e a medida é válida. Visita técnica e avaliação nunca
 * devolvem número, qualquer que seja o preço cadastrado. Em qualquer dúvida,
 * devolve uma saída sem valor. Só a medida da forma de cobrança é considerada.
 * Não existe cobrança por metro quadrado.
 */
export function orcar(servico: Servico, medida: Medida): Orcamento {
  if (servico.formaCobranca === 'visita_tecnica') return VISITA_TECNICA
  if (servico.formaCobranca === 'avaliacao') return avaliacaoDoServico(servico)

  const preco = servico.precoCentavos
  if (preco === null || !Number.isFinite(preco) || preco <= 0) return avaliacaoDoServico(servico)

  const porHora = servico.formaCobranca === 'hora'
  const quantidade = porHora ? medida.horas : medida.diarias
  if (!medidaValida(quantidade)) {
    return avaliacao(MENSAGEM_AVALIACAO, [porHora ? PERGUNTA_HORAS : PERGUNTA_DIARIAS])
  }

  if (porHora) {
    const minimo = servico.minimoHoras
    if (minimo !== null && quantidade < minimo) {
      return Object.freeze({
        tipo: 'abaixo_do_minimo' as const,
        minimoHoras: minimo,
        mensagem: `O mínimo para esse serviço é de ${plural(minimo, 'hora', 'horas')}, então não consigo fechar um pedido menor que isso.`,
      })
    }
    // Acima de uma diária deixa de ser pacote: quem decide é a Allana.
    if (quantidade > HORAS_POR_DIARIA) {
      return avaliacao(
        'O serviço por hora vai até 8 horas. Para um período maior, a Allana avalia se a melhor opção é diária ou equipe. Pode me responder as perguntas abaixo?',
        PERGUNTAS_GERAIS,
      )
    }
  }

  const valor = Math.round(preco * quantidade)
  // Valor zero (medida minúscula) ou fora do inteiro seguro (medida absurda) não é orçamento.
  if (valor <= 0 || !Number.isSafeInteger(valor)) {
    return avaliacao(MENSAGEM_AVALIACAO, [porHora ? PERGUNTA_HORAS : PERGUNTA_DIARIAS])
  }

  const descricao = porHora
    ? plural(quantidade, 'hora', 'horas')
    : plural(quantidade, 'diária', 'diárias')

  return { tipo: 'fechado', valor, detalhe: `${descricao} × ${reais(preco)}` }
}
