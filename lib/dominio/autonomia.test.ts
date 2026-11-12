import { FUSO, REGRAS_PADRAO, type Bloqueio, type Disponibilidade, type Regras } from './tipos'
import type { IntervaloComEndereco } from './agenda'
import { CATALOGO } from './catalogo'
import { decidir, type Contexto, type Decisao, type Pedido } from './autonomia'

// ---------------------------------------------------------------------------
// Auxiliares. Como em agenda.test.ts, os instantes são escritos em UTC
// explícito e a hora local é lida direto do Intl, para que um erro em
// lib/dominio/tempo.ts não possa esconder um erro aqui.
// ---------------------------------------------------------------------------

/** Instante UTC a partir de "YYYY-MM-DDTHH:mm". Sem ambiguidade de fuso. */
const utc = (texto: string) => new Date(`${texto}:00.000Z`)

const leitorLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function horaMinutoLocal(instante: Date): string {
  return leitorLocal.format(instante).split(', ')[1]
}

function diaLocal(instante: Date): string {
  return leitorLocal.format(instante).split(', ')[0]
}

/** A faixa da decisão; `undefined` em 'perguntar', que de propósito não tem faixa. */
function faixaDe(decisao: Decisao): string | undefined {
  return 'faixa' in decisao ? decisao.faixa : undefined
}

function servicoDe(id: string) {
  const servico = CATALOGO.find((s) => s.id === id)
  if (!servico) throw new Error(`Serviço inexistente no catálogo: ${id}`)
  return servico
}

const DIARIA = servicoDe('residencial-manutencao')
const PACOTE = servicoDe('pacote-horas')
const VIDROS = servicoDe('vidros')
const POS_OBRA = servicoDe('pos-obra')

const ENDERECO = 'Rua das Flores, 100 - Centro'
const OUTRO_ENDERECO = 'Av. Beira-Mar, 2000 - Agronômica'

// Segunda a sábado, 08:00 às 18:00.
const expediente: Disponibilidade[] = [1, 2, 3, 4, 5, 6].map((diaSemana) => ({
  id: `disp-${diaSemana}`,
  diaSemana: diaSemana as 1 | 2 | 3 | 4 | 5 | 6,
  horaInicio: '08:00',
  horaFim: '18:00',
}))

// Quinta, 12/11/2026, meio-dia em São Paulo.
const AGORA = utc('2026-11-12T15:00')

const regras: Regras = {
  ...REGRAS_PADRAO,
  bairrosAtendidos: ['Centro', 'Agronômica', 'Trindade'],
  maxHorasDia: 8,
  maxServicosSemana: 6,
}

const contextoBom: Contexto = {
  servico: DIARIA,
  regras,
  disponibilidade: expediente,
  bloqueios: [],
  confirmados: [],
  agora: AGORA,
}

const pedidoCru: Pedido = {
  servicoId: DIARIA.id,
  // Quinta, 19/11/2026, 08:00 local — dentro do expediente e com 7 dias de antecedência.
  inicio: utc('2026-11-19T11:00'),
  endereco: ENDERECO,
  bairro: 'Centro',
  medida: {},
  alvo: 'servico',
  tamanhoM2: 90,
  grauSujidade: 'manutencao',
  clienteNovo: false,
  pediuFalarComEla: false,
  alegouUrgencia: false,
  pediuDesconto: false,
  naoEntendi: false,
  alternativasRecusadas: 0,
  repeticoesDoMesmoPedido: 0,
}

const pedidoBom = pedidoCru

function confirmado(inicio: string, fim: string, endereco = OUTRO_ENDERECO): IntervaloComEndereco {
  return { inicio: utc(inicio), fim: utc(fim), endereco }
}

// --- faixa verde ------------------------------------------------------------

test('pedido que cabe em todas as condições é verde', () => {
  const d = decidir(pedidoBom, contextoBom)
  expect(d).toEqual({
    faixa: 'verde',
    acao: 'confirmar',
    intervalo: { inicio: utc('2026-11-19T11:00'), fim: utc('2026-11-19T19:00') },
    valorCentavos: 50000,
    detalhe: '1 diária × R$ 500,00',
    avisoPreco: null,
  })
})

