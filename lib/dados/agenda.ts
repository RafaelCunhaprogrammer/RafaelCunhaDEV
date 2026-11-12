import type {
  Agendamento,
  Bloqueio,
  Disponibilidade,
  Intervalo,
  StatusAgendamento,
} from '../dominio/tipos'
import { codigoErro, consultar } from './db'

/** Outro pedido ativo já ocupa exatamente esse início (regra 5.7). */
export class HorarioOcupado extends Error {
  constructor() {
    super('Já existe um agendamento ativo nesse horário.')
    this.name = 'HorarioOcupado'
  }
}

/** A janela cruza outra janela do mesmo dia da semana. */
export class JanelaSobreposta extends Error {
  constructor() {
    super('Essa janela de disponibilidade se sobrepõe a outra do mesmo dia.')
    this.name = 'JanelaSobreposta'
  }
}

type LinhaAgendamento = {
  id: string
  servico_id: string
  cliente_id: string
  cliente_novo: boolean
  bairro: string
  endereco: string
  inicio: Date
  fim: Date
  status: StatusAgendamento
  faixa: Agendamento['faixa']
  valor_centavos: number
  observacoes: string
  criado_em: Date
}

export const COLUNAS_AGENDAMENTO = `id, servico_id, cliente_id, cliente_novo, bairro,
  endereco, inicio, fim, status, faixa, valor_centavos, observacoes, criado_em`

export const paraAgendamento = (l: LinhaAgendamento): Agendamento => ({
  id: l.id,
  servicoId: l.servico_id,
  clienteId: l.cliente_id,
  clienteNovo: l.cliente_novo,
  bairro: l.bairro,
  endereco: l.endereco,
  inicio: l.inicio,
  fim: l.fim,
  status: l.status,
  faixa: l.faixa,
  valorCentavos: l.valor_centavos,
  observacoes: l.observacoes,
  criadoEm: l.criado_em,
})

async function noIntervalo(
  intervalo: Intervalo,
  status: StatusAgendamento[],
): Promise<Agendamento[]> {
  const linhas = await consultar<LinhaAgendamento>(
    `select ${COLUNAS_AGENDAMENTO} from agendamentos
     where status = any($1) and inicio < $3 and fim > $2
     order by inicio`,
    [status, intervalo.inicio, intervalo.fim],
  )
  return linhas.map(paraAgendamento)
}

/** Agendamentos confirmados que tocam o intervalo. */
export const confirmados = (intervalo: Intervalo) => noIntervalo(intervalo, ['confirmado'])

/** Confirmados e aguardando ela: ambos seguram o horário (seção 4 da especificação). */
export const ocupados = (intervalo: Intervalo) =>
  noIntervalo(intervalo, ['confirmado', 'aguardando_ela'])

/** Agendamentos concluídos que começaram antes de `fim` (insumo do fechamento). */
export async function concluidosAte(fim: Date): Promise<Agendamento[]> {
  const linhas = await consultar<LinhaAgendamento>(
    `select ${COLUNAS_AGENDAMENTO} from agendamentos
     where status = 'concluido' and inicio < $1 order by inicio`,
    [fim],
  )
  return linhas.map(paraAgendamento)
}

/**
 * Insere o agendamento. Se outro ativo já tem o mesmo início, o índice único
 * recusa e a função lança `HorarioOcupado`, para o agente oferecer outro horário.
 */
export async function criarAgendamento(
  novo: Omit<Agendamento, 'id' | 'criadoEm'>,
): Promise<Agendamento> {
  try {
    const linhas = await consultar<LinhaAgendamento>(
      `insert into agendamentos (servico_id, cliente_id, cliente_novo, bairro, endereco,
         inicio, fim, status, faixa, valor_centavos, observacoes)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       returning ${COLUNAS_AGENDAMENTO}`,
      [
        novo.servicoId,
        novo.clienteId,
        novo.clienteNovo,
        novo.bairro,
        novo.endereco,
        novo.inicio,
        novo.fim,
        novo.status,
        novo.faixa,
        novo.valorCentavos,
        novo.observacoes,
      ],
    )
    return paraAgendamento(linhas[0])
  } catch (erro) {
    if (codigoErro(erro).restricao === 'agendamento_horario_unico') throw new HorarioOcupado()
    throw erro
  }
}

