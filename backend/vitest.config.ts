import { defineConfig } from 'vitest/config'

// `npm test`: testes unitários (sem banco). Os de integração rodam com `npm run test:integracao`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.integracao.test.ts', 'node_modules/**', 'dist/**'],
  },
})
