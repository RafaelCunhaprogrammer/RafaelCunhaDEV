import { conflita, horariosLivres, type IntervaloComEndereco } from './agenda'
import { CATALOGO } from './catalogo'
import { orcar, type Medida, type Orcamento } from './orcamento'
import {
  dataLocalISO,
  diaSemanaLocal,
  instanteDeMinutosLocais,
  instanteDeParedeLocal,
  minutosDeHoraMinuto,
  partesLocais,
} from './tempo'
import {
  reais,
  type Bloqueio,
  type Centavos,
  type Disponibilidade,
  type GrauSujidade,
  type Intervalo,
  type Regras,
  type Servico,
} from './tipos'

/**
 * Regras 5.5 e 5.6: até onde o agente vai sozinho.
 *
 * Este módulo decide uma coisa só — a faixa — e compõe quem já sabe o resto:
 * `orcar` para o preço, `conflita` e `horariosLivres` para a agenda. Nada de
 * cálculo de preço nem de sobreposição é reimplementado aqui.
 *
 * **A ordem de avaliação é a regra, não detalhe de implementação:**
 *
 * 1. `agentePausado` vence tudo. É o freio dela; pausada, nada é confirmado.
 * 2. `perguntar` vem antes de escalar. Acordar a Allana porque o cliente não
 *    disse quantas horas quer é transformar o agente em mais uma notificação.
 * 3. Vermelha antes de amarela. Se o pedido tem desconto *e* horário ocupado,
 *    quem decide é ela — oferecer alternativa seria negociar no lugar dela.
 * 4. Verde só quando nada mais se aplicou.
 *
 * `perguntar` **não é faixa**: é estado de conversa. O agente faz a pergunta e
 * reorça. Por isso essa saída não tem campo `faixa`.
 */

const MIN = 60_000
const HORA = 3_600_000
const DIA_MS = 86_400_000

/** Janela de busca de alternativas, em dias de calendário a partir de hoje. */
const DIAS_DE_BUSCA = 14
/** "O agente oferece até duas alternativas" (regra 5.5). */
const MAX_ALTERNATIVAS = 2
/** Tolerância na soma de horas, para fração binária não inventar estouro de teto. */
const EPSILON_HORAS = 1e-9

// --- tipos -------------------------------------------------------------------

/**
 * O que está sendo agendado. Serviço com forma `visita_tecnica` tem dois pedidos
 * possíveis: o serviço em si, que é dela (vermelha), e a visita técnica, que é um
 * compromisso curto de agenda e o agente fecha sozinho (seção 14.3, item 3).
 */
export type AlvoDoPedido = 'servico' | 'visita'

export type Pedido = {
  servicoId: string
  inicio: Date
  endereco: string
  bairro: string
  /** Medida pedida pelo cliente; a duração do agendamento sai do catálogo, não daqui. */
  medida: Medida
  /** Omisso é o serviço em si. */
  alvo?: AlvoDoPedido
  /** Colhidos antes de fechar serviço que pode exigir equipe; null é "ainda não perguntei". */
  tamanhoM2: number | null
  grauSujidade: GrauSujidade | null
  clienteNovo: boolean
  pediuFalarComEla: boolean
  alegouUrgencia: boolean
  pediuDesconto: boolean
  /** O agente não entendeu o pedido. Regra 5.5: isso é dela, sempre. */
  naoEntendi: boolean
  alternativasRecusadas: number
  repeticoesDoMesmoPedido: number
}

export type Contexto = {
  servico: Servico
  regras: Regras
  disponibilidade: Disponibilidade[]
  bloqueios: Bloqueio[]
  confirmados: IntervaloComEndereco[]
  /** Módulo puro: o relógio entra por parâmetro. */
  agora: Date
}

export type MotivoEscalada =
  | 'agente_pausado'
  | 'nao_entendi'
  | 'pediu_falar_com_ela'
  | 'alegou_urgencia'
  | 'desconto'
  | 'alternativas_recusadas'
  | 'insistencia'
  | 'fora_da_regiao'
  | 'avaliacao'
  | 'visita_tecnica'
  | 'pode_exigir_equipe'
  | 'cliente_novo'

export type MotivoOferta =
  | 'abaixo_do_minimo'
  | 'acima_do_pacote'
  | 'fora_do_expediente'
  | 'antecedencia'
  | 'horario_ocupado'
  | 'dia_cheio'
  | 'semana_cheia'

