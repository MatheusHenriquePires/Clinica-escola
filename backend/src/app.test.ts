import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// Testes unitários não usam banco: o authenticate enxerga todo token como de um usuário ativo, versão 0.
// Os testes com banco real ficam em src/integracao.integracao.test.ts (npm run test:integracao).
vi.mock('./utils/prisma.js', () => ({
  prisma: { usuario: { findUnique: async () => ({ ativo: true, versaoSessao: 0 }) } },
}))

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

  it('criar paciente com CPF inválido retorna 400 com o campo', async () => {
    const token = app.jwt.sign({ sub: 'u1', perfil: 'RECEPCAO' })
    const res = await app.inject({
      method: 'POST',
      url: '/pacientes',
      headers: { authorization: `Bearer ${token}` },
      payload: { nome: 'Maria da Silva', dataNascimento: '1990-05-10', cpf: '123.456.789-00' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().detalhes).toContainEqual(expect.objectContaining({ campo: 'cpf' }))
  })

  it('estudante não pode criar paciente', async () => {
    const token = app.jwt.sign({ sub: 'u1', perfil: 'ESTUDANTE' })
    const res = await app.inject({
      method: 'POST',
      url: '/pacientes',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('sessão, usuários e auditoria', () => {
  let app: Awaited<ReturnType<typeof buildApp>>
  beforeAll(async () => {
    app = await buildApp()
  })
  afterAll(() => app.close())

  const ADMIN_ID = '00000000-0000-4000-8000-000000000001'
  const bearer = (perfil: 'ADMIN' | 'RECEPCAO' | 'ESTUDANTE', sub = ADMIN_ID) => ({
    authorization: `Bearer ${app.jwt.sign({ sub, perfil })}`,
  })

  it('aceita o token pelo cookie de sessão', async () => {
    const token = app.jwt.sign({ sub: 'u1', perfil: 'ESTUDANTE' })
    const res = await app.inject({ method: 'GET', url: '/auditoria', cookies: { clinica_sessao: token } })
    expect(res.statusCode).toBe(403) // autenticou pelo cookie; barrado só pelo perfil
  })

  it('logout apaga o cookie httpOnly', async () => {
    const res = await app.inject({ method: 'POST', url: '/auth/logout' })
    expect(res.statusCode).toBe(204)
    const cookie = String(res.headers['set-cookie'])
    expect(cookie).toContain('clinica_sessao=;')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
  })

  it('refresh e trocar senha exigem sessão', async () => {
    for (const url of ['/auth/refresh', '/auth/trocar-senha']) {
      const res = await app.inject({ method: 'POST', url, payload: {} })
      expect(res.statusCode).toBe(401)
    }
  })

  it('trocar senha valida a força e exige senha diferente', async () => {
    const fraca = await app.inject({
      method: 'POST',
      url: '/auth/trocar-senha',
      headers: bearer('RECEPCAO'),
      payload: { senhaAtual: 'Antiga123', novaSenha: 'curta' },
    })
    expect(fraca.statusCode).toBe(400)
    expect(fraca.json().detalhes).toContainEqual(expect.objectContaining({ campo: 'novaSenha' }))

    const igual = await app.inject({
      method: 'POST',
      url: '/auth/trocar-senha',
      headers: bearer('RECEPCAO'),
      payload: { senhaAtual: 'Igual1234', novaSenha: 'Igual1234' },
    })
    expect(igual.statusCode).toBe(400)
  })

  it('só ADMIN gerencia usuários', async () => {
    const res = await app.inject({ method: 'GET', url: '/usuarios', headers: bearer('RECEPCAO') })
    expect(res.statusCode).toBe(403)
  })

  it('admin não pode inativar a própria conta', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/usuarios/${ADMIN_ID}/inativar`,
      headers: bearer('ADMIN'),
    })
    expect(res.statusCode).toBe(422)
  })

  it('auditoria rejeita período invertido e usuário inválido', async () => {
    const periodo = await app.inject({
      method: 'GET',
      url: '/auditoria?de=2026-11-10&ate=2026-11-01',
      headers: bearer('ADMIN'),
    })
    expect(periodo.statusCode).toBe(400)
    expect(periodo.json().detalhes).toContainEqual(expect.objectContaining({ campo: 'ate' }))

    const usuario = await app.inject({ method: 'GET', url: '/auditoria?usuarioId=abc', headers: bearer('ADMIN') })
    expect(usuario.statusCode).toBe(400)
  })
})

describe('cpfValido', async () => {
  const { cpfValido } = await import('./modules/pacientes/routes.js')

  it('aceita CPF com dígitos verificadores corretos', () => {
    expect(cpfValido('52998224725')).toBe(true)
  })

  it('rejeita dígito errado, tamanho errado e sequência repetida', () => {
    expect(cpfValido('52998224724')).toBe(false)
    expect(cpfValido('5299822472')).toBe(false)
    expect(cpfValido('11111111111')).toBe(false)
  })
})

describe('agenda', async () => {
  const { cabeNasFaixas, partesLocais } = await import('./utils/agenda.js')
  // 2026-11-09 é segunda-feira; 11:00Z = 08:00 em Recife (UTC-3).
  const seg8h = new Date('2026-11-09T11:00:00Z')
  const faixas = [{ diaSemana: 1, inicio: '08:00', fim: '12:00' }]

  it('interpreta a data no fuso da clínica', () => {
    expect(partesLocais(seg8h)).toEqual({ diaSemana: 1, minutos: 8 * 60 })
  })

  it('aceita consulta que cabe inteira na faixa', () => {
    expect(cabeNasFaixas(seg8h, faixas)).toBe(true)
    expect(cabeNasFaixas(new Date('2026-11-09T14:30:00Z'), faixas)).toBe(true) // 11:30–12:00
  })

  it('rejeita fora da faixa, passando do fim ou em outro dia', () => {
    expect(cabeNasFaixas(new Date('2026-11-09T10:30:00Z'), faixas)).toBe(false) // 07:30
    expect(cabeNasFaixas(new Date('2026-11-09T14:45:00Z'), faixas)).toBe(false) // 11:45 + 30min
    expect(cabeNasFaixas(new Date('2026-11-10T11:00:00Z'), faixas)).toBe(false) // terça
  })
})
