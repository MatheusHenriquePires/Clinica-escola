// Dono: Matheus (auth)
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { AppError } from '../../utils/errors.js'
import { env } from '../../utils/env.js'
import { prisma } from '../../utils/prisma.js'
import { hashSenha, verificarSenha } from '../../utils/password.js'

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  senha: z.string().min(1).max(200),
})

// Mensagem única para email inexistente, senha errada ou usuário inativo.
const CREDENCIAIS_INVALIDAS = 'Email ou senha inválidos.'

// Hash falso para gastar o mesmo tempo quando o email não existe (evita enumerar usuários).
const hashFalso = hashSenha('senha-falsa-para-tempo-constante')

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/login',
    {
      // Limite de tentativas por IP, bem mais baixo que o limite global.
      config: { rateLimit: { max: env.LOGIN_RATE_LIMIT_MAX, timeWindow: env.LOGIN_RATE_LIMIT_WINDOW } },
    },
    async (req) => {
      const { email, senha } = loginSchema.parse(req.body)
      const usuario = await prisma.usuario.findUnique({ where: { email } })

      const hash = usuario?.senhaHash ?? (await hashFalso)
      const senhaOk = await verificarSenha(hash, senha).catch(() => false)

      if (!usuario || !usuario.ativo || !senhaOk) {
        throw new AppError(401, CREDENCIAIS_INVALIDAS, 'CREDENCIAIS_INVALIDAS')
      }

      const token = app.jwt.sign({ sub: usuario.id, perfil: usuario.perfil })
      return {
        token,
        expiraEm: env.JWT_EXPIRES_IN,
        usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
      }
    },
  )

  // Dados do usuário logado (também valida se o token ainda é aceito).
  app.get('/me', { onRequest: [authenticate] }, async (req) => {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.sub },
      select: { id: true, nome: true, email: true, perfil: true, ativo: true },
    })
    if (!usuario?.ativo) throw new AppError(401, 'Sessão inválida ou expirada.', 'NAO_AUTENTICADO')
    return usuario
  })

  // TODO (Matheus): trocar senha, gerenciar usuários (ADMIN), refresh de sessão.
}
