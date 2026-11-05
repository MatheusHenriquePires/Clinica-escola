// Cadastro de profissional = usuário com perfil PROFISSIONAL. Somente ADMIN gerencia.
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { AppError } from '../../utils/errors.js'
import { hashSenha } from '../../utils/password.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'
import { registrarAuditoria } from '../auditoria/service.js'

const PUBLICO = {
  id: true,
  nome: true,
  email: true,
  perfil: true,
  ativo: true,
  createdAt: true,
  especialidades: { select: { id: true, nome: true, ativa: true }, orderBy: { nome: 'asc' as const } },
} as const

const listaSchema = paginacaoSchema.extend({
  busca: z.string().trim().min(1).optional(),
  especialidadeId: z.string().uuid().optional(),
  ativo: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
})

const nomeSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(3, 'Informe o nome completo.').max(120))
const emailSchema = z.string().trim().toLowerCase().email('Email inválido.').max(160)
const senhaSchema = z
  .string()
  .min(8, 'A senha deve ter ao menos 8 caracteres.')
  .max(200)
  .regex(/[A-Za-z]/, 'A senha deve ter ao menos uma letra.')
  .regex(/\d/, 'A senha deve ter ao menos um número.')

const especialidadesSchema = z
  .array(z.string().uuid(), { required_error: 'Selecione ao menos uma especialidade.' })
  .min(1, 'Selecione ao menos uma especialidade.')
  .transform((ids) => [...new Set(ids)])

const editarSchema = z.object({ nome: nomeSchema, email: emailSchema, especialidadeIds: especialidadesSchema })
const criarSchema = editarSchema.extend({ senha: senhaSchema })
const senhaBodySchema = z.object({ senha: senhaSchema })
const idSchema = z.object({ id: z.string().uuid() })

async function buscarProfissional(id: string) {
  const p = await prisma.usuario.findFirst({ where: { id, perfil: 'PROFISSIONAL' }, select: PUBLICO })
  if (!p) throw new AppError(404, 'Profissional não encontrado.', 'NAO_ENCONTRADO')
  return p
}

async function checarEmail(email: string, ignorarId?: string) {
  const outros = ignorarId ? { id: { not: ignorarId } } : {}
  if (await prisma.usuario.findFirst({ where: { email, ...outros }, select: { id: true } })) {
    throw new AppError(409, 'Já existe um usuário com este email.', 'EMAIL_DUPLICADO')
  }
}

/**
 * Todas as especialidades informadas precisam existir. Vínculos novos só com especialidade ativa;
 * um vínculo antigo com especialidade que foi inativada depois pode ser mantido.
 */
async function checarEspecialidades(ids: string[], atuais: string[] = []) {
  const achadas = await prisma.especialidade.findMany({ where: { id: { in: ids } }, select: { id: true, ativa: true } })
  if (achadas.length !== ids.length) {
    throw new AppError(422, 'Especialidade não encontrada.', 'ESPECIALIDADE_NAO_ENCONTRADA')
  }
  if (achadas.some((e) => !e.ativa && !atuais.includes(e.id))) {
    throw new AppError(422, 'Não é possível vincular uma especialidade inativa.', 'ESPECIALIDADE_INATIVA')
  }
}

export async function profissionaisRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  // Lista enxuta de profissionais ativos com suas especialidades (formulário de atendimento).
  // ADMIN e RECEPCAO recebem todos; o PROFISSIONAL recebe só a si mesmo.
  app.get('/opcoes', { preHandler: [authorize('ADMIN', 'RECEPCAO', 'PROFISSIONAL')] }, async (req) =>
    prisma.usuario.findMany({
      where: {
        perfil: 'PROFISSIONAL',
        ativo: true,
        ...(req.user.perfil === 'PROFISSIONAL' && { id: req.user.sub }),
      },
      select: { id: true, nome: true, especialidades: { where: { ativa: true }, select: { id: true } } },
      orderBy: { nome: 'asc' },
    }),
  )

  app.register(async (admin) => {
    admin.addHook('preHandler', authorize('ADMIN'))

    admin.get('/', async (req) => {
      const { busca, ativo, especialidadeId, ...pag } = listaSchema.parse(req.query)
      const where = {
        perfil: 'PROFISSIONAL' as const,
        ativo,
        ...(especialidadeId && { especialidades: { some: { id: especialidadeId } } }),
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

    admin.post('/', async (req, reply) => {
      const { senha, especialidadeIds, ...dados } = criarSchema.parse(req.body)
      await checarEmail(dados.email)
      await checarEspecialidades(especialidadeIds)
      const senhaHash = await hashSenha(senha)
      const criado = await prisma.$transaction(async (tx) => {
        const p = await tx.usuario.create({
          data: {
            ...dados,
            senhaHash,
            perfil: 'PROFISSIONAL',
            especialidades: { connect: especialidadeIds.map((id) => ({ id })) },
          },
          select: PUBLICO,
        })
        await registrarAuditoria(
          { usuarioId: req.user.sub, entidade: 'Profissional', entidadeId: p.id, acao: 'CRIAR', dadosDepois: p },
          tx,
        )
        return p
      })
      return reply.status(201).send(criado)
    })

    admin.put('/:id', async (req) => {
      const { id } = idSchema.parse(req.params)
      const { especialidadeIds, ...dados } = editarSchema.parse(req.body)
      const antes = await buscarProfissional(id)
      await checarEmail(dados.email, id)
      await checarEspecialidades(
        especialidadeIds,
        antes.especialidades.map((e) => e.id),
      )
      return prisma.$transaction(async (tx) => {
        const depois = await tx.usuario.update({
          where: { id },
          data: { ...dados, especialidades: { set: especialidadeIds.map((eid) => ({ id: eid })) } },
          select: PUBLICO,
        })
        await registrarAuditoria(
          { usuarioId: req.user.sub, entidade: 'Profissional', entidadeId: id, acao: 'ATUALIZAR', dadosAntes: antes, dadosDepois: depois },
          tx,
        )
        return depois
      })
    })

    admin.post('/:id/redefinir-senha', async (req, reply) => {
      const { id } = idSchema.parse(req.params)
      const { senha } = senhaBodySchema.parse(req.body)
      await buscarProfissional(id)
      const senhaHash = await hashSenha(senha)
      await prisma.$transaction(async (tx) => {
        await tx.usuario.update({ where: { id }, data: { senhaHash } })
        await registrarAuditoria({ usuarioId: req.user.sub, entidade: 'Profissional', entidadeId: id, acao: 'REDEFINIR_SENHA' }, tx)
      })
      return reply.status(204).send()
    })

    for (const [rota, ativo, acao] of [
      ['inativar', false, 'INATIVAR'],
      ['reativar', true, 'REATIVAR'],
    ] as const) {
      admin.patch(`/:id/${rota}`, async (req) => {
        const { id } = idSchema.parse(req.params)
        const antes = await buscarProfissional(id)
        if (antes.ativo === ativo) return antes
        return prisma.$transaction(async (tx) => {
          const depois = await tx.usuario.update({ where: { id }, data: { ativo }, select: PUBLICO })
          await registrarAuditoria(
            { usuarioId: req.user.sub, entidade: 'Profissional', entidadeId: id, acao, dadosAntes: antes, dadosDepois: depois },
            tx,
          )
          return depois
        })
      })
    }
  })
}