test('a duração do agendamento vem do catálogo, não do cliente: a diária é de 8 horas', () => {
  const d = decidir(pedidoBom, contextoBom)
  if (d.acao !== 'confirmar') throw new Error('esperava verde')
  const horas = (d.intervalo.fim.getTime() - d.intervalo.inicio.getTime()) / 3_600_000
  expect(horas).toBe(8)
})

// --- faixa amarela ----------------------------------------------------------

const contextoComHorarioOcupado: Contexto = {
  ...contextoBom,
  confirmados: [confirmado('2026-11-19T12:00', '2026-11-19T15:00')],
}

test('horário ocupado é amarela com até duas alternativas', () => {
  const d = decidir(pedidoBom, contextoComHorarioOcupado)
  expect(d.acao).toBe('oferecer')
  if (d.acao !== 'oferecer') return
  expect(d.motivo).toBe('horario_ocupado')
  expect(d.alternativas.length).toBeLessThanOrEqual(2)
  expect(d.alternativas.length).toBeGreaterThan(0)
})

test('fora do expediente é amarela', () => {
  // 22:00 local de quinta — fora da faixa 08:00–18:00.
  const d = decidir({ ...pedidoBom, inicio: utc('2026-11-20T01:00') }, contextoBom)
  expect(d.acao).toBe('oferecer')
  if (d.acao !== 'oferecer') return
  expect(d.motivo).toBe('fora_do_expediente')
})

test('abaixo da antecedência mínima é amarela', () => {
  // amanhã às 08:00 local, com mínimo de 24 horas e agora ao meio-dia de hoje
  const d = decidir({ ...pedidoBom, inicio: utc('2026-11-13T11:00') }, contextoBom)
  expect(d.acao).toBe('oferecer')
  if (d.acao !== 'oferecer') return
  expect(d.motivo).toBe('antecedencia')
})

test('estourar o teto de serviços do dia é amarela e oferece outro dia', () => {
  // maxServicosDia: 2, já há dois confirmados curtos no dia, e ainda há horário livre
  const contexto: Contexto = {
    ...contextoBom,
    servico: PACOTE,
    regras: { ...regras, maxServicosDia: 2 },
    confirmados: [
      confirmado('2026-11-19T11:00', '2026-11-19T13:00'),
      confirmado('2026-11-19T13:30', '2026-11-19T15:30'),
    ],
  }
  const pedido: Pedido = {
    ...pedidoBom,
    servicoId: PACOTE.id,
    medida: { horas: 4 },
    inicio: utc('2026-11-19T17:00'), // 14:00 local, livre
  }
  const d = decidir(pedido, contexto)
  expect(d.acao).toBe('oferecer')
  if (d.acao !== 'oferecer') return
  expect(d.motivo).toBe('dia_cheio')
  expect(d.alternativas.length).toBeGreaterThan(0)
  expect(d.alternativas.every((a) => diaLocal(a.inicio) !== diaLocal(pedido.inicio))).toBe(true)
})

test('estourar o teto de horas do dia é amarela, mesmo sem estourar o de serviços', () => {
  // 5 horas já confirmadas + 4 pedidas = 9 horas, acima do teto de 8; só 2 serviços no dia
  const contexto: Contexto = {
    ...contextoBom,
    servico: PACOTE,
    regras: { ...regras, maxServicosDia: 3, maxHorasDia: 8 },
    confirmados: [confirmado('2026-11-19T11:00', '2026-11-19T16:00')],
  }
  const pedido: Pedido = {
    ...pedidoBom,
    servicoId: PACOTE.id,
    medida: { horas: 4 },
    inicio: utc('2026-11-19T16:30'), // 13:30 local, livre depois do deslocamento
  }
  const d = decidir(pedido, contexto)
  expect(d.acao).toBe('oferecer')
  if (d.acao !== 'oferecer') return
  expect(d.motivo).toBe('dia_cheio')
})

