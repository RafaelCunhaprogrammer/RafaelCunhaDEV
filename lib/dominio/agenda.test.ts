import { FUSO, type Bloqueio, type Disponibilidade, type Intervalo } from './tipos'
import { conflita, horariosLivres } from './agenda'

// ---------------------------------------------------------------------------
// Auxiliares dos testes. Propositalmente independentes de lib/dominio/tempo.ts:
// os instantes são escritos em UTC explícito e a hora local é lida direto do
// Intl, para que um erro no helper não possa esconder um erro na agenda.
// ---------------------------------------------------------------------------

const leitorLocal = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Minutos desde a meia-noite locais, no fuso de São Paulo. */
function minutoDoDiaLocal(instante: Date): number {
  const [hora, minuto] = leitorLocal.format(instante).split(':').map(Number)
  return hora * 60 + minuto
}

/** Hora e minuto locais no formato "HH:mm", no fuso de São Paulo. */
function horaMinutoLocal(instante: Date): string {
  return leitorLocal.format(instante)
}

/** Instante UTC a partir de "YYYY-MM-DDTHH:mm". Sem ambiguidade de fuso. */
const utc = (texto: string) => new Date(`${texto}:00.000Z`)

const quinta: Disponibilidade[] = [
  { id: 'disp-qui', diaSemana: 4, horaInicio: '08:00', horaFim: '18:00' },
]

// Quinta-feira, 12/11/2026. Ao meio-dia em São Paulo (15:00 UTC) não há
// qualquer dúvida sobre qual é a data local.
const diaQuinta = utc('2026-11-12T15:00')

function intervalo(inicio: string, fim: string, endereco: string): Intervalo & { endereco: string } {
  return { inicio: utc(inicio), fim: utc(fim), endereco }
}

const ENDERECO_A = 'Rua das Flores, 100 - Centro'
const ENDERECO_B = 'Av. Beira-Mar, 2000 - Agronômica'

// --- conflita ---------------------------------------------------------------

test('dois agendamentos no mesmo horário conflitam', () => {
  const confirmado = intervalo('2026-11-12T13:00', '2026-11-12T16:00', ENDERECO_A)
  const candidato = intervalo('2026-11-12T14:00', '2026-11-12T17:00', ENDERECO_A)
  expect(conflita(candidato, [confirmado], 0)).toBe(true)
})

test('horário totalmente livre não conflita', () => {
  const confirmado = intervalo('2026-11-12T13:00', '2026-11-12T16:00', ENDERECO_A)
  const candidato = intervalo('2026-11-12T19:00', '2026-11-12T21:00', ENDERECO_B)
  expect(conflita(candidato, [confirmado], 30)).toBe(false)
})

test('endereços diferentes exigem o deslocamento entre eles', () => {
  // termina 12:00 locais no endereço A; candidato 12:15 no endereço B, deslocamento 30 min
  const confirmadoA = intervalo('2026-11-12T12:00', '2026-11-12T15:00', ENDERECO_A)
  const candidatoB = intervalo('2026-11-12T15:15', '2026-11-12T17:15', ENDERECO_B)
  expect(conflita(candidatoB, [confirmadoA], 30)).toBe(true)
})

test('mesmo endereço não exige deslocamento', () => {
  const confirmadoA = intervalo('2026-11-12T12:00', '2026-11-12T15:00', ENDERECO_A)
  const candidatoA = intervalo('2026-11-12T15:15', '2026-11-12T17:15', ENDERECO_A)
  expect(conflita(candidatoA, [confirmadoA], 30)).toBe(false)
})

test('encostar sem sobrepor não conflita', () => {
  const confirmadoA = intervalo('2026-11-12T12:00', '2026-11-12T15:00', ENDERECO_A)
  const candidatoA = intervalo('2026-11-12T15:00', '2026-11-12T17:00', ENDERECO_A)
  expect(conflita(candidatoA, [confirmadoA], 0)).toBe(false)
})

test('deslocamento também vale antes do confirmado', () => {
  // candidato termina 15 min antes de começar um serviço em outro endereço
  const confirmadoB = intervalo('2026-11-12T15:00', '2026-11-12T17:00', ENDERECO_B)
  const candidatoA = intervalo('2026-11-12T13:00', '2026-11-12T14:45', ENDERECO_A)
  expect(conflita(candidatoA, [confirmadoB], 30)).toBe(true)
})

test('sem agendamentos confirmados nada conflita', () => {
  const candidato = intervalo('2026-11-12T13:00', '2026-11-12T16:00', ENDERECO_A)
  expect(conflita(candidato, [], 30)).toBe(false)
})

// --- horariosLivres ---------------------------------------------------------

const base = {
  dia: diaQuinta,
  duracaoMin: 120,
  disponibilidade: quinta,
  bloqueios: [] as Bloqueio[],
  confirmados: [] as Array<Intervalo & { endereco: string }>,
  deslocamentoMin: 30,
  antecedenciaMinHoras: 0,
  agora: utc('2026-11-11T12:00'),
}

