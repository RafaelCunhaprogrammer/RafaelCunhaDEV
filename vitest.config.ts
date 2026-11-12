import { defineConfig } from 'vitest/config'

// Testes de domínio: puros, sem banco. Os da camada de dados rodam à parte,
// com `npm run test:db` (veja vitest.db.config.ts).
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['lib/**/*.test.ts'],
    exclude: ['lib/dados/**', 'node_modules/**'],
  },
})