export type Decisao =
  | {
      faixa: 'verde'
      acao: 'confirmar'
      intervalo: Intervalo
      /** null na visita técnica: visita não tem preço, e preço não se inventa. */
      valorCentavos: Centavos | null
      detalhe: string
      /** Aviso de honestidade de preço; null quando não há o que avisar. */
      avisoPreco: string | null
    }
  | {
      faixa: 'amarela'
      acao: 'oferecer'
      motivo: MotivoOferta
      mensagem: string
      /** Vazia quando a saída não é outro horário, e sim outra medida ou outro serviço. */
      alternativas: readonly Intervalo[]
      medidaSugerida: Medida | null
    }
  | {
      faixa: 'vermelha'
      acao: 'escalar'
      motivo: MotivoEscalada
      mensagem: string
      /** Perguntas a levar para ela junto do caso (serviço por avaliação). */
      perguntas: readonly string[]
    }
  | { acao: 'perguntar'; mensagem: string; perguntas: readonly string[] }

// --- mensagens ---------------------------------------------------------------

const MENSAGENS_ESCALADA: Record<Exclude<MotivoEscalada, 'avaliacao' | 'visita_tecnica'>, string> = {
  agente_pausado:
    'Anotei seu pedido. Nesta semana a Allana está confirmando os agendamentos pessoalmente, e ela te responde.',
  nao_entendi:
    'Não quero te passar informação errada sobre isso. Vou chamar a Allana para te responder.',
  pediu_falar_com_ela: 'Claro. Já avisei a Allana e ela fala com você.',
  alegou_urgencia:
    'Entendi a urgência. Vou falar com a Allana agora para ela te responder o quanto antes.',
  desconto:
    'Valor e condição de pagamento são com a Allana. Já passei seu pedido para ela e te retorno.',
  alternativas_recusadas:
    'Vou passar seu pedido para a Allana, para ela ver se consegue um horário fora dos que eu te ofereci.',
  insistencia: 'Vou passar seu pedido para a Allana decidir pessoalmente e te retorno.',
  fora_da_regiao:
    'Esse bairro está fora da região que eu consigo confirmar sozinho. Vou perguntar para a Allana e te retorno.',
  pode_exigir_equipe:
    'Um imóvel desse tamanho pode precisar de equipe, e aí o valor muda. A Allana avalia e te retorna com o orçamento.',
  cliente_novo:
    'Como é o seu primeiro serviço com a Allana, ela confirma pessoalmente. Já passei para ela e te retorno.',
}

const PERGUNTAS_EQUIPE: readonly string[] = Object.freeze([
  'Qual é o tamanho aproximado do imóvel, em metros quadrados? Se não souber, diga quantos quartos e banheiros tem.',
  'Como está o grau de sujeira: manutenção em dia ou acumulada?',
])

const MENSAGEM_EQUIPE =
  'Para fechar o valor eu preciso de duas informações sobre o imóvel.'

// --- honestidade de preço ----------------------------------------------------

/**
 * A diária de tabela mais barata do catálogo. É ela que define o ponto de virada
 * do pacote de horas: R$ 70,00/h empata com a diária de R$ 500,00 em 7,14 horas.
 * Calculado, não chumbado — se ela mexer num preço, o ponto de virada acompanha.
 */
function diariaMaisBarata(): Servico | null {
  const comPreco = CATALOGO.filter(
    (s) =>
      s.ativo &&
      s.formaCobranca === 'diaria' &&
      typeof s.precoCentavos === 'number' &&
      s.precoCentavos > 0,
  )
  if (comPreco.length === 0) return null
  return comPreco.reduce((barata, s) =>
    (s.precoCentavos as number) < (barata.precoCentavos as number) ? s : barata,
  )
}

/**
 * Requisito de honestidade de preço: quando o pacote de horas alcança ou passa o
 * valor da diária mais barata para o mesmo tempo, o agente **diz isso**. Não é
 * desconto nem exceção — é o agente não deixar o cliente pagar mais caro por
 * desinformação sobre a tabela dela. O valor cotado não muda.
 */
function avisoDePreco(servico: Servico, valorCentavos: Centavos): string | null {
  if (servico.formaCobranca !== 'hora') return null
  const diaria = diariaMaisBarata()
  if (diaria === null) return null
  const precoDiaria = diaria.precoCentavos as number
  if (valorCentavos < precoDiaria) return null
  return (
    `Vale saber: esse pacote de horas sai por ${reais(valorCentavos)}, e a ${diaria.nome.toLowerCase()} ` +
    `custa ${reais(precoDiaria)} por uma diária de até 8 horas. Se preferir fechar como diária, eu troco.`
  )
}