// Review Focus 1 — fuso horário
test('o expediente é interpretado no fuso de São Paulo, não em UTC', () => {
  // disponibilidade 08:00-18:00; "agora" às 23:00 UTC = 20:00 em SP
  // o dia seguinte deve abrir às 08:00 locais, e nenhum bloco deve começar às 05:00
  const livres = horariosLivres({ ...base, agora: utc('2026-11-11T23:00') })

  expect(livres.length).toBeGreaterThan(0)
  // em minutos, não em horas: com granularidade de hora um bloco terminando
  // 18:45 passaria pela asserção
  expect(
    livres.every(
      (b) => minutoDoDiaLocal(b.inicio) >= 8 * 60 && minutoDoDiaLocal(b.fim) <= 18 * 60,
    ),
  ).toBe(true)
  expect(horaMinutoLocal(livres[0].inicio)).toBe('08:00')
  // o primeiro bloco é 08:00 em São Paulo, ou seja 11:00 UTC
  expect(livres[0].inicio).toEqual(utc('2026-11-12T11:00'))
})

test('o dia é resolvido pela data local, não pela data UTC', () => {
  // 02:00 UTC de sexta ainda é quinta 23:00 em São Paulo: vale o expediente de quinta
  const livres = horariosLivres({ ...base, dia: utc('2026-11-13T02:00') })

  expect(livres.length).toBeGreaterThan(0)
  expect(livres[0].inicio).toEqual(utc('2026-11-12T11:00'))
})

test('os blocos saem em ordem cronológica', () => {
  const livres = horariosLivres({
    ...base,
    duracaoMin: 60,
    disponibilidade: [
      { id: 'tarde', diaSemana: 4, horaInicio: '14:00', horaFim: '18:00' },
      { id: 'manha', diaSemana: 4, horaInicio: '08:00', horaFim: '12:00' },
    ],
  })

  expect(livres.length).toBeGreaterThan(1)
  const instantes = livres.map((b) => b.inicio.getTime())
  expect(instantes).toEqual([...instantes].sort((a, b) => a - b))
  expect(horaMinutoLocal(livres[0].inicio)).toBe('08:00')
})

test('os blocos avançam de 30 em 30 minutos', () => {
  const livres = horariosLivres({ ...base, duracaoMin: 120 })
  expect(livres.slice(0, 4).map((b) => horaMinutoLocal(b.inicio))).toEqual([
    '08:00',
    '08:30',
    '09:00',
    '09:30',
  ])
})

// Review Focus 3 — serviço que não cabe até o fim do expediente
test('bloco que não termina dentro do expediente não é oferecido', () => {
  // expediente até 18:00, serviço de 240 min: o último bloco começa 14:00
  const livres = horariosLivres({ ...base, duracaoMin: 240 })

  const ultimo = livres[livres.length - 1]
  expect(horaMinutoLocal(ultimo.inicio)).toBe('14:00')
  expect(ultimo.inicio).toEqual(utc('2026-11-12T17:00'))
  expect(ultimo.fim).toEqual(utc('2026-11-12T21:00')) // 18:00 locais
  expect(livres.every((b) => b.fim.getTime() <= utc('2026-11-12T21:00').getTime())).toBe(true)
})

test('serviço mais longo que o expediente não tem horário livre', () => {
  expect(horariosLivres({ ...base, duracaoMin: 11 * 60 })).toEqual([])
})

test('bloqueio remove o horário', () => {
  const bloqueios: Bloqueio[] = [
    {
      id: 'blq-1',
      inicio: utc('2026-11-12T13:00'), // 10:00 locais
      fim: utc('2026-11-12T15:00'), // 12:00 locais
      motivo: 'Consulta médica',
    },
  ]
  const livres = horariosLivres({ ...base, duracaoMin: 60, bloqueios })

  const inicios = livres.map((b) => horaMinutoLocal(b.inicio))
  expect(inicios).toContain('09:00')
  expect(inicios).not.toContain('09:30') // terminaria 10:30, dentro do bloqueio
  expect(inicios).not.toContain('11:30')
  expect(inicios).toContain('12:00') // encosta no fim do bloqueio, sem sobrepor
  expect(
    livres.every(
      (b) =>
        b.fim.getTime() <= bloqueios[0].inicio.getTime() ||
        b.inicio.getTime() >= bloqueios[0].fim.getTime(),
    ),
  ).toBe(true)
})

