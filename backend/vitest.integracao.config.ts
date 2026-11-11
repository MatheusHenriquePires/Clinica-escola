import { defineConfig } from 'vitest/config'

// Testes com Postgres real (banco separado do de desenvolvimento). Precisa do `npm run db` no ar.
export default defineConfig({
  test: {
    include: ['src/**/*.integracao.test.ts'],
    globalSetup: ['./test/preparar-banco.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
})
