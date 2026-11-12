import type { Servico } from '../dominio/tipos'
import { consultar } from './db'

type Linha = {
  id: string
  nome: string
  descricao: string
  forma_cobranca: Servico['formaCobranca']
  duracao_estimada_min: number | null
  duracao_visita_min: number | null
  preco_centavos: number | null
  minimo_horas: number | null
  pode_exigir_equipe: boolean
  perguntas_avaliacao: string[]
  ativo: boolean
}

const COLUNAS = `id, nome, descricao, forma_cobranca, duracao_estimada_min,
  duracao_visita_min, preco_centavos, minimo_horas, pode_exigir_equipe,
  perguntas_avaliacao, ativo`

const paraServico = (l: Linha): Servico => ({
  id: l.id,
  nome: l.nome,
  descricao: l.descricao,
  formaCobranca: l.forma_cobranca,
  duracaoEstimadaMin: l.duracao_estimada_min,
  duracaoVisitaMin: l.duracao_visita_min,
  precoCentavos: l.preco_centavos,
  minimoHoras: l.minimo_horas,
  podeExigirEquipe: l.pode_exigir_equipe,
  perguntasAvaliacao: l.perguntas_avaliacao,
  ativo: l.ativo,
})

/** Todos os serviços, na ordem do catálogo (`ordem`, depois nome). */
export async function listarServicos(): Promise<Servico[]> {
  const linhas = await consultar<Linha>(`select ${COLUNAS} from servicos order by ordem, nome`)
  return linhas.map(paraServico)
}

/** Insere ou atualiza pelo id. `ordem` guarda a posição no catálogo. */
export async function salvarServico(servico: Servico, ordem = 0): Promise<void> {
  await consultar(
    `insert into servicos (id, nome, descricao, forma_cobranca, duracao_estimada_min,
       duracao_visita_min, preco_centavos, minimo_horas, pode_exigir_equipe,
       perguntas_avaliacao, ativo, ordem)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (id) do update set
       nome = excluded.nome, descricao = excluded.descricao,
       forma_cobranca = excluded.forma_cobranca,
       duracao_estimada_min = excluded.duracao_estimada_min,
       duracao_visita_min = excluded.duracao_visita_min,
       preco_centavos = excluded.preco_centavos, minimo_horas = excluded.minimo_horas,
       pode_exigir_equipe = excluded.pode_exigir_equipe,
       perguntas_avaliacao = excluded.perguntas_avaliacao,
       ativo = excluded.ativo, ordem = excluded.ordem`,
    [
      servico.id,
      servico.nome,
      servico.descricao,
      servico.formaCobranca,
      servico.duracaoEstimadaMin,
      servico.duracaoVisitaMin,
      servico.precoCentavos,
      servico.minimoHoras,
      servico.podeExigirEquipe,
      [...servico.perguntasAvaliacao],
      servico.ativo,
      ordem,
    ],
  )
}
