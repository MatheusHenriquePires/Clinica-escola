import { afterAll, beforeAll, describe, expect, it } from 'vitest'

process.env.NODE_ENV = 'test'
process.env.DATABASE_URL ??= 'postgresql://x:x@localhost:5432/x'
process.env.JWT_SECRET = 'x'.repeat(40)

const { buildApp } = await import('./app.js')

describe('app', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  beforeAll(async () => {
    app = await buildApp()
  })
  afterAll(() => app.close())

  it('GET /health responde ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
  })

  it('rotas protegidas sem token retornam 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/pacientes' })
    expect(res.statusCode).toBe(401)
  })

  it('perfil sem permissão recebe 403', async () => {
    const token = app.jwt.sign({ sub: 'u1', perfil: 'ESTUDANTE' })
    const res = await app.inject({
      method: 'GET',
      url: '/auditoria',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rota TODO retorna 501 para perfil permitido', async () => {
    const token = app.jwt.sign({ sub: 'u1', perfil: 'RECEPCAO' })
    const res = await app.inject({
      method: 'POST',
      url: '/pacientes',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(501)
  })
})
