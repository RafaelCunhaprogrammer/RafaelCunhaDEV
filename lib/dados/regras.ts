import { REGRAS_PADRAO, type Regras } from '../dominio/tipos'
import { consultar } from './db'

type Linha = {
  deslocamento_min: number
  antecedencia_min_horas: number
  max_servicos_dia: number
  max_horas_dia: number
  max_servicos_semana: number
  max_horas_semana: number
  m2_maximo_dia_manutencao: number
  m2_maximo_dia_acumulada: number
  bairros_atendidos: string[]
  pode_fechar_com_cliente_novo: boolean
  prazo_resposta_horas: number
  hora_fim_silencio: number
  agente_pausado: boolean
}

/** As regras dela; sem linha gravada ainda, os padrões do domínio. */
export async function carregarRegras(): Promise<Regras> {
  const [l] = await consultar<Linha>(`select * from regras where id`)
  if (!l) return { ...REGRAS_PADRAO, bairrosAtendidos: [...REGRAS_PADRAO.bairrosAtendidos] }
  return {
    deslocamentoMin: l.deslocamento_min,
    antecedenciaMinHoras: l.antecedencia_min_horas,
    maxServicosDia: l.max_servicos_dia,
    maxHorasDia: l.max_horas_dia,
    maxServicosSemana: l.max_servicos_semana,
    maxHorasSemana: l.max_horas_semana,
    m2MaximoDiaManutencao: l.m2_maximo_dia_manutencao,
    m2MaximoDiaAcumulada: l.m2_maximo_dia_acumulada,
    bairrosAtendidos: l.bairros_atendidos,
    podeFecharComClienteNovo: l.pode_fechar_com_cliente_novo,
    prazoRespostaHoras: l.prazo_resposta_horas,
    horaFimSilencio: l.hora_fim_silencio,
    agentePausado: l.agente_pausado,
  }
}

/** Grava a linha única de regras (insere na primeira vez, atualiza depois). */
export async function salvarRegras(r: Regras): Promise<void> {
  await consultar(
    `insert into regras (id, deslocamento_min, antecedencia_min_horas, max_servicos_dia,
       max_horas_dia, max_servicos_semana, max_horas_semana, m2_maximo_dia_manutencao,
       m2_maximo_dia_acumulada, bairros_atendidos, pode_fechar_com_cliente_novo,
       prazo_resposta_horas, hora_fim_silencio, agente_pausado)
     values (true, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (id) do update set
       deslocamento_min = excluded.deslocamento_min,
       antecedencia_min_horas = excluded.antecedencia_min_horas,
       max_servicos_dia = excluded.max_servicos_dia,
       max_horas_dia = excluded.max_horas_dia,
       max_servicos_semana = excluded.max_servicos_semana,
       max_horas_semana = excluded.max_horas_semana,
       m2_maximo_dia_manutencao = excluded.m2_maximo_dia_manutencao,
       m2_maximo_dia_acumulada = excluded.m2_maximo_dia_acumulada,
       bairros_atendidos = excluded.bairros_atendidos,
       pode_fechar_com_cliente_novo = excluded.pode_fechar_com_cliente_novo,
       prazo_resposta_horas = excluded.prazo_resposta_horas,
       hora_fim_silencio = excluded.hora_fim_silencio,
       agente_pausado = excluded.agente_pausado`,
    [
      r.deslocamentoMin,
      r.antecedenciaMinHoras,
      r.maxServicosDia,
      r.maxHorasDia,
      r.maxServicosSemana,
      r.maxHorasSemana,
      r.m2MaximoDiaManutencao,
      r.m2MaximoDiaAcumulada,
      r.bairrosAtendidos,
      r.podeFecharComClienteNovo,
      r.prazoRespostaHoras,
      r.horaFimSilencio,
      r.agentePausado,
    ],
  )
}