test('duas diárias de 8 horas no mesmo dia são impossíveis: o teto de horas do dia é 8', () => {
  expect(regras.maxHorasDia).toBe(8)
  expect(REGRAS_PADRAO.maxHorasDia).toBe(8)
  const contexto: Contexto = {
    ...contextoBom,
    regras: { ...regras, maxServicosDia: 2 },
    confirmados: [confirmado('2026-11-19T11:00', '2026-11-19T19:00')],
  }
  // mesmo que houvesse espaço no calendário, a segunda diária não cabe nas horas dela
  const d = decidir({ ...pedidoBom, inicio: utc('2026-11-19T19:30') }, contexto)
  expect(d.acao).toBe('oferecer')
})

test('estourar o teto de horas da semana é amarela e oferece outra semana', () => {
  const contexto: Contexto = {
    ...contextoBom,
    regras: { ...regras, maxHorasSemana: 10 },
    // quarta, 18/11, mesma semana (segunda 16/11 a domingo 22/11): 4 horas
    confirmados: [confirmado('2026-11-18T11:00', '2026-11-18T15:00')],
  }
  const d = decidir(pedidoBom, contexto)
  expect(d.acao).toBe('oferecer')
  if (d.acao !== 'oferecer') return
  expect(d.motivo).toBe('semana_cheia')
  expect(d.alternativas.length).toBeGreaterThan(0)
  const semanaCheia = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']
  expect(d.alternativas.some((a) => semanaCheia.includes(diaLocal(a.inicio)))).toBe(false)
})

test('estourar o teto de serviços da semana é amarela', () => {
  const contexto: Contexto = {
    ...contextoBom,
    servico: PACOTE,
    regras: { ...regras, maxServicosSemana: 2, maxHorasSemana: 40 },
    confirmados: [
      confirmado('2026-11-16T11:00', '2026-11-16T13:00'),
      confirmado('2026-11-17T11:00', '2026-11-17T13:00'),
    ],
  }
  const d = decidir(
    { ...pedidoBom, servicoId: PACOTE.id, medida: { horas: 4 } },
    contexto,
  )
  expect(d.acao).toBe('oferecer')
  if (d.acao !== 'oferecer') return
  expect(d.motivo).toBe('semana_cheia')
})

test('as alternativas oferecidas respeitam o teto de carga do dia', () => {
  const contexto: Contexto = {
    ...contextoBom,
    regras: { ...regras, maxServicosDia: 1 },
    // sexta 20/11 já tem um serviço: nenhuma alternativa pode cair nela
    confirmados: [
      confirmado('2026-11-19T12:00', '2026-11-19T15:00'),
      confirmado('2026-11-20T11:00', '2026-11-20T13:00'),
    ],
  }
  const d = decidir(pedidoBom, contexto)
  if (d.acao !== 'oferecer') throw new Error('esperava amarela')
  expect(d.alternativas.length).toBeGreaterThan(0)
  for (const a of d.alternativas) {
    expect(diaLocal(a.inicio)).not.toBe('2026-11-19')
    expect(diaLocal(a.inicio)).not.toBe('2026-11-20')
  }
})

test('as alternativas caem dentro do expediente', () => {
  const d = decidir(pedidoBom, contextoComHorarioOcupado)
  if (d.acao !== 'oferecer') throw new Error('esperava amarela')
  for (const a of d.alternativas) {
    expect(horaMinutoLocal(a.inicio) >= '08:00').toBe(true)
    expect(horaMinutoLocal(a.fim) <= '18:00').toBe(true)
  }
})

// --- faixa vermelha ---------------------------------------------------------

const pedidoAvaliacao: Pedido = { ...pedidoBom, servicoId: VIDROS.id }
const contextoAvaliacao: Contexto = { ...contextoBom, servico: VIDROS }

