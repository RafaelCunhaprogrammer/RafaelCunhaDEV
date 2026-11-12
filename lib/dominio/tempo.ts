import { FUSO } from './tipos'

/**
 * Conversão entre instantes absolutos (Date) e hora de parede num fuso.
 *
 * Toda decisão de agenda compara hora do dia, e hora do dia só existe num fuso.
 * O runtime (container, Vercel) roda em UTC, então `getHours`/`setHours` mentem
 * por 3 horas. E um deslocamento fixo de -03:00, correto hoje, volta a estar
 * errado no dia em que o Brasil reativar o horário de verão. Por isso tudo aqui
 * passa pelo Intl, que lê a base de fusos do runtime.
 *
 * O núcleo (`partesEm`, `instanteDeParedeEm`) recebe a zona por parâmetro, e as
 * funções exportadas para o domínio são ele amarrado ao FUSO. Isso não é
 * generalidade de enfeite: São Paulo não tem mudança de deslocamento hoje, então
 * dentro do FUSO o algoritmo abaixo é indistinguível de um `-03:00` chumbado. É a
 * zona parametrizada que permite provar a diferença, em lib/dominio/tempo.test.ts,
 * contra fusos que mudam de deslocamento.
 *
 * Módulo puro: nenhuma função lê o relógio.
 */

export type PartesLocais = {
  ano: number
  mes: number // 1-12
  dia: number // 1-31
  hora: number // 0-23
  minuto: number
  segundo: number
}

const formatadores = new Map<string, Intl.DateTimeFormat>()

/** Formatador por zona, memoizado: construir um Intl.DateTimeFormat é caro. */
function formatadorDe(zona: string): Intl.DateTimeFormat {
  const existente = formatadores.get(zona)
  if (existente) return existente
  const novo = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  formatadores.set(zona, novo)
  return novo
}

/** Partes da hora de parede do instante, na `zona`. */
export function partesEm(zona: string, instante: Date): PartesLocais {
  const partes = formatadorDe(zona).formatToParts(instante)
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

/** Deslocamento da `zona` no instante dado, em milissegundos (SP hoje: -3h). */
function deslocamentoEm(zona: string, instante: Date): number {
  const p = partesEm(zona, instante)
  const comoSeFosseUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo)
  // o formatador descarta os milissegundos; só o segundo redondo interessa aqui
  return comoSeFosseUtc - Math.floor(instante.getTime() / 1000) * 1000
}

/**
 * Inverso de `partesEm`: instante absoluto de uma hora de parede na `zona`.
 *
 * "Formatar, parsear e subtrair o deslocamento de agora" erra perto de uma
 * mudança de deslocamento, porque usa o deslocamento do instante errado. Aqui:
 * estima com o deslocamento do palpite, corrige com o deslocamento do instante
 * estimado, e só devolve quando a volta reproduz exatamente a hora pedida.
 *
 * Nenhuma passada reproduzir a hora pedida significa que ela não existe na zona:
 * é a hora engolida pelo pulo para frente. Nesse caso devolve o instante logo
 * depois do pulo (02:30 inexistente -> 03:30), que é a resolução convencional, e
 * confere até isso — se nem ela se sustentar, lança. Para a função que decide a
 * que hora ela é agendada, errar alto é melhor que errar calado.
 */
export function instanteDeParedeEm(
  zona: string,
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
): Date {
  const paredeComoUtc = Date.UTC(ano, mes - 1, dia, hora, minuto)
  const reproduzAHoraPedida = (instante: Date) => {
    const p = partesEm(zona, instante)
    return p.ano === ano && p.mes === mes && p.dia === dia && p.hora === hora && p.minuto === minuto
  }

  // Palpite inicial: a parede lida como se fosse UTC. Dali em diante cada passada
  // usa o deslocamento do instante que a passada anterior estimou.
  let candidato = new Date(paredeComoUtc - deslocamentoEm(zona, new Date(paredeComoUtc)))
  const deslocamentosVizinhos: number[] = []
  for (let passada = 0; passada < 3; passada++) {
    if (reproduzAHoraPedida(candidato)) return candidato
    const deslocamento = deslocamentoEm(zona, candidato)
    deslocamentosVizinhos.push(deslocamento)
    candidato = new Date(paredeComoUtc - deslocamento)
  }
  if (reproduzAHoraPedida(candidato)) return candidato

  // Hora inexistente: o pulo para frente. O menor deslocamento visto é o de antes
  // da mudança, e usá-lo cai depois do pulo — exatamente a hora que o relógio
  // mostra no lugar da pedida.
  const depoisDoPulo = new Date(paredeComoUtc - Math.min(...deslocamentosVizinhos))
  const p = partesEm(zona, depoisDoPulo)
  const paredeObtida = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto)
  if (paredeObtida <= paredeComoUtc) {
    throw new Error(
      `Hora de parede irresolvível em ${zona}: ${ano}-${mes}-${dia} ${hora}:${minuto}`,
    )
  }
  return depoisDoPulo
}

// --- o mesmo núcleo, amarrado ao FUSO do domínio -----------------------------

/** Partes da hora de parede do instante, no FUSO. */
export function partesLocais(instante: Date): PartesLocais {
  return partesEm(FUSO, instante)
}

/** Hora do dia (0-23) do instante, no FUSO. */
export function horaLocal(instante: Date): number {
  return partesLocais(instante).hora
}

/** Hora de parede do instante como "HH:mm", no FUSO. Para exibir e para comparar. */
export function horaMinutoLocal(instante: Date): string {
  const p = partesLocais(instante)
  return `${String(p.hora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}`
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

/** Inverso de `partesLocais`: instante absoluto de uma hora de parede no FUSO. */
export function instanteDeParedeLocal(
  ano: number,
  mes: number,
  dia: number,
  hora: number,
  minuto: number,
): Date {
  return instanteDeParedeEm(FUSO, ano, mes, dia, hora, minuto)
}

// --- hora de parede armazenada como texto ------------------------------------

/**
 * Contrato da hora de parede guardada em `Disponibilidade.horaInicio` /
 * `horaFim` (e de qualquer "HH:mm" que o domínio armazene):
 *
 * - aceita exatamente `HH:mm`, com dois dígitos em cada campo, 00:00 até 23:59;
 * - **não** aceita `8:00`, `08:00:00`, `24:00` nem sufixo de fuso;
 * - a faixa é interpretada no FUSO, no dia de calendário local, e precisa ter
 *   `horaFim` depois de `horaInicio`.
 *
 * Qualquer forma fora disso — inclusive um expediente que fecharia à meia-noite,
 * que `24:00` expressaria e que esta forma não comporta, e um expediente que
 * viraria o dia — faz a faixa **não gerar bloco nenhum**, em silêncio e de
 * propósito: `horariosLivres` é consultado pelo agente a cada pedido e não tem
 * para quem levantar exceção. Dia sem horário é uma resposta legítima; agendar
 * fora do expediente não é. Quem for permitir expediente noturno vai precisar
 * mudar a forma armazenada (duas faixas, ou data de fim explícita), não esta
 * validação.
 */
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
 * `dataISO` ('YYYY-MM-DD'), no FUSO. Lança se qualquer uma das duas estiver
 * malformada — aqui o chamador já validou a faixa, então texto inválido é bug.
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
