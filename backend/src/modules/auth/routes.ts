// Dono: Matheus (auth)
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, revogarSessoes } from '../../middlewares/authenticate.js'
import { emitirSessao, encerrarSessao } from '../../plugins/jwt.js'
import { AppError } from '../../utils/errors.js'
import { env } from '../../utils/env.js'
import { prisma } from '../../utils/prisma.js'
import { hashSenha, senhaSchema, verificarSenha } from '../../utils/password.js'
import { registrarAuditoria } from '../auditoria/service.js'

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  senha: z.string().min(1).max(200),
})

const trocarSenhaSchema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.').max(200),
    novaSenha: senhaSchema,
  })
  .refine((d) => d.senhaAtual !== d.novaSenha, {
    message: 'A nova senha deve ser diferente da atual.',
    path: ['novaSenha'],
  })

const PUBLICO = { id: true, nome: true, email: true, perfil: true, ativo: true, versaoSessao: true } as const

// Mensagem única para email inexistente, senha errada ou usuário inativo.
const CREDENCIAIS_INVALIDAS = 'Email ou senha inválidos.'
const SESSAO_INVALIDA = 'Sessão inválida ou expirada.'

// Hash falso para gastar o mesmo tempo quando o email não existe (evita enumerar usuários).
const hashFalso = hashSenha('senha-falsa-para-tempo-constante')

/** Usuário dono do token, se ainda existir e estiver ativo. */
async function usuarioDaSessao(id: string) {
  const usuario = await prisma.usuario.findUnique({ where: { id }, select: PUBLICO })
  if (!usuario?.ativo) throw new AppError(401, SESSAO_INVALIDA, 'NAO_AUTENTICADO')
  return usuario
}

/** Remove campos internos antes de responder. */
const semAtivo = <T extends { ativo: boolean; versaoSessao: number }>({
  ativo: _ativo,
  versaoSessao: _versao,
  ...u
}: T) => u

export async function authRoutes(app: FastifyInstance) {
  // Limite de tentativas por IP, bem mais baixo que o limite global (login e troca de senha).
  const limiteSenha = { rateLimit: { max: env.LOGIN_RATE_LIMIT_MAX, timeWindow: env.LOGIN_RATE_LIMIT_WINDOW } }

  // O token vai só no cookie httpOnly; o corpo traz os dados do usuário e quando a sessão expira (ms).
  app.post('/login', { config: limiteSenha }, async (req, reply) => {
    const { email, senha } = loginSchema.parse(req.body)
    const usuario = await prisma.usuario.findUnique({ where: { email } })

    const hash = usuario?.senhaHash ?? (await hashFalso)
    const senhaOk = await verificarSenha(hash, senha).catch(() => false)

    if (!usuario || !usuario.ativo || !senhaOk) {
      throw new AppError(401, CREDENCIAIS_INVALIDAS, 'CREDENCIAIS_INVALIDAS')
    }

    const expiraEm = emitirSessao(app, reply, usuario)
    return {
      expiraEm,
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
    }
  })

  // Apaga o cookie. Não exige sessão válida: sair sempre funciona.
  app.post('/logout', async (_req, reply) => {
    encerrarSessao(reply)
    return reply.status(204).send()
  })

  // Dados do usuário logado para a aba "Meu perfil" (também valida se o token ainda é aceito).
  app.get('/me', { onRequest: [authenticate] }, async (req) => {
    const usuario = await prisma.usuario.findUnique({
      where: { id: req.user.sub },
      select: {
        ...PUBLICO,
        matricula: true,
        curso: true,
        createdAt: true,
        especialidades: { where: { ativa: true }, select: { id: true, nome: true }, orderBy: { nome: 'asc' } },
      },
    })
    if (!usuario?.ativo) throw new AppError(401, SESSAO_INVALIDA, 'NAO_AUTENTICADO')
    return { ...semAtivo(usuario), expiraEm: req.user.exp ? req.user.exp * 1000 : null }
  })

  // Renova a sessão: exige token ainda válido e usuário ativo; o perfil é relido do banco.
  app.post('/refresh', { onRequest: [authenticate] }, async (req, reply) => {
    const usuario = await usuarioDaSessao(req.user.sub)
    const expiraEm = emitirSessao(app, reply, usuario)
    return { expiraEm, usuario: semAtivo(usuario) }
  })

  // Troca da própria senha. Senha atual errada responde 400 (não 401) para não derrubar a sessão no front.
  // Derruba as sessões abertas em outros dispositivos e emite um cookie novo para esta.
  app.post('/trocar-senha', { onRequest: [authenticate], config: limiteSenha }, async (req, reply) => {
    const { senhaAtual, novaSenha } = trocarSenhaSchema.parse(req.body)
    const usuario = await prisma.usuario.findUnique({ where: { id: req.user.sub } })
    if (!usuario?.ativo) throw new AppError(401, SESSAO_INVALIDA, 'NAO_AUTENTICADO')

    const senhaOk = await verificarSenha(usuario.senhaHash, senhaAtual).catch(() => false)
    if (!senhaOk) throw new AppError(400, 'Senha atual incorreta.', 'SENHA_ATUAL_INCORRETA')

    const senhaHash = await hashSenha(novaSenha)
    const atualizado = await prisma.$transaction(async (tx) => {
      const u = await tx.usuario.update({
        where: { id: usuario.id },
        data: { senhaHash, ...revogarSessoes },
        select: PUBLICO,
      })
      await registrarAuditoria(
        { usuarioId: usuario.id, entidade: 'Usuario', entidadeId: usuario.id, acao: 'TROCAR_SENHA' },
        tx,
      )
      return u
    })
    emitirSessao(app, reply, atualizado)
    return reply.status(204).send()
  })
}