test.each([
  ['pedido de desconto', { ...pedidoBom, pediuDesconto: true }, contextoBom, 'desconto'],
  ['bairro fora da região', { ...pedidoBom, bairro: 'Jurerê' }, contextoBom, 'fora_da_regiao'],
  ['pediu falar com ela', { ...pedidoBom, pediuFalarComEla: true }, contextoBom, 'pediu_falar_com_ela'],
  ['alegou urgência', { ...pedidoBom, alegouUrgencia: true }, contextoBom, 'alegou_urgencia'],
  ['o agente não entendeu', { ...pedidoBom, naoEntendi: true }, contextoBom, 'nao_entendi'],
  ['serviço por avaliação', pedidoAvaliacao, contextoAvaliacao, 'avaliacao'],
])('%s é vermelha', (_, pedido, contexto, motivo) => {
  const d = decidir(pedido as Pedido, contexto as Contexto)
  expect(d.acao).toBe('escalar')
  if (d.acao !== 'escalar') return
  expect(d.motivo).toBe(motivo)
})

test('serviço por avaliação escala levando as perguntas dela', () => {
  const d = decidir(pedidoAvaliacao, contextoAvaliacao)
  if (d.acao !== 'escalar') throw new Error('esperava vermelha')
  expect(d.perguntas).toEqual(VIDROS.perguntasAvaliacao)
  expect(d.mensagem).not.toMatch(/R\$/)
})

test('serviço sob avaliação nunca devolve valor', () => {
  const d = decidir(pedidoAvaliacao, contextoAvaliacao)
  expect(JSON.stringify(d)).not.toMatch(/valorCentavos/)
})

test('pedir o serviço pós-obra em si é vermelha', () => {
  const d = decidir(
    { ...pedidoBom, servicoId: POS_OBRA.id, alvo: 'servico' },
    { ...contextoBom, servico: POS_OBRA },
  )
  expect(d.acao).toBe('escalar')
  if (d.acao !== 'escalar') return
  expect(d.motivo).toBe('visita_tecnica')
  // mas o cliente ouve a oferta da visita, e não um silêncio
  expect(d.mensagem).toMatch(/visita/i)
})

test('serviço sem endereço na região não é salvo por nada: região vazia escala', () => {
  const d = decidir(pedidoBom, { ...contextoBom, regras: { ...regras, bairrosAtendidos: [] } })
  expect(d.acao).toBe('escalar')
  if (d.acao !== 'escalar') return
  expect(d.motivo).toBe('fora_da_regiao')
})

test('bairro é comparado sem diferenciar acento nem caixa', () => {
  const d = decidir({ ...pedidoBom, bairro: 'agronomica' }, contextoBom)
  expect(faixaDe(d)).toBe('verde')
})

test('recusar as duas alternativas escala', () => {
  const d = decidir({ ...pedidoBom, alternativasRecusadas: 2 }, contextoComHorarioOcupado)
  expect(d.acao).toBe('escalar')
  if (d.acao !== 'escalar') return
  expect(d.motivo).toBe('alternativas_recusadas')
})

test('repetir o mesmo pedido pela terceira vez escala', () => {
  const d = decidir({ ...pedidoBom, repeticoesDoMesmoPedido: 3 }, contextoComHorarioOcupado)
  if (d.acao !== 'escalar') throw new Error('esperava vermelha')
  expect(d.motivo).toBe('insistencia')
})

test('cliente novo escala quando a coleira está curta', () => {
  const contexto: Contexto = {
    ...contextoBom,
    regras: { ...regras, podeFecharComClienteNovo: false },
  }
  const d = decidir({ ...pedidoBom, clienteNovo: true }, contexto)
  if (d.acao !== 'escalar') throw new Error('esperava vermelha')
  expect(d.motivo).toBe('cliente_novo')
})

test('cliente novo é verde quando a coleira está solta', () => {
  const contexto: Contexto = {
    ...contextoBom,
    regras: { ...regras, podeFecharComClienteNovo: true },
  }
  expect(faixaDe(decidir({ ...pedidoBom, clienteNovo: true }, contexto))).toBe('verde')
})

test('serviço com preço de tabela mas sem duração cadastrada não é confirmado', () => {
  const quebrado = { ...DIARIA, duracaoEstimadaMin: null }
  const d = decidir(pedidoBom, { ...contextoBom, servico: quebrado })
  if (d.acao !== 'escalar') throw new Error('esperava vermelha')
  expect(d.motivo).toBe('nao_entendi')
})