/** Troca o status. Reativar um agendamento num horário já tomado lança `HorarioOcupado`. */
export async function mudarStatus(id: string, status: StatusAgendamento): Promise<Agendamento> {
  try {
    const linhas = await consultar<LinhaAgendamento>(
      `update agendamentos set status = $2 where id = $1 returning ${COLUNAS_AGENDAMENTO}`,
      [id, status],
    )
    if (!linhas[0]) throw new Error(`Agendamento ${id} não existe.`)
    return paraAgendamento(linhas[0])
  } catch (erro) {
    if (codigoErro(erro).restricao === 'agendamento_horario_unico') throw new HorarioOcupado()
    throw erro
  }
}

type LinhaDisponibilidade = {
  id: string
  dia_semana: Disponibilidade['diaSemana']
  hora_inicio: string
  hora_fim: string
}

const COLUNAS_DISPONIBILIDADE = `id, dia_semana,
  to_char(hora_inicio, 'HH24:MI') as hora_inicio, to_char(hora_fim, 'HH24:MI') as hora_fim`

const paraDisponibilidade = (l: LinhaDisponibilidade): Disponibilidade => ({
  id: l.id,
  diaSemana: l.dia_semana,
  horaInicio: l.hora_inicio,
  horaFim: l.hora_fim,
})

export async function listarDisponibilidade(): Promise<Disponibilidade[]> {
  const linhas = await consultar<LinhaDisponibilidade>(
    `select ${COLUNAS_DISPONIBILIDADE} from disponibilidade order by dia_semana, hora_inicio`,
  )
  return linhas.map(paraDisponibilidade)
}

/** Janela que cruza outra do mesmo dia: a restrição do banco recusa e lança `JanelaSobreposta`. */
export async function criarDisponibilidade(
  nova: Omit<Disponibilidade, 'id'>,
): Promise<Disponibilidade> {
  try {
    const linhas = await consultar<LinhaDisponibilidade>(
      `insert into disponibilidade (dia_semana, hora_inicio, hora_fim)
       values ($1, $2, $3) returning ${COLUNAS_DISPONIBILIDADE}`,
      [nova.diaSemana, nova.horaInicio, nova.horaFim],
    )
    return paraDisponibilidade(linhas[0])
  } catch (erro) {
    if (codigoErro(erro).restricao === 'disponibilidade_sem_sobreposicao') {
      throw new JanelaSobreposta()
    }
    throw erro
  }
}

type LinhaBloqueio = { id: string; inicio: Date; fim: Date; motivo: string }

const paraBloqueio = (l: LinhaBloqueio): Bloqueio => ({
  id: l.id,
  inicio: l.inicio,
  fim: l.fim,
  motivo: l.motivo,
})

/** Bloqueios que tocam o intervalo. */
export async function bloqueiosNoIntervalo(intervalo: Intervalo): Promise<Bloqueio[]> {
  const linhas = await consultar<LinhaBloqueio>(
    `select id, inicio, fim, motivo from bloqueios
     where inicio < $2 and fim > $1 order by inicio`,
    [intervalo.inicio, intervalo.fim],
  )
  return linhas.map(paraBloqueio)
}

export async function criarBloqueio(novo: Omit<Bloqueio, 'id'>): Promise<Bloqueio> {
  const linhas = await consultar<LinhaBloqueio>(
    `insert into bloqueios (inicio, fim, motivo) values ($1, $2, $3)
     returning id, inicio, fim, motivo`,
    [novo.inicio, novo.fim, novo.motivo],
  )
  return paraBloqueio(linhas[0])
}