// --- tempo e carga -----------------------------------------------------------

function duracaoEmHoras(intervalo: Intervalo): number {
  return (intervalo.fim.getTime() - intervalo.inicio.getTime()) / HORA
}

/** Meia-noite local do dia de `instante` deslocado em `dias` de calendário. */
function meiaNoiteLocal(instante: Date, dias = 0): Date {
  const p = partesLocais(instante)
  const deslocado = new Date(Date.UTC(p.ano, p.mes - 1, p.dia) + dias * DIA_MS)
  return instanteDeParedeLocal(
    deslocado.getUTCFullYear(),
    deslocado.getUTCMonth() + 1,
    deslocado.getUTCDate(),
    0,
    0,
  )
}

/** Meio-dia local: instante sem dúvida sobre qual é a data local do dia. */
function meioDiaLocal(instante: Date, dias = 0): Date {
  return new Date(meiaNoiteLocal(instante, dias).getTime() + 12 * HORA)
}

/** Semana de segunda a domingo, no FUSO, que contém `instante`. */
function semanaLocalDe(instante: Date): Intervalo {
  const recuo = (diaSemanaLocal(instante) + 6) % 7
  const inicio = meiaNoiteLocal(instante, -recuo)
  return { inicio, fim: meiaNoiteLocal(inicio, 7) }
}

type Carga = { servicos: number; horas: number }

function cargaDoDia(confirmados: readonly IntervaloComEndereco[], dia: Date): Carga {
  const diaISO = dataLocalISO(dia)
  const doDia = confirmados.filter((c) => dataLocalISO(c.inicio) === diaISO)
  return { servicos: doDia.length, horas: doDia.reduce((t, c) => t + duracaoEmHoras(c), 0) }
}

function cargaDaSemana(confirmados: readonly IntervaloComEndereco[], dia: Date): Carga {
  const semana = semanaLocalDe(dia)
  const daSemana = confirmados.filter(
    (c) =>
      c.inicio.getTime() >= semana.inicio.getTime() && c.inicio.getTime() < semana.fim.getTime(),
  )
  return { servicos: daSemana.length, horas: daSemana.reduce((t, c) => t + duracaoEmHoras(c), 0) }
}

/**
 * Regra 5.6: o teto de carga, em serviços **e** em horas, por dia e por semana.
 * Contar serviços não basta — duas diárias de 8 horas num dia são 16 horas de
 * trabalho (seção 14.3, item 5). Para diárias quem prende é sempre o teto de
 * horas; o de serviços só prende em dias com vários pedidos curtos.
 */
function estouraCarga(
  confirmados: readonly IntervaloComEndereco[],
  dia: Date,
  horasNovas: number,
  regras: Regras,
): 'dia_cheio' | 'semana_cheia' | null {
  const doDia = cargaDoDia(confirmados, dia)
  if (
    doDia.servicos + 1 > regras.maxServicosDia ||
    doDia.horas + horasNovas > regras.maxHorasDia + EPSILON_HORAS
  ) {
    return 'dia_cheio'
  }
  const daSemana = cargaDaSemana(confirmados, dia)
  if (
    daSemana.servicos + 1 > regras.maxServicosSemana ||
    daSemana.horas + horasNovas > regras.maxHorasSemana + EPSILON_HORAS
  ) {
    return 'semana_cheia'
  }
  return null
}

/** O intervalo inteiro cabe dentro de uma faixa de disponibilidade do dia local. */
function dentroDoExpediente(
  intervalo: Intervalo,
  disponibilidade: readonly Disponibilidade[],
): boolean {
  const dataISO = dataLocalISO(intervalo.inicio)
  const diaSemana = diaSemanaLocal(intervalo.inicio)
  return disponibilidade.some((faixa) => {
    if (faixa.diaSemana !== diaSemana) return false
    const minutoInicio = minutosDeHoraMinuto(faixa.horaInicio)
    const minutoFim = minutosDeHoraMinuto(faixa.horaFim)
    if (minutoInicio === null || minutoFim === null || minutoFim <= minutoInicio) return false
    const abre = instanteDeMinutosLocais(dataISO, minutoInicio)
    const fecha = instanteDeMinutosLocais(dataISO, minutoFim)
    return (
      intervalo.inicio.getTime() >= abre.getTime() && intervalo.fim.getTime() <= fecha.getTime()
    )
  })
}

