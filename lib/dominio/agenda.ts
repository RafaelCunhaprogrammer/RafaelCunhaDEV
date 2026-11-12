import type { Bloqueio, Disponibilidade, Intervalo } from './tipos'
import { dataLocalISO, diaSemanaLocal, instanteDeMinutosLocais, minutosDeHoraMinuto } from './tempo'

/** Intervalo com endereço: o endereço decide se há deslocamento entre dois serviços. */
export type IntervaloComEndereco = Intervalo & { endereco: string }

const MIN = 60_000
const PASSO_MIN = 30

/**
 * Endereços são comparados sem diferenciar maiúsculas nem espaços nas pontas —
 * o mesmo apartamento digitado duas vezes não deve exigir deslocamento.
 */
function mesmoEndereco(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Sobreposição de dois intervalos, com `bufferMs` somado às duas bordas.
 * Bordas exclusivas: encostar (fim de um igual ao início do outro) não sobrepõe.
 */
function sobrepoe(a: Intervalo, b: Intervalo, bufferMs: number): boolean {
  return (
    a.inicio.getTime() < b.fim.getTime() + bufferMs &&
    b.inicio.getTime() < a.fim.getTime() + bufferMs
  )
}

/**
 * Conflito do candidato com os confirmados. `endereco` null significa endereço
 * ainda desconhecido: aí o deslocamento é sempre exigido, que é o lado seguro.
 */
function conflitaComEndereco(
  candidato: Intervalo,
  endereco: string | null,
  confirmados: IntervaloComEndereco[],
  deslocamentoMin: number,
): boolean {
  const deslocamentoMs = Math.max(0, deslocamentoMin) * MIN
  return confirmados.some((confirmado) => {
    const bufferMs =
      endereco !== null && mesmoEndereco(confirmado.endereco, endereco) ? 0 : deslocamentoMs
    return sobrepoe(candidato, confirmado, bufferMs)
  })
}

/**
 * Regra 5.1: o candidato conflita com algum confirmado se os intervalos se
 * sobrepõem — somando o deslocamento às duas bordas quando os endereços
 * diferem, porque ela precisa atravessar a cidade entre um serviço e o outro.
 * No mesmo endereço o deslocamento é zero.
 */
export function conflita(
  candidato: IntervaloComEndereco,
  confirmados: IntervaloComEndereco[],
  deslocamentoMin: number,
): boolean {
  return conflitaComEndereco(candidato, candidato.endereco, confirmados, deslocamentoMin)
}

/**
 * Regra 5.2: horários livres do dia, em blocos de `duracaoMin`.
 *
 * Os candidatos nascem dentro de cada faixa de disponibilidade do dia, de 30 em
 * 30 minutos de hora de parede no FUSO, e são descartados quando passam do fim
 * da faixa, caem em bloqueio, conflitam com um confirmado ou violam a
 * antecedência mínima em relação a `agora`. Devolve em ordem cronológica, sem
 * repetir instante de início: faixas sobrepostas no mesmo dia são dado
 * inconsistente, mas nove telas mostram esta lista ao cliente e um "08:00"
 * duplicado é defeito visível. A validação de sobreposição é da tela de
 * cadastro; a exibição não depende dela.
 *
 * Dia sem faixa cadastrada devolve lista vazia — ausência de expediente não é erro.
 *
 * `endereco` é opcional porque quem pede pode ainda estar escolhendo o horário.
 * Omitido, o endereço do candidato é tratado como desconhecido e o deslocamento é
 * sempre exigido contra os confirmados: errar para o lado de oferecer menos é o
 * lado seguro, porque o outro lado é chegar numa casa onde ela já está marcada em
 * outra. Informado, o deslocamento não é cobrado contra um agendamento no mesmo
 * endereço — dois serviços no mesmo prédio não exigem atravessar a cidade.
 */
export function horariosLivres(params: {
  dia: Date
  duracaoMin: number
  disponibilidade: Disponibilidade[]
  bloqueios: Bloqueio[]
  confirmados: IntervaloComEndereco[]
  deslocamentoMin: number
  antecedenciaMinHoras: number
  agora: Date
  endereco?: string
}): Intervalo[] {
  const {
    dia,
    duracaoMin,
    disponibilidade,
    bloqueios,
    confirmados,
    deslocamentoMin,
    antecedenciaMinHoras,
    agora,
    endereco,
  } = params

  if (!Number.isFinite(duracaoMin) || duracaoMin <= 0) return []

  const dataISO = dataLocalISO(dia)
  const diaSemana = diaSemanaLocal(dia)
  const duracaoMs = duracaoMin * MIN
  const primeiroInicioPermitido = agora.getTime() + Math.max(0, antecedenciaMinHoras) * 60 * MIN

  const livres: Intervalo[] = []

  for (const faixa of disponibilidade) {
    if (faixa.diaSemana !== diaSemana) continue

    const minutoInicio = minutosDeHoraMinuto(faixa.horaInicio)
    const minutoFim = minutosDeHoraMinuto(faixa.horaFim)
    if (minutoInicio === null || minutoFim === null || minutoFim <= minutoInicio) continue
    const fimDaFaixa = instanteDeMinutosLocais(dataISO, minutoFim)

    for (let minuto = minutoInicio; minuto + duracaoMin <= minutoFim; minuto += PASSO_MIN) {
      const inicio = instanteDeMinutosLocais(dataISO, minuto)
      const bloco: Intervalo = { inicio, fim: new Date(inicio.getTime() + duracaoMs) }

      // a borda em minutos de parede já garante o fim da faixa; a comparação de
      // instantes garante também em tempo real, mesmo se o fuso mudar no meio do dia
      if (bloco.fim.getTime() > fimDaFaixa.getTime()) continue
      if (bloco.inicio.getTime() < primeiroInicioPermitido) continue
      if (bloqueios.some((bloqueio) => sobrepoe(bloco, bloqueio, 0))) continue
      if (conflitaComEndereco(bloco, endereco ?? null, confirmados, deslocamentoMin)) continue

      livres.push(bloco)
    }
  }

  const porInicio = new Map<number, Intervalo>()
  for (const bloco of livres) porInicio.set(bloco.inicio.getTime(), bloco)
  return [...porInicio.values()].sort((a, b) => a.inicio.getTime() - b.inicio.getTime())
}