test('pedido com serviço diferente do contexto não é confirmado', () => {
  const d = decidir({ ...pedidoBom, servicoId: 'outro-servico' }, contextoBom)
  if (d.acao !== 'escalar') throw new Error('esperava vermelha')
  expect(d.motivo).toBe('nao_entendi')
})

// --- ordem de avaliação -----------------------------------------------------

test('agente pausado nunca confirma', () => {
  const contexto: Contexto = { ...contextoBom, regras: { ...regras, agentePausado: true } }
  const d = decidir(pedidoBom, contexto)
  expect(d.acao).toBe('escalar')
  if (d.acao !== 'escalar') return
  expect(d.motivo).toBe('agente_pausado')
})

test('agente pausado vence qualquer outro motivo', () => {
  const contexto: Contexto = {
    ...contextoComHorarioOcupado,
    servico: PACOTE,
    regras: { ...regras, agentePausado: true, podeFecharComClienteNovo: false },
  }
  const d = decidir(
    {
      ...pedidoBom,
      servicoId: PACOTE.id,
      medida: {}, // faltando a medida, que normalmente viraria 'perguntar'
      bairro: 'Jurerê',
      clienteNovo: true,
      pediuDesconto: true,
      pediuFalarComEla: true,
    },
    contexto,
  )
  if (d.acao !== 'escalar') throw new Error('esperava vermelha')
  expect(d.motivo).toBe('agente_pausado')
})

test('vermelha vence amarela quando as duas se aplicam', () => {
  // horário ocupado E pedido de desconto
  expect(faixaDe(decidir({ ...pedidoBom, pediuDesconto: true }, contextoComHorarioOcupado))).toBe(
    'vermelha',
  )
})

test('perguntar vence vermelha: ela não é acordada por uma pergunta que o agente sabe fazer', () => {
  const d = decidir(
    { ...pedidoBom, servicoId: PACOTE.id, medida: {}, pediuDesconto: true },
    { ...contextoBom, servico: PACOTE },
  )
  expect(d.acao).toBe('perguntar')
})

test('a decisão de perguntar não tem faixa: não é escalada nem oferta', () => {
  const d = decidir(
    { ...pedidoBom, servicoId: PACOTE.id, medida: {} },
    { ...contextoBom, servico: PACOTE },
  )
  expect(d.acao).toBe('perguntar')
  expect('faixa' in d).toBe(false)
})

// --- as seis saídas de orcar ------------------------------------------------

test('falta medida é perguntar, não escalada', () => {
  const d = decidir(
    { ...pedidoBom, servicoId: PACOTE.id, medida: {} },
    { ...contextoBom, servico: PACOTE },
  )
  if (d.acao !== 'perguntar') throw new Error('esperava perguntar')
  expect(d.perguntas.length).toBeGreaterThan(0)
})

test('abaixo do mínimo é amarela e oferece o mínimo', () => {
  const d = decidir(
    { ...pedidoBom, servicoId: PACOTE.id, medida: { horas: 2 } },
    { ...contextoBom, servico: PACOTE },
  )
  expect(d.acao).toBe('oferecer')
  if (d.acao !== 'oferecer') return
  expect(d.motivo).toBe('abaixo_do_minimo')
  expect(d.medidaSugerida).toEqual({ horas: 4 })
  expect(d.mensagem).toMatch(/4 horas/)
  // e as alternativas já são blocos de 4 horas
  for (const a of d.alternativas) {
    expect((a.fim.getTime() - a.inicio.getTime()) / 3_600_000).toBe(4)
  }
})

test('acima do pacote é amarela e sugere a diária', () => {
  const d = decidir(
    { ...pedidoBom, servicoId: PACOTE.id, medida: { horas: 9 } },
    { ...contextoBom, servico: PACOTE },
  )
  expect(d.acao).toBe('oferecer')
  if (d.acao !== 'oferecer') return
  expect(d.motivo).toBe('acima_do_pacote')
  expect(d.mensagem).toMatch(/diária/i)
})

// --- visita técnica ---------------------------------------------------------

