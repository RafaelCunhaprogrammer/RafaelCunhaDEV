export const FUSO = 'America/Sao_Paulo'

/** Dinheiro sempre em centavos inteiros. Nunca float. */
export type Centavos = number

/**
 * Como o serviço é cobrado (seção 14 da especificação).
 * - diaria / hora: há preço de tabela.
 * - avaliacao: ela orça à distância, depois de colher informações.
 * - visita_tecnica: não há preço sem ela ver o local; o caminho é agendar a visita.
 * Não existe cobrança por metro quadrado.
 */
export type FormaCobranca = 'diaria' | 'hora' | 'avaliacao' | 'visita_tecnica'

/**
 * Grau de sujeira do imóvel, nas palavras dela: "manutenção em dia ou acumulada?"
 * (pergunta de avaliação do catálogo). Entra no cálculo de quando o serviço pode
 * exigir equipe, porque o mesmo imóvel acumulado leva perto do dobro do tempo.
 */
export type GrauSujidade = 'manutencao' | 'acumulada'

export type StatusAgendamento =
  | 'aguardando_ela'
  | 'confirmado'
  | 'concluido'
  | 'cancelado'
  | 'recusado'
export type Faixa = 'verde' | 'amarela' | 'vermelha'

/** Intervalo de tempo; instantes absolutos, interpretados em FUSO. */
export type Intervalo = { inicio: Date; fim: Date }

export type Servico = {
  id: string
  nome: string
  descricao: string
  formaCobranca: FormaCobranca
  /** Estimativa do trabalho em si; null quando só se sabe depois de avaliar ou ver o local. */
  duracaoEstimadaMin: number | null
  /** Duração da visita técnica, que é um compromisso de agenda à parte; null sem visita. */
  duracaoVisitaMin: number | null
  precoCentavos: Centavos | null // null quando avaliacao ou visita_tecnica
  /** Mínimo de horas que ela aceita vender; null quando não há mínimo. */
  minimoHoras: number | null
  /** Mesmo com preço de tabela, o serviço pode exigir equipe e orçamento ajustado. */
  podeExigirEquipe: boolean
  /** Perguntas que ela precisa ver respondidas antes de orçar (forma avaliacao). */
  perguntasAvaliacao: readonly string[]
  ativo: boolean
}

export type Cliente = {
  id: string
  nome: string
  telefone: string
  email: string | null
  endereco: string
  bairro: string
  tipoImovel: string
  metrosQuadrados: number | null
  observacoes: string
  origem: 'indicacao' | 'site' | 'instagram'
  criadoEm: Date
}

export type Agendamento = {
  id: string
  servicoId: string
  clienteId: string
  clienteNovo: boolean
  bairro: string
  endereco: string
  inicio: Date
  fim: Date
  status: StatusAgendamento
  faixa: Faixa
  valorCentavos: Centavos
  observacoes: string
  criadoEm: Date
}

export type Pagamento = {
  id: string
  agendamentoId: string
  clienteId: string
  valorCentavos: Centavos
  metodo: string | null
  dataPrevista: Date
  status: 'pendente' | 'pago'
  pagoEm: Date | null
}

export type Despesa = {
  id: string
  descricao: string
  categoria: string
  recorrente: boolean
  valorCentavos: Centavos
  data: string // data de calendário 'YYYY-MM-DD'
}

/** Janela semanal recorrente. diaSemana: 0 = domingo ... 6 = sábado; horas "HH:mm" no FUSO. */
export type Disponibilidade = {
  id: string
  diaSemana: 0 | 1 | 2 | 3 | 4 | 5 | 6
  horaInicio: string
  horaFim: string
}

export type Bloqueio = {
  id: string
  inicio: Date
  fim: Date
  motivo: string
}

export type Regras = {
  deslocamentoMin: number // padrão 30
  antecedenciaMinHoras: number // padrão 24
  /**
   * Teto de carga (regra 5.6) em número de serviços **e** em horas, por dia e por
   * semana. Contar serviços não basta: com diárias de 8 horas, dois serviços num
   * dia são 16 horas de trabalho, que é impossível (seção 14.3, item 5). Para
   * diárias quem prende é sempre o teto de horas; o de serviços só prende em dias
   * com vários pedidos curtos do pacote de horas.
   */
  maxServicosDia: number // padrão 2
  maxHorasDia: number // padrão 8 — uma diária por dia
  maxServicosSemana: number // padrão 6
  maxHorasSemana: number // padrão 30
  /**
   * Até quantos metros quadrados uma pessoa dá conta numa diária de 8 horas.
   * Acima disso o serviço pode exigir equipe e orçamento ajustado (seção 14.3,
   * item 4), e quem decide é ela. Sujeira acumulada tem limite próprio, porque o
   * mesmo imóvel leva perto do dobro do tempo — dois números explícitos em vez de
   * um fator escondido.
   */
  m2MaximoDiaManutencao: number // padrão 150
  m2MaximoDiaAcumulada: number // padrão 80
  bairrosAtendidos: string[]
  podeFecharComClienteNovo: boolean // nasce false — coleira curta
  prazoRespostaHoras: number // padrão 2
  horaFimSilencio: number // padrão 9 — pedido de madrugada só notifica às 9h
  agentePausado: boolean // padrão false
}

export const REGRAS_PADRAO: Regras = {
  deslocamentoMin: 30,
  antecedenciaMinHoras: 24,
  maxServicosDia: 2,
  maxHorasDia: 8,
  maxServicosSemana: 6,
  maxHorasSemana: 30,
  m2MaximoDiaManutencao: 150,
  m2MaximoDiaAcumulada: 80,
  bairrosAtendidos: [],
  podeFecharComClienteNovo: false,
  prazoRespostaHoras: 2,
  horaFimSilencio: 9,
  agentePausado: false,
}

const formatadorReais = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/** Formata centavos como R$ — somente na borda de apresentação. */
export function reais(valor: Centavos): string {
  // Intl emite espaço não separável (U+00A0) em pt-BR; os testes esperam espaço comum.
  return formatadorReais.format(valor / 100).replace(/\u00a0/g, ' ')
}