test('agendamento confirmado remove o horário, com o deslocamento', () => {
  const confirmados = [intervalo('2026-11-12T13:00', '2026-11-12T15:00', ENDERECO_A)]
  const livres = horariosLivres({ ...base, duracaoMin: 60, confirmados })

  const inicios = livres.map((b) => horaMinutoLocal(b.inicio))
  // o confirmado ocupa 10:00-12:00 locais; o endereço do candidato é
  // desconhecido, então o deslocamento de 30 min vale dos dois lados
  expect(inicios).toContain('08:00') // termina 09:00, 30 min antes das 10:00
  expect(inicios).not.toContain('09:00') // terminaria 10:00, sem deslocamento antes
  expect(inicios).not.toContain('10:30') // dentro do confirmado
  expect(inicios).not.toContain('12:00') // sem os 30 min de deslocamento depois dele
  expect(inicios).toContain('12:30')
})

test('endereço informado não cobra deslocamento contra o mesmo endereço', () => {
  const confirmados = [intervalo('2026-11-12T13:00', '2026-11-12T15:00', ENDERECO_A)]
  const livres = horariosLivres({ ...base, duracaoMin: 60, confirmados, endereco: ENDERECO_A })

  const inicios = livres.map((b) => horaMinutoLocal(b.inicio))
  // o confirmado ocupa 10:00-12:00 locais, no mesmo endereço: encostar nele vale
  expect(inicios).toContain('09:00')
  expect(inicios).toContain('12:00')
  expect(inicios).not.toContain('10:30') // dentro do confirmado, mesmo endereço ou não
})

test('endereço informado diferente do confirmado mantém o deslocamento', () => {
  const confirmados = [intervalo('2026-11-12T13:00', '2026-11-12T15:00', ENDERECO_A)]
  const livres = horariosLivres({ ...base, duracaoMin: 60, confirmados, endereco: ENDERECO_B })

  const inicios = livres.map((b) => horaMinutoLocal(b.inicio))
  expect(inicios).not.toContain('09:00')
  expect(inicios).not.toContain('12:00')
  expect(inicios).toContain('12:30')
})

test('sem endereço o comportamento é o de antes: deslocamento sempre exigido', () => {
  const confirmados = [intervalo('2026-11-12T13:00', '2026-11-12T15:00', ENDERECO_A)]
  const comEndereco = horariosLivres({
    ...base,
    duracaoMin: 60,
    confirmados,
    endereco: ENDERECO_B,
  })
  const semEndereco = horariosLivres({ ...base, duracaoMin: 60, confirmados })
  expect(semEndereco).toEqual(comEndereco)
})

test('antecedência mínima remove os blocos próximos demais', () => {
  // agora 11:00 locais de quarta; com 24h de antecedência, o primeiro bloco
  // possível na quinta é 11:00 locais
  const livres = horariosLivres({
    ...base,
    duracaoMin: 60,
    antecedenciaMinHoras: 24,
    agora: utc('2026-11-11T14:00'),
  })

  const inicios = livres.map((b) => horaMinutoLocal(b.inicio))
  expect(inicios).not.toContain('08:00')
  expect(inicios).not.toContain('10:30')
  expect(inicios[0]).toBe('11:00')
})

test('dia sem disponibilidade cadastrada não tem horário livre', () => {
  // domingo, 15/11/2026: não há faixa cadastrada para diaSemana 0
  expect(horariosLivres({ ...base, dia: utc('2026-11-15T15:00') })).toEqual([])
})

test('disponibilidade de outro dia da semana não vale para este dia', () => {
  const soSabado: Disponibilidade[] = [
    { id: 'disp-sab', diaSemana: 6, horaInicio: '08:00', horaFim: '18:00' },
  ]
  expect(horariosLivres({ ...base, disponibilidade: soSabado })).toEqual([])
})

test('faixas sobrepostas não repetem o mesmo horário', () => {
  const livres = horariosLivres({
    ...base,
    duracaoMin: 60,
    disponibilidade: [
      { id: 'manha', diaSemana: 4, horaInicio: '08:00', horaFim: '12:00' },
      { id: 'quase-igual', diaSemana: 4, horaInicio: '10:00', horaFim: '14:00' },
    ],
  })

  const inicios = livres.map((b) => horaMinutoLocal(b.inicio))
  expect(new Set(inicios).size).toBe(inicios.length)
  expect(inicios.filter((h) => h === '10:00')).toHaveLength(1)
  expect(inicios[0]).toBe('08:00')
  expect(inicios[inicios.length - 1]).toBe('13:00')
})

test('faixa que começa fora da grade de 30 minutos sai a partir do próprio início', () => {
  // o passo de 30 min é relativo ao início da faixa, não à hora cheia
  const livres = horariosLivres({
    ...base,
    duracaoMin: 60,
    disponibilidade: [{ id: 'quebrada', diaSemana: 4, horaInicio: '08:15', horaFim: '11:00' }],
  })

  expect(livres.map((b) => horaMinutoLocal(b.inicio))).toEqual([
    '08:15',
    '08:45',
    '09:15',
    '09:45',
  ])
})