const pedidoVisita: Pedido = {
  ...pedidoBom,
  servicoId: POS_OBRA.id,
  alvo: 'visita',
  tamanhoM2: null,
  grauSujidade: null,
}
const contextoVisita: Contexto = { ...contextoBom, servico: POS_OBRA }

test('agendar a visita técnica é verde: uma hora não precisa acordar a Allana', () => {
  const d = decidir(pedidoVisita, contextoVisita)
  expect(faixaDe(d)).toBe('verde')
  if (d.acao !== 'confirmar') return
  expect((d.intervalo.fim.getTime() - d.intervalo.inicio.getTime()) / 60_000).toBe(60)
  // a visita não tem preço: nada é inventado
  expect(d.valorCentavos).toBe(null)
})

test('a visita técnica conta no teto de carga como qualquer compromisso', () => {
  const contexto: Contexto = {
    ...contextoVisita,
    regras: { ...regras, maxServicosDia: 1 },
    confirmados: [confirmado('2026-11-19T17:00', '2026-11-19T19:00')],
  }
  const d = decidir(pedidoVisita, contexto)
  expect(d.acao).toBe('oferecer')
  if (d.acao !== 'oferecer') return
  expect(d.motivo).toBe('dia_cheio')
})

test('a coleira de cliente novo também vale para a visita técnica', () => {
  const contexto: Contexto = {
    ...contextoVisita,
    regras: { ...regras, podeFecharComClienteNovo: false },
  }
  const d = decidir({ ...pedidoVisita, clienteNovo: true }, contexto)
  if (d.acao !== 'escalar') throw new Error('esperava vermelha')
  expect(d.motivo).toBe('cliente_novo')
})

test('pedir visita técnica de serviço que não tem visita não é confirmado', () => {
  const d = decidir({ ...pedidoBom, alvo: 'visita' }, contextoBom)
  if (d.acao !== 'escalar') throw new Error('esperava vermelha')
  expect(d.motivo).toBe('nao_entendi')
})

// --- pode exigir equipe -----------------------------------------------------

test('serviço que pode exigir equipe sem tamanho é perguntar, não escalada', () => {
  const d = decidir({ ...pedidoBom, tamanhoM2: null }, contextoBom)
  expect(d.acao).toBe('perguntar')
  if (d.acao !== 'perguntar') return
  expect(d.perguntas.length).toBeGreaterThan(0)
})

test('serviço que pode exigir equipe sem grau de sujeira é perguntar', () => {
  const d = decidir({ ...pedidoBom, grauSujidade: null }, contextoBom)
  expect(d.acao).toBe('perguntar')
})

test('tamanho dentro do que uma pessoa faz em 8 horas é verde', () => {
  expect(faixaDe(decidir({ ...pedidoBom, tamanhoM2: 150 }, contextoBom))).toBe('verde')
})

test('imóvel grande demais para uma pessoa é vermelha: ela decide sobre equipe', () => {
  const d = decidir({ ...pedidoBom, tamanhoM2: 400 }, contextoBom)
  if (d.acao !== 'escalar') throw new Error('esperava vermelha')
  expect(d.motivo).toBe('pode_exigir_equipe')
})

test('sujeira acumulada tem limite próprio, menor que o de manutenção', () => {
  expect(regras.m2MaximoDiaAcumulada).toBeLessThan(regras.m2MaximoDiaManutencao)
  const acumulada = { ...pedidoBom, tamanhoM2: 100, grauSujidade: 'acumulada' as const }
  const d = decidir(acumulada, contextoBom)
  if (d.acao !== 'escalar') throw new Error('esperava vermelha')
  expect(d.motivo).toBe('pode_exigir_equipe')
  // o mesmo imóvel em manutenção fecha sozinho
  expect(faixaDe(decidir({ ...acumulada, grauSujidade: 'manutencao' }, contextoBom))).toBe(
    'verde',
  )
})

test('o limite de equipe é configurável por ela', () => {
  const contexto: Contexto = { ...contextoBom, regras: { ...regras, m2MaximoDiaManutencao: 80 } }
  const d = decidir({ ...pedidoBom, tamanhoM2: 90 }, contexto)
  if (d.acao !== 'escalar') throw new Error('esperava vermelha')
  expect(d.motivo).toBe('pode_exigir_equipe')
})

