import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

/**
 * Recria o banco de teste do zero a cada execução: cria `*_teste` se não existir,
 * apaga o schema `public` e reaplica todas as migrações em ordem. Assim o teste
 * também prova que as migrações aplicam em um banco vazio.
 */
export default async function preparar() {
  const url = new URL(process.env.DATABASE_URL_TESTE!)
  const nome = url.pathname.slice(1)
  if (!nome.endsWith('_teste')) {
    throw new Error(`Recuso rodar testes em "${nome}": o banco de teste deve terminar em _teste.`)
  }

  const admin = new pg.Client({ connectionString: new URL('/postgres', url).toString() })
  await admin.connect()
  const existe = await admin.query('select 1 from pg_database where datname = $1', [nome])
  if (existe.rowCount === 0) await admin.query(`create database "${nome}"`)
  await admin.end()

  const cliente = new pg.Client({ connectionString: url.toString() })
  await cliente.connect()
  await cliente.query('drop schema public cascade; create schema public;')
  const pasta = join(process.cwd(), 'supabase', 'migrations')
  for (const arquivo of readdirSync(pasta).filter((a) => a.endsWith('.sql')).sort()) {
    await cliente.query(readFileSync(join(pasta, arquivo), 'utf8'))
  }
  await cliente.end()
}
