import { defineConfig } from 'vitest/config'

// Testes da camada de dados: exigem um Postgres. Rodam num banco SEPARADO do de
// desenvolvimento (nome terminado em `_teste`), que o globalSetup recria do zero a
// partir das migrações. Defina DATABASE_URL_TESTE para apontar para outro servidor.
export const URL_TESTE =
  process.env.DATABASE_URL_TESTE ?? 'postgresql://postgres@localhost:5433/alana_teste'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/dados/**/*.test.ts'],
    globalSetup: ['lib/dados/testes/preparar-banco.ts'],
    env: { DATABASE_URL: URL_TESTE, DATABASE_URL_TESTE: URL_TESTE },
    // Todos os arquivos dividem o mesmo banco; um de cada vez.
    fileParallelism: false,
  },
})