test('serviço que não pode exigir equipe não exige tamanho nem sujeira', () => {
  const d = decidir(
    { ...pedidoBom, servicoId: PACOTE.id, medida: { horas: 4 }, tamanhoM2: null, grauSujidade: null },
    { ...contextoBom, servico: PACOTE },
  )
  expect(faixaDe(d)).toBe('verde')
})

// --- honestidade de preço ---------------------------------------------------

/** Ponto de virada calculado do catálogo: nenhum número de hora chumbado no teste. */
const menorDiaria = Math.min(
  ...CATALOGO.filter((s) => s.formaCobranca === 'diaria' && s.precoCentavos !== null).map(
    (s) => s.precoCentavos as number,
  ),
)
const precoHora = PACOTE.precoCentavos as number
const horasDeVirada = menorDiaria / precoHora

test('o ponto de virada entre o pacote de horas e a diária é 7,14 horas', () => {
  expect(menorDiaria).toBe(50000)
  expect(precoHora).toBe(7000)
  expect(horasDeVirada).toBeCloseTo(7.142857, 5)
})

test('pacote de horas que empata com a diária avisa o cliente', () => {
  const horas = Math.ceil(horasDeVirada) // 8
  const d = decidir(
    { ...pedidoBom, servicoId: PACOTE.id, medida: { horas } },
    { ...contextoBom, servico: PACOTE },
  )
  if (d.acao !== 'confirmar') throw new Error('esperava verde')
  expect(d.avisoPreco).not.toBe(null)
  expect(d.avisoPreco).toMatch(/diária/i)
  expect(d.avisoPreco).toMatch(/R\$ 500,00/)
})

test('o aviso de preço não muda o valor cobrado', () => {
  const horas = Math.ceil(horasDeVirada)
  const d = decidir(
    { ...pedidoBom, servicoId: PACOTE.id, medida: { horas } },
    { ...contextoBom, servico: PACOTE },
  )
  if (d.acao !== 'confirmar') throw new Error('esperava verde')
  expect(d.valorCentavos).toBe(horas * precoHora)
})

test('pacote de horas mais barato que a diária não avisa nada', () => {
  const horas = Math.floor(horasDeVirada) // 7
  const d = decidir(
    { ...pedidoBom, servicoId: PACOTE.id, medida: { horas } },
    { ...contextoBom, servico: PACOTE },
  )
  if (d.acao !== 'confirmar') throw new Error('esperava verde')
  expect(d.avisoPreco).toBe(null)
})

test('a diária não compara preço consigo mesma', () => {
  const d = decidir(pedidoBom, contextoBom)
  if (d.acao !== 'confirmar') throw new Error('esperava verde')
  expect(d.avisoPreco).toBe(null)
})

// --- bloqueios --------------------------------------------------------------

test('bloqueio no horário pedido é amarela', () => {
  const bloqueios: Bloqueio[] = [
    { id: 'b1', inicio: utc('2026-11-19T12:00'), fim: utc('2026-11-19T14:00'), motivo: 'médico' },
  ]
  const d = decidir(pedidoBom, { ...contextoBom, bloqueios })
  expect(d.acao).toBe('oferecer')
  if (d.acao !== 'oferecer') return
  expect(d.motivo).toBe('horario_ocupado')
})

// --- pureza -----------------------------------------------------------------

test('a decisão é imutável', () => {
  const d = decidir(pedidoBom, contextoBom)
  expect(Object.isFrozen(d)).toBe(true)
})

test('decidir não altera o pedido nem o contexto', () => {
  const pedido = { ...pedidoBom }
  const contexto = { ...contextoComHorarioOcupado }
  const copiaPedido = JSON.stringify(pedido)
  const copiaContexto = JSON.stringify(contexto)
  decidir(pedido, contexto)
  expect(JSON.stringify(pedido)).toBe(copiaPedido)
  expect(JSON.stringify(contexto)).toBe(copiaContexto)
})
