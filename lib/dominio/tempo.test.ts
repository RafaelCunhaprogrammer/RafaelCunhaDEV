import { FUSO } from './tipos'
import {
  dataLocalISO,
  diaSemanaLocal,
  horaLocal,
  horaMinutoLocal,
  instanteDeParedeEm,
  instanteDeParedeLocal,
  minutosDeHoraMinuto,
  partesEm,
} from './tempo'

/**
 * Estes testes existem por um motivo só: São Paulo não muda de deslocamento hoje,
 * então dentro do FUSO a conversão correta e um `-03:00` chumbado dão o mesmo
 * resultado em qualquer data de 2026 — e um teste que passa dos dois lados do bug
 * não prova nada. Aqui a zona é parâmetro, e as zonas abaixo mudam de
 * deslocamento: nos dois sentidos, em 1 hora, em 30 minutos e em 45 minutos.
 *
 * Se alguém trocar o núcleo de `tempo.ts` por um deslocamento fixo, é aqui que
 * fica vermelho.
 */

const QUARTO_DE_HORA = 15 * 60_000

/** Leitor de hora de parede independente de tempo.ts: o inverso é o que está sob teste. */
function paredeDeReferencia(zona: string, instante: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(instante)
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? ''
  const hora = valor('hour') === '24' ? '00' : valor('hour')
  return `${valor('year')}-${valor('month')}-${valor('day')} ${hora}:${valor('minute')}`
}

/** Deslocamento de referência, em minutos, para detectar a mudança na janela. */
function deslocamentoDeReferencia(zona: string, instante: Date): number {
  const [data, hora] = paredeDeReferencia(zona, instante).split(' ')
  const [ano, mes, dia] = data.split('-').map(Number)
  const [h, m] = hora.split(':').map(Number)
  return (Date.UTC(ano, mes - 1, dia, h, m) - Math.floor(instante.getTime() / 60_000) * 60_000) / 60_000
}

/**
 * Varre a janela de 15 em 15 minutos: para todo instante, a hora de parede lida
 * deve voltar à mesma hora de parede depois de passar pelo inverso. Falha também
 * se a janela não contiver mudança de deslocamento — uma janela sem transição
 * tornaria o teste decorativo.
 */
function roundTripNaJanela(zona: string, deISO: string, ateISO: string): void {
  const de = new Date(deISO).getTime()
  const ate = new Date(ateISO).getTime()
  const deslocamentos = new Set<number>()
  let conferidos = 0

  for (let t = de; t <= ate; t += QUARTO_DE_HORA) {
    const instante = new Date(t)
    const parede = paredeDeReferencia(zona, instante)
    deslocamentos.add(deslocamentoDeReferencia(zona, instante))

    const [data, hora] = parede.split(' ')
    const [ano, mes, dia] = data.split('-').map(Number)
    const [h, m] = hora.split(':').map(Number)
    const voltou = instanteDeParedeEm(zona, ano, mes, dia, h, m)

    expect(paredeDeReferencia(zona, voltou)).toBe(parede)
    conferidos++
  }

  expect(conferidos).toBeGreaterThan(100)
  expect(deslocamentos.size).toBeGreaterThan(1) // a janela precisa conter a transição
}

test('hora que não existe (pulo para frente) resolve logo depois do pulo', () => {
  // Nova York, 09/03/2025: o relógio vai de 01:59 para 03:00. 02:30 não existe.
  const resolvido = instanteDeParedeEm('America/New_York', 2025, 3, 9, 2, 30)

  expect(paredeDeReferencia('America/New_York', resolvido)).toBe('2025-03-09 03:30')
  expect(resolvido).toEqual(new Date('2025-03-09T07:30:00.000Z'))
})

test('a hora inexistente avança o tamanho da lacuna, não uma hora fixa', () => {
  // Lord Howe pula 30 minutos: 05/10/2025 vai de 02:00 para 02:30, e 02:15 não existe
  const resolvido = instanteDeParedeEm('Australia/Lord_Howe', 2025, 10, 5, 2, 15)
  expect(paredeDeReferencia('Australia/Lord_Howe', resolvido)).toBe('2025-10-05 02:45')

  // Chatham pula uma hora inteira no mesmo mês: 03:00 de 28/09/2025 não existe
  const chatham = instanteDeParedeEm('Pacific/Chatham', 2025, 9, 28, 3, 0)
  expect(paredeDeReferencia('Pacific/Chatham', chatham)).toBe('2025-09-28 04:00')
})

