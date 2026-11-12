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
  duracaoEstimadaMin: number
  precoCentavos: Centavos | null // null quando avaliacao ou visita_tecnica
  /** Mínimo de horas que ela aceita vender; null quando não há mínimo. */
  minimoHoras: number | null
  /** Mesmo com preço de tabela, o serviço pode exigir equipe e orçamento ajustado. */
  podeExigirEquipe: boolean
  /** Perguntas que ela precisa ver respondidas antes de orçar (forma avaliacao). */
  perguntasAvaliacao: string[]
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
  maxServicosDia: number // padrão 2
  maxHorasSemana: number // padrão 30
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
  maxHorasSemana: 30,
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
