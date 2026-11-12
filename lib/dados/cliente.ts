import { normalizarTelefone } from '../dominio/telefone'
import type { Cliente } from '../dominio/tipos'
import { consultar } from './db'

type Linha = {
  id: string
  nome: string
  telefone: string
  email: string | null
  endereco: string
  bairro: string
  tipo_imovel: string
  metros_quadrados: number | null
  observacoes: string
  origem: Cliente['origem']
  criado_em: Date
}

const COLUNAS = `id, nome, telefone, email, endereco, bairro, tipo_imovel,
  metros_quadrados, observacoes, origem, criado_em`

const paraCliente = (l: Linha): Cliente => ({
  id: l.id,
  nome: l.nome,
  telefone: l.telefone,
  email: l.email,
  endereco: l.endereco,
  bairro: l.bairro,
  tipoImovel: l.tipo_imovel,
  metrosQuadrados: l.metros_quadrados,
  observacoes: l.observacoes,
  origem: l.origem,
  criadoEm: l.criado_em,
})

/** Aceita o telefone em qualquer formato; busca pela forma normalizada. */
export async function buscarClientePorTelefone(telefone: string): Promise<Cliente | null> {
  const linhas = await consultar<Linha>(`select ${COLUNAS} from clientes where telefone = $1`, [
    normalizarTelefone(telefone),
  ])
  return linhas[0] ? paraCliente(linhas[0]) : null
}

/**
 * Grava o telefone normalizado. Um número que já existe, em qualquer formato,
 * viola a unicidade e a função lança: quem chama decide se busca o existente.
 */
export async function criarCliente(novo: Omit<Cliente, 'id' | 'criadoEm'>): Promise<Cliente> {
  const linhas = await consultar<Linha>(
    `insert into clientes (nome, telefone, email, endereco, bairro, tipo_imovel,
       metros_quadrados, observacoes, origem)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning ${COLUNAS}`,
    [
      novo.nome,
      normalizarTelefone(novo.telefone),
      novo.email,
      novo.endereco,
      novo.bairro,
      novo.tipoImovel,
      novo.metrosQuadrados,
      novo.observacoes,
      novo.origem,
    ],
  )
  return paraCliente(linhas[0])
}