test('hora que acontece duas vezes (pulo para trás) resolve sempre na primeira', () => {
  // Nova York, 02/11/2025: 01:30 acontece em EDT (-04:00) e de novo em EST (-05:00).
  const resolvido = instanteDeParedeEm('America/New_York', 2025, 11, 2, 1, 30)

  expect(paredeDeReferencia('America/New_York', resolvido)).toBe('2025-11-02 01:30')
  // escolha fixada: a primeira ocorrência, ainda em EDT
  expect(resolvido).toEqual(new Date('2025-11-02T05:30:00.000Z'))
  expect(resolvido).not.toEqual(new Date('2025-11-02T06:30:00.000Z'))
})

test('round trip atravessa a transição de 1 hora (Nova York, nos dois sentidos)', () => {
  roundTripNaJanela('America/New_York', '2025-03-08T00:00:00Z', '2025-03-10T00:00:00Z')
  roundTripNaJanela('America/New_York', '2025-11-01T00:00:00Z', '2025-11-03T00:00:00Z')
})

test('round trip atravessa a transição de 30 minutos (Lord Howe)', () => {
  // Lord Howe muda +11:00 <-> +10:30: meia hora, e o deslocamento não é inteiro.
  roundTripNaJanela('Australia/Lord_Howe', '2025-04-05T00:00:00Z', '2025-04-07T00:00:00Z')
  roundTripNaJanela('Australia/Lord_Howe', '2025-10-04T00:00:00Z', '2025-10-06T00:00:00Z')
})

test('round trip atravessa a transição de 45 minutos (Chatham)', () => {
  // Chatham muda +13:45 <-> +12:45: deslocamento em quartos de hora.
  roundTripNaJanela('Pacific/Chatham', '2025-04-05T00:00:00Z', '2025-04-07T00:00:00Z')
  roundTripNaJanela('Pacific/Chatham', '2025-09-27T00:00:00Z', '2025-09-29T00:00:00Z')
})

test('no FUSO do domínio o round trip fecha em datas espalhadas pelo ano', () => {
  const datas: Array<[number, number, number]> = [
    [2026, 1, 15],
    [2026, 2, 18],
    [2026, 7, 1],
    [2026, 10, 21],
    [2026, 11, 12],
  ]
  for (const [ano, mes, dia] of datas) {
    for (const [hora, minuto] of [
      [0, 0],
      [8, 0],
      [12, 30],
      [18, 0],
      [23, 30],
    ]) {
      const instante = instanteDeParedeLocal(ano, mes, dia, hora, minuto)
      const esperado = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')} ${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`
      expect(paredeDeReferencia(FUSO, instante)).toBe(esperado)
      expect(partesEm(FUSO, instante)).toMatchObject({ ano, mes, dia, hora, minuto })
    }
  }
})

test('08:00 em São Paulo é 11:00 UTC, não 08:00 UTC', () => {
  expect(instanteDeParedeLocal(2026, 11, 12, 8, 0)).toEqual(new Date('2026-11-12T11:00:00.000Z'))
})

// --- leitores amarrados ao FUSO ---------------------------------------------

test('hora, hora:minuto, data e dia da semana são lidos no FUSO, não em UTC', () => {
  // 02:00 UTC de sexta = 23:00 de quinta em São Paulo
  const instante = new Date('2026-11-13T02:00:00.000Z')

  expect(horaLocal(instante)).toBe(23)
  expect(horaMinutoLocal(instante)).toBe('23:00')
  expect(dataLocalISO(instante)).toBe('2026-11-12')
  expect(diaSemanaLocal(instante)).toBe(4) // quinta, não sexta
})

test('horaMinutoLocal preenche com zero à esquerda', () => {
  expect(horaMinutoLocal(new Date('2026-11-12T11:05:00.000Z'))).toBe('08:05')
  expect(horaMinutoLocal(new Date('2026-11-12T03:00:00.000Z'))).toBe('00:00')
})

test('hora de parede armazenada só vale no formato HH:mm de 00:00 a 23:59', () => {
  expect(minutosDeHoraMinuto('08:00')).toBe(480)
  expect(minutosDeHoraMinuto('00:00')).toBe(0)
  expect(minutosDeHoraMinuto('23:59')).toBe(1439)
  // formas recusadas: a faixa que as usar simplesmente não gera bloco
  expect(minutosDeHoraMinuto('8:00')).toBeNull()
  expect(minutosDeHoraMinuto('24:00')).toBeNull()
  expect(minutosDeHoraMinuto('08:60')).toBeNull()
  expect(minutosDeHoraMinuto('08:00:00')).toBeNull()
  expect(minutosDeHoraMinuto('')).toBeNull()
})