/**
 * Sobreposição com um bloqueio dela. Reusa `conflita` com deslocamento zero: o
 * bloqueio é tempo dela, não um serviço noutro endereço, então não há viagem a
 * descontar nas bordas.
 */
function emBloqueio(
  intervalo: Intervalo,
  bloqueios: readonly Bloqueio[],
  endereco: string,
): boolean {
  const comoIntervalos: IntervaloComEndereco[] = bloqueios.map((b) => ({
    inicio: b.inicio,
    fim: b.fim,
    endereco,
  }))
  return conflita({ ...intervalo, endereco }, comoIntervalos, 0)
}

// --- duração -----------------------------------------------------------------

/**
 * A duração do agendamento sai do catálogo e da medida orçada, nunca do que o
 * cliente afirma: a diária é de 8 horas e isso **é** a duração (seção 14.3,
 * item 5). null significa "não sei a duração", e nada é confirmado sem ela.
 */
function duracaoMinDoPedido(servico: Servico, pedido: Pedido, alvo: AlvoDoPedido): number | null {
  if (alvo === 'visita') return positivo(servico.duracaoVisitaMin)

  if (servico.formaCobranca === 'hora') {
    const horas = positivo(pedido.medida.horas ?? null)
    return horas === null ? null : horas * 60
  }
  if (servico.formaCobranca === 'diaria') {
    const porDiaria = positivo(servico.duracaoEstimadaMin)
    const diarias = positivo(pedido.medida.diarias ?? 1)
    return porDiaria === null || diarias === null ? null : porDiaria * diarias
  }
  return null
}

function positivo(valor: number | null | undefined): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 ? valor : null
}

// --- região ------------------------------------------------------------------

/** "Jurerê", "jurere" e "JURERÊ" são um bairro só. */
function normalizarBairro(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}

/**
 * Região atendida vazia significa que ela ainda não cadastrou os bairros. O
 * agente não inventa exceção: sem a lista, ele não tem como afirmar que o
 * endereço está na região, então o pedido é dela.
 */
function foraDaRegiao(bairro: string, bairrosAtendidos: readonly string[]): boolean {
  if (bairrosAtendidos.length === 0) return true
  const pedido = normalizarBairro(bairro)
  return !bairrosAtendidos.some((b) => normalizarBairro(b) === pedido)
}

// --- equipe ------------------------------------------------------------------

/**
 * Seção 14.3, item 4: mesmo serviço com preço de tabela pode exigir equipe e
 * orçamento ajustado, pelo tamanho, pelo grau de sujeira e pela complexidade.
 * Então preço de tabela não é automaticamente seguro: antes de fechar em verde o
 * agente tem de ter colhido tamanho e grau de sujeira. Faltando, ele **pergunta**
 * (não acorda ela por uma pergunta). Acima do que uma pessoa faz em 8 horas,
 * quem decide sobre equipe é ela.
 */
function acimaDoQueUmaPessoaFaz(pedido: Pedido, regras: Regras): boolean {
  const tamanho = positivo(pedido.tamanhoM2)
  if (tamanho === null || pedido.grauSujidade === null) return false
  const limite =
    pedido.grauSujidade === 'acumulada' ? regras.m2MaximoDiaAcumulada : regras.m2MaximoDiaManutencao
  return tamanho > limite
}

function faltaDadoDeEquipe(pedido: Pedido): boolean {
  return positivo(pedido.tamanhoM2) === null || pedido.grauSujidade === null
}

// --- alternativas ------------------------------------------------------------

/**
 * Alternativas da faixa amarela: os primeiros blocos livres dos próximos 14 dias
 * que também cabem no teto de carga — oferecer um horário que estouraria a carga
 * dela seria empurrar o problema para a frente. O endereço do pedido vai para
 * `horariosLivres`, para não cobrar deslocamento contra um serviço no mesmo lugar.
 */
function alternativas(
  pedido: Pedido,
  contexto: Contexto,
  duracaoMin: number | null,
): readonly Intervalo[] {
  if (duracaoMin === null || duracaoMin <= 0) return []
  const { regras, disponibilidade, bloqueios, confirmados, agora } = contexto
  const horasNovas = duracaoMin / 60
  const encontradas: Intervalo[] = []

  for (let i = 0; i < DIAS_DE_BUSCA && encontradas.length < MAX_ALTERNATIVAS; i++) {
    const dia = meioDiaLocal(agora, i)
    if (estouraCarga(confirmados, dia, horasNovas, regras) !== null) continue

    const livres = horariosLivres({
      dia,
      duracaoMin,
      disponibilidade,
      bloqueios,
      confirmados,
      deslocamentoMin: regras.deslocamentoMin,
      antecedenciaMinHoras: regras.antecedenciaMinHoras,
      agora,
      endereco: pedido.endereco,
    })
    for (const bloco of livres) {
      if (encontradas.length >= MAX_ALTERNATIVAS) break
      encontradas.push(bloco)
    }
  }
  return encontradas
}

