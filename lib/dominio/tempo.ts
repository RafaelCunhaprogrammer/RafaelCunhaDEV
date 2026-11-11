import { FUSO } from './tipos'

/**
 * Conversão entre instantes absolutos (Date) e hora de parede no FUSO.
 *
 * Toda decisão de agenda compara hora do dia, e hora do dia só existe num fuso.
 * O runtime (container, Vercel) roda em UTC, então `getHours`/`setHours` mentem
 * por 3 horas. E um deslocamento fixo de -03:00, correto hoje, volta a estar
 * errado no dia em que o Brasil reativar o horário de verão. Por isso tudo aqui
 * passa pelo Intl com `timeZone: FUSO`, que lê a base de fusos do runtime.
 *
 * Módulo puro: nenhuma função lê o relógio.
 */

const formatador = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

export type PartesLocais = {
  ano: number
  mes: number // 1-12
  dia: number // 1-31
  hora: number // 0-23
  minuto: number
  segundo: number
}

/** Partes da hora de parede do instante, no FUSO. */
export function partesLocais(instante: Date): PartesLocais {
  const partes = formatador.formatToParts(instante)
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    Number(partes.find((p) => p.type === tipo)?.value)
  // en-CA com hour12: false pode emitir "24" para a meia-noite em alguns runtimes.
  const hora = valor('hour')
  return {
    ano: valor('year'),
    mes: valor('month'),
    dia: valor('day'),
    hora: hora === 24 ? 0 : hora,
    minuto: valor('minute'),
    segundo: valor('second'),
  }
}

/** Hora do dia (0-23) do instante, no FUSO. */
export function horaLocal(instante: Date): number {
  return partesLocais(instante).hora
}

/** Data de calendário local do instante, como 'YYYY-MM-DD' no FUSO. */
export function dataLocalISO(instante: Date): string {
  const p = partesLocais(instante)
  return `${String(p.ano).padStart(4, '0')}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
}

/** Dia da semana local do instante, no FUSO. 0 = domingo ... 6 = sábado. */
export function diaSemanaLocal(instante: Date): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  const p = partesLocais(instante)
  // Date.UTC com as partes locais dá um instante cujo dia da semana *em UTC*
  // é o dia da semana local — é só aritmética de calendário, não de fuso.
  return new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6
}

/** Deslocamento do FUSO no instante dado, em milissegundos (SP hoje: -3h). */
function deslocamentoFuso(instante: Date): number {
  const p = partesLocais(instante)
  const comoSeFosseUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo)
  // o formatador descarta os milissegundos; só o segundo redondo interessa aqui
  return comoSeFosseUtc - Math.floor(instante.getTime() / 1000) * 1000
}

/**
 * Inverso de `partesLocais`: instante absoluto de uma hora de parede no FUSO.
 *
 * "Formatar, parsear e subtrair o deslocamento de agora" erra perto de uma
 * mudança de deslocamento, porque o deslocamento usado é o do instante errado.
 * Então estima com o deslocamento no palpite, corrige com o deslocamento no
 * instante estimado e só aceita a correção se ela realmente bate a hora pedida
 * (numa hora inexistente, a do pulo para frente, a correção não bate e vale a
 * primeira estimativa, que cai logo depois do pulo).
 */
export function instanteDeParedeLocal(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
): Date {
  const paredeComoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto)
  const estimativa = new Date(paredeComoUtc - deslocamentoFuso(new Date(paredeComoUtc)))
  const corrigido = new Date(paredeComoUtc - deslocamentoFuso(estimativa))
  const p = partesLocais(corrigido)
  const bate =
    p.ano === ano && p.mes === mes && p.dia === dia && p.hora === hora && p.minuto === minuto
  return bate ? corrigido : estimativa
}

/** Valida e separa "HH:mm" em horas e minutos. */
function partesDeHoraMinuto(horaMinuto: string): { hora: number; minuto: number } | null {
  const encontrado = /^(\d{2}):(\d{2})$/.exec(horaMinuto)
  if (!encontrado) return null
  const hora = Number(encontrado[1])
  const minuto = Number(encontrado[2])
  if (hora > 23 || minuto > 59) return null
  return { hora, minuto }
}

/** Minutos desde a meia-noite de uma hora de parede "HH:mm". null se inválida. */
export function minutosDeHoraMinuto(horaMinuto: string): number | null {
  const p = partesDeHoraMinuto(horaMinuto)
  return p === null ? null : p.hora * 60 + p.minuto
}

/**
 * Instante absoluto da hora de parede `horaMinuto` ("HH:mm") na data local
 * `dataISO` ('YYYY-MM-DD'), no FUSO.
 */
export function instanteDeHoraLocal(dataISO: string, horaMinuto: string): Date {
  const data = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dataISO)
  const relogio = partesDeHoraMinuto(horaMinuto)
  if (!data || !relogio) throw new Error(`Data ou hora local inválida: ${dataISO} ${horaMinuto}`)
  return instanteDeParedeLocal(
    Number(data[1]),
    Number(data[2]),
    Number(data[3]),
    relogio.hora,
    relogio.minuto,
  )
}

/** Instante de `minutos` depois da meia-noite local da data `dataISO`, no FUSO. */
export function instanteDeMinutosLocais(dataISO: string, minutos: number): Date {
  const hora = Math.floor(minutos / 60)
  const minuto = minutos % 60
  return instanteDeHoraLocal(
    dataISO,
    `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`,
  )
}
