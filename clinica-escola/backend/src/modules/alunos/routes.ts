// Cadastro de aluno = usuário com perfil ESTUDANTE. Somente ADMIN gerencia (RG-05, seção 7 do PDF).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { AppError } from '../../utils/errors.js'
import { hashSenha } from '../../utils/password.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'
import { registrarAuditoria } from '../auditoria/service.js'

const PUBLICO = { id: true, nome: true, email: true, perfil: true, ativo: true, createdAt: true } as const

const listaSchema = paginacaoSchema.extend({
  busca: z.string().trim().min(1).optional(),
  ativo: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
})

const criarSchema = z.object({
  nome: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(3, 'Informe o nome completo.').max(120)),
  email: z.string().trim().toLowerCase().email('Email inválido.').max(160),
  senha: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.').max(200),
})

const idSchema = z.object({ id: z.string().uuid() })

async function buscarAluno(id: string) {
  const aluno = await prisma.usuario.findFirst({ where: { id, perfil: 'ESTUDANTE' }, select: PUBLICO })
  if (!aluno) throw new AppError(404, 'Aluno não encontrado.', 'NAO_ENCONTRADO')
  return aluno
}

export async function alunosRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)
  app.addHook('preHandler', authorize('ADMIN'))

  app.get('/', async (req) => {
    const { busca, ativo, ...pag } = listaSchema.parse(req.query)
    const where = {
      perfil: 'ESTUDANTE' as const,
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
    const dados = criarSchema.parse(req.body)

    const existente = await prisma.usuario.findUnique({ where: { email: dados.email }, select: { id: true } })
    if (existente) throw new AppError(409, 'Já existe um usuário com este email.', 'EMAIL_DUPLICADO')

    const senhaHash = await hashSenha(dados.senha)
    const aluno = await prisma.$transaction(async (tx) => {
      const criado = await tx.usuario.create({
        data: { nome: dados.nome, email: dados.email, senhaHash, perfil: 'ESTUDANTE' },
        select: PUBLICO,
      })
      await registrarAuditoria(
        { usuarioId: req.user.sub, entidade: 'Aluno', entidadeId: criado.id, acao: 'CRIAR', dadosDepois: criado },
        tx,
      )
      return criado
    })
    return reply.status(201).send(aluno)
  })

  // Sem DELETE: o aluno pode estar vinculado a atendimentos; apenas inativa/reativa.
  for (const [rota, ativo, acao] of [
    ['inativar', false, 'INATIVAR'],
    ['reativar', true, 'REATIVAR'],
  ] as const) {
    app.patch(`/:id/${rota}`, async (req) => {
      const { id } = idSchema.parse(req.params)
      const antes = await buscarAluno(id)
      if (antes.ativo === ativo) return antes
      return prisma.$transaction(async (tx) => {
        const depois = await tx.usuario.update({ where: { id }, data: { ativo }, select: PUBLICO })
        await registrarAuditoria(
          { usuarioId: req.user.sub, entidade: 'Aluno', entidadeId: id, acao, dadosAntes: antes, dadosDepois: depois },
          tx,
        )
        return depois
      })
    })
  }
}