// --- construtores de decisão -------------------------------------------------

function escalar(
  motivo: MotivoEscalada,
  mensagem: string,
  perguntas: readonly string[] = [],
): Decisao {
  return Object.freeze({
    faixa: 'vermelha' as const,
    acao: 'escalar' as const,
    motivo,
    mensagem,
    perguntas: Object.freeze([...perguntas]),
  })
}

function oferecer(
  motivo: MotivoOferta,
  mensagem: string,
  alternativasOferecidas: readonly Intervalo[],
  medidaSugerida: Medida | null = null,
): Decisao {
  return Object.freeze({
    faixa: 'amarela' as const,
    acao: 'oferecer' as const,
    motivo,
    mensagem,
    alternativas: Object.freeze([...alternativasOferecidas]),
    medidaSugerida,
  })
}

function perguntar(mensagem: string, perguntas: readonly string[]): Decisao {
  return Object.freeze({
    acao: 'perguntar' as const,
    mensagem,
    perguntas: Object.freeze([...perguntas]),
  })
}

function confirmar(
  intervalo: Intervalo,
  valorCentavos: Centavos | null,
  detalhe: string,
  avisoPreco: string | null,
): Decisao {
  return Object.freeze({
    faixa: 'verde' as const,
    acao: 'confirmar' as const,
    intervalo: Object.freeze({ inicio: intervalo.inicio, fim: intervalo.fim }),
    valorCentavos,
    detalhe,
    avisoPreco,
  })
}

// --- a decisão ---------------------------------------------------------------

