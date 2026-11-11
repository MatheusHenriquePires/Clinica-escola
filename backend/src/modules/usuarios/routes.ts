// Dono: Matheus (auth)
// Contas da equipe administrativa (perfis ADMIN e RECEPCAO). Somente ADMIN gerencia.
// Alunos (ESTUDANTE) e profissionais (PROFISSIONAL) têm cadastros próprios em /alunos e /profissionais.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate, revogarSessoes } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { AppError } from '../../utils/errors.js'
import { hashSenha, senhaSchema } from '../../utils/password.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'
import { registrarAuditoria } from '../auditoria/service.js'

const PERFIS = ['ADMIN', 'RECEPCAO'] as const

const PUBLICO = { id: true, nome: true, email: true, perfil: true, ativo: true, createdAt: true } as const

const perfilSchema = z.enum(PERFIS, { errorMap: () => ({ message: 'Selecione Administrador ou Recepção.' }) })

const listaSchema = paginacaoSchema.extend({
  busca: z.string().trim().min(1).optional(),
  perfil: perfilSchema.optional(),
  ativo: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
})

const dadosSchema = z.object({
  nome: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(3, 'Informe o nome completo.').max(120)),
  email: z.string().trim().toLowerCase().email('Email inválido.').max(160),
  perfil: perfilSchema,
})
const criarSchema = dadosSchema.extend({ senha: senhaSchema })
const senhaBodySchema = z.object({ senha: senhaSchema })
const idSchema = z.object({ id: z.string().uuid() })

async function buscarUsuario(id: string) {
  const usuario = await prisma.usuario.findFirst({ where: { id, perfil: { in: [...PERFIS] } }, select: PUBLICO })
  if (!usuario) throw new AppError(404, 'Usuário não encontrado.', 'NAO_ENCONTRADO')
  return usuario
}

async function checarEmail(email: string, ignorarId?: string) {
  const outros = ignorarId ? { id: { not: ignorarId } } : {}
  if (await prisma.usuario.findFirst({ where: { email, ...outros }, select: { id: true } })) {
    throw new AppError(409, 'Já existe um usuário com este email.', 'EMAIL_DUPLICADO')
  }
}

/** O admin não pode se inativar nem tirar o próprio perfil ADMIN (garante ao menos um admin ativo). */
function protegerProprioAcesso(alvoId: string, usuarioLogadoId: string, mensagem: string) {
  if (alvoId === usuarioLogadoId) throw new AppError(422, mensagem, 'PROPRIA_CONTA')
}

export async function usuariosRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)
  app.addHook('preHandler', authorize('ADMIN'))

  app.get('/', async (req) => {
    const { busca, perfil, ativo, ...pag } = listaSchema.parse(req.query)
    const where = {
      perfil: perfil ?? { in: [...PERFIS] },
      ativo,
      ...(busca && {
        OR: [
          { nome: { contains: busca, mode: 'insensitive' as const } },
          { email: { contains: busca, mode: 'insensitive' as const } },
        ],
      }),
    }
    const [data, total] = await Promise.all([
      prisma.usuario.findMany({ where, select: PUBLICO, orderBy: { nome: 'asc' }, ...toSkipTake(pag) }),
      prisma.usuario.count({ where }),
    ])
    return paginado(data, total, pag)
  })

  app.post('/', async (req, reply) => {
    const { senha, ...dados } = criarSchema.parse(req.body)
    await checarEmail(dados.email)

    const senhaHash = await hashSenha(senha)
    const usuario = await prisma.$transaction(async (tx) => {
      const criado = await tx.usuario.create({ data: { ...dados, senhaHash }, select: PUBLICO })
      await registrarAuditoria(
        { usuarioId: req.user.sub, entidade: 'Usuario', entidadeId: criado.id, acao: 'CRIAR', dadosDepois: criado },
        tx,
      )
      return criado
    })
    return reply.status(201).send(usuario)
  })

  app.put('/:id', async (req) => {
    const { id } = idSchema.parse(req.params)
    const dados = dadosSchema.parse(req.body)
    const antes = await buscarUsuario(id)
    if (antes.perfil !== dados.perfil) {
      protegerProprioAcesso(id, req.user.sub, 'Você não pode alterar o seu próprio perfil.')
    }
    await checarEmail(dados.email, id)

    return prisma.$transaction(async (tx) => {
      const depois = await tx.usuario.update({ where: { id }, data: { ...dados, ...(antes.perfil !== dados.perfil && revogarSessoes) }, select: PUBLICO })
      await registrarAuditoria(
        { usuarioId: req.user.sub, entidade: 'Usuario', entidadeId: id, acao: 'ATUALIZAR', dadosAntes: antes, dadosDepois: depois },
        tx,
      )
      return depois
    })
  })

  // O admin define uma nova senha; ela nunca vai para a auditoria.
  app.post('/:id/redefinir-senha', async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    const { senha } = senhaBodySchema.parse(req.body)
    await buscarUsuario(id)

    const senhaHash = await hashSenha(senha)
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id }, data: { senhaHash, ...revogarSessoes } })
      await registrarAuditoria({ usuarioId: req.user.sub, entidade: 'Usuario', entidadeId: id, acao: 'REDEFINIR_SENHA' }, tx)
    })
    return reply.status(204).send()
  })

  // Sem DELETE: o usuário aparece na auditoria e em atendimentos; apenas inativa/reativa.
  for (const [rota, ativo, acao] of [
    ['inativar', false, 'INATIVAR'],
    ['reativar', true, 'REATIVAR'],
  ] as const) {
    app.patch(`/:id/${rota}`, async (req) => {
      const { id } = idSchema.parse(req.params)
      if (!ativo) protegerProprioAcesso(id, req.user.sub, 'Você não pode inativar a sua própria conta.')
      const antes = await buscarUsuario(id)
      if (antes.ativo === ativo) return antes
      return prisma.$transaction(async (tx) => {
        const depois = await tx.usuario.update({ where: { id }, data: { ativo }, select: PUBLICO })
        await registrarAuditoria(
          { usuarioId: req.user.sub, entidade: 'Usuario', entidadeId: id, acao, dadosAntes: antes, dadosDepois: depois },
          tx,
        )
        return depois
      })
    })
  }
}
