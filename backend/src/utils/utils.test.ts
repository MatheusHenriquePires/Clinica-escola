import { describe, expect, it } from 'vitest'
import { normalizar } from './normalize.js'
import { paginacaoSchema, paginado } from './pagination.js'

describe('normalizar', () => {
  it('remove acentos, caixa e espaços extras', () => {
    expect(normalizar('  Fisioterapia   Respiratória ')).toBe('fisioterapia respiratoria')
  })
})

describe('paginação', () => {
  it('aplica padrões e limita o tamanho da página', () => {
    expect(paginacaoSchema.parse({})).toEqual({ page: 1, limit: 20 })
    expect(() => paginacaoSchema.parse({ limit: 1000 })).toThrow()
  })

  it('calcula totalPages', () => {
    expect(paginado([], 45, { page: 1, limit: 20 }).meta.totalPages).toBe(3)
  })
})