export function decidir(pedido: Pedido, contexto: Contexto): Decisao {
  const { servico, regras } = contexto
  const alvo = pedido.alvo ?? 'servico'

  // 1. O freio dela vence tudo (regra 5.5).
  if (regras.agentePausado) {
    return escalar('agente_pausado', MENSAGENS_ESCALADA.agente_pausado)
  }

  const servicoConfere = servico.id === pedido.servicoId
  // A visita técnica não é orçada: ela é um compromisso de agenda, não um preço.
  const orcamento: Orcamento | null =
    servicoConfere && alvo === 'servico' ? orcar(servico, pedido.medida) : null
  const precisaDeHorario = alvo === 'visita' || orcamento?.tipo === 'fechado'
  const duracaoMin = precisaDeHorario ? duracaoMinDoPedido(servico, pedido, alvo) : null

  // 2. Perguntas que o agente sabe fazer, antes de qualquer escalada.
  if (orcamento?.tipo === 'falta_medida') {
    return perguntar(orcamento.mensagem, orcamento.perguntas)
  }
  if (
    alvo === 'servico' &&
    servico.podeExigirEquipe &&
    orcamento?.tipo === 'fechado' &&
    faltaDadoDeEquipe(pedido)
  ) {
    return perguntar(MENSAGEM_EQUIPE, PERGUNTAS_EQUIPE)
  }

  // 3. Faixa vermelha, na ordem em que os motivos se sobrepõem.
  if (pedido.naoEntendi || !servicoConfere || (precisaDeHorario && duracaoMin === null)) {
    return escalar('nao_entendi', MENSAGENS_ESCALADA.nao_entendi)
  }
  if (pedido.pediuFalarComEla) {
    return escalar('pediu_falar_com_ela', MENSAGENS_ESCALADA.pediu_falar_com_ela)
  }
  if (pedido.alegouUrgencia) {
    return escalar('alegou_urgencia', MENSAGENS_ESCALADA.alegou_urgencia)
  }
  if (pedido.pediuDesconto) {
    return escalar('desconto', MENSAGENS_ESCALADA.desconto)
  }
  if (pedido.alternativasRecusadas >= MAX_ALTERNATIVAS) {
    return escalar('alternativas_recusadas', MENSAGENS_ESCALADA.alternativas_recusadas)
  }
  if (pedido.repeticoesDoMesmoPedido >= 3) {
    return escalar('insistencia', MENSAGENS_ESCALADA.insistencia)
  }
  if (foraDaRegiao(pedido.bairro, regras.bairrosAtendidos)) {
    return escalar('fora_da_regiao', MENSAGENS_ESCALADA.fora_da_regiao)
  }
  if (orcamento?.tipo === 'avaliacao') {
    // Ela orça à distância; o agente leva as perguntas dela junto do caso.
    return escalar('avaliacao', orcamento.mensagem, orcamento.perguntas)
  }
  if (orcamento?.tipo === 'visita_tecnica') {
    // O serviço é dela, mas a mensagem já oferece a visita: o cliente não fica no silêncio.
    return escalar('visita_tecnica', orcamento.mensagem)
  }
  if (alvo === 'servico' && servico.podeExigirEquipe && acimaDoQueUmaPessoaFaz(pedido, regras)) {
    return escalar('pode_exigir_equipe', MENSAGENS_ESCALADA.pode_exigir_equipe)
  }
  if (pedido.clienteNovo && !regras.podeFecharComClienteNovo) {
    return escalar('cliente_novo', MENSAGENS_ESCALADA.cliente_novo)
  }

  // 4. Faixa amarela: não cabe, mas há saída que o agente oferece sozinho.
  if (orcamento?.tipo === 'abaixo_do_minimo') {
    const minimo = orcamento.minimoHoras
    return oferecer(
      'abaixo_do_minimo',
      `${orcamento.mensagem} Quer que eu reserve ${minimo} horas para você?`,
      alternativas(pedido, contexto, minimo * 60),
      { horas: minimo },
    )
  }
  if (orcamento?.tipo === 'acima_do_pacote') {
    // A saída é outro serviço da tabela, e qual deles é conversa — não outro horário.
    return oferecer('acima_do_pacote', orcamento.mensagem, [])
  }

  // Daqui para baixo há preço fechado (ou é a visita) e duração conhecida.
  if (duracaoMin === null) return escalar('nao_entendi', MENSAGENS_ESCALADA.nao_entendi)
  const intervalo: Intervalo = {
    inicio: pedido.inicio,
    fim: new Date(pedido.inicio.getTime() + duracaoMin * MIN),
  }
  const horasNovas = duracaoMin / 60

  if (!dentroDoExpediente(intervalo, contexto.disponibilidade)) {
    return oferecer(
      'fora_do_expediente',
      'Esse horário está fora do expediente da Allana, mas eu tenho estas opções:',
      alternativas(pedido, contexto, duracaoMin),
    )
  }
  const antecedenciaMs = Math.max(0, regras.antecedenciaMinHoras) * HORA
  if (intervalo.inicio.getTime() - contexto.agora.getTime() < antecedenciaMs) {
    return oferecer(
      'antecedencia',
      `Para esse serviço eu preciso de pelo menos ${regras.antecedenciaMinHoras} horas de antecedência. Posso te oferecer:`,
      alternativas(pedido, contexto, duracaoMin),
    )
  }
  const candidato: IntervaloComEndereco = { ...intervalo, endereco: pedido.endereco }
  if (
    conflita(candidato, contexto.confirmados, regras.deslocamentoMin) ||
    emBloqueio(intervalo, contexto.bloqueios, pedido.endereco)
  ) {
    return oferecer(
      'horario_ocupado',
      'Esse horário já está ocupado na agenda dela, mas eu tenho estas opções:',
      alternativas(pedido, contexto, duracaoMin),
    )
  }
  const estouro = estouraCarga(contexto.confirmados, intervalo.inicio, horasNovas, regras)
  if (estouro === 'dia_cheio') {
    return oferecer(
      'dia_cheio',
      'A agenda desse dia já está cheia. Posso te oferecer estes horários:',
      alternativas(pedido, contexto, duracaoMin),
    )
  }
  if (estouro === 'semana_cheia') {
    return oferecer(
      'semana_cheia',
      'A semana dela já está cheia. Posso te oferecer estes horários:',
      alternativas(pedido, contexto, duracaoMin),
    )
  }

  // 5. Verde: nada mais se aplicou.
  if (alvo === 'visita') {
    return confirmar(intervalo, null, `Visita técnica de ${duracaoMin / 60} hora`, null)
  }
  if (orcamento?.tipo !== 'fechado') {
    // Inalcançável: só chega aqui com orçamento fechado. Se mudar, não confirma.
    return escalar('nao_entendi', MENSAGENS_ESCALADA.nao_entendi)
  }
  return confirmar(
    intervalo,
    orcamento.valor,
    orcamento.detalhe,
    avisoDePreco(servico, orcamento.valor),
  )
}
