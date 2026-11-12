import pg from 'pg'

/**
 * Conexão com o Postgres. É o ÚNICO lugar que sabe como falar com o banco; o
 * resto de `lib/dados/` só escreve SQL portável (nada de provedor específico).
 *
 * O nome antigo `supabase.ts` foi trocado por `db.ts`: o banco é Postgres puro, e
 * um arquivo chamado "supabase" induziria a achar que há SDK ou RLS por trás.
 *
 * Tipos de data: o node-postgres converte colunas `date` em `Date` na hora local
 * do processo, o que desloca o dia (um '2026-03-01' vira 28/fev numa máquina a
 * oeste de UTC). Aqui `date` (OID 1082) volta como texto 'YYYY-MM-DD', exatamente
 * o que `Despesa.data` declara. `timestamptz` continua virando `Date` (instante
 * absoluto, sem ambiguidade).
 */
const OID_DATE = 1082

let pool: pg.Pool | undefined

export function obterPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL
    if (!connectionString) throw new Error('DATABASE_URL não definida (veja .env.example)')
    pool = new pg.Pool({
      connectionString,
      types: {
        getTypeParser: ((oid: number, formato?: 'text' | 'binary') =>
          oid === OID_DATE
            ? (valor: string) => valor
            : pg.types.getTypeParser(oid, formato as 'text')) as typeof pg.types.getTypeParser,
      },
    })
  }
  return pool
}

export async function consultar<L extends pg.QueryResultRow>(
  sql: string,
  parametros: unknown[] = [],
): Promise<L[]> {
  const resultado = await obterPool().query<L>(sql, parametros)
  return resultado.rows
}

/** Encerra as conexões (testes e scripts). */
export async function encerrarConexao(): Promise<void> {
  const atual = pool
  pool = undefined
  await atual?.end()
}

/** Código SQLSTATE de um erro do driver, se houver. */
export function codigoErro(erro: unknown): { codigo?: string; restricao?: string } {
  const e = erro as { code?: string; constraint?: string }
  return { codigo: e?.code, restricao: e?.constraint }
}
