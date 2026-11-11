export const FUSO = 'America/Sao_Paulo'

/** Dinheiro sempre em centavos inteiros. Nunca float. */
export type Centavos = number

export type FormaCobranca = 'hora' | 'm2' | 'diaria' | 'sob_orcamento'
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
  precoCentavos: Centavos | null // null quando sob_orcamento
  ativo: boolean
}

export type Agendamento = {
  id: string
  servicoId: string
  clienteNome: string
  clienteContato: string
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
  valorCentavos: Centavos
  status: 'pendente' | 'pago'
  pagoEm: Date | null
}

export type Despesa = {
  id: string
  descricao: string
  valorCentavos: Centavos
  data: Date
}

/** Janela semanal recorrente. diaSemana: 0 = domingo ... 6 = sábado; horas "HH:mm" no FUSO. */
export type Disponibilidade = {
  id: string
  diaSemana: number
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
  return formatadorReais.format(valor / 100).replace(/ /g, ' ')
}
