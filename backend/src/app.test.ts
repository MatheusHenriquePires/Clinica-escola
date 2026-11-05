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
