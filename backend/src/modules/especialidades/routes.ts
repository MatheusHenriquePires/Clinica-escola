// Dono: Otávio (especialidades/auditoria)
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { AppError } from '../../utils/errors.js'
import { normalizar } from '../../utils/normalize.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'
import { registrarAuditoria } from '../auditoria/service.js'

const PUBLICO = { id: true, nome: true, descricao: true, ativa: true } as const

const listaSchema = paginacaoSchema.extend({
  ativa: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  busca: z.string().trim().min(1).optional(),
})

const corpoSchema = z.object({
  nome: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(2, 'Informe o nome da especialidade.').max(80)),
  descricao: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null),
})
const idSchema = z.object({ id: z.string().uuid() })

async function buscar(id: string) {
  const e = await prisma.especialidade.findUnique({ where: { id }, select: PUBLICO })
  if (!e) throw new AppError(404, 'Especialidade não encontrada.', 'NAO_ENCONTRADO')
  return e
}

/** Traduz a violação do índice único (nomeAtivoChave) em erro de negócio. */
const traduzirDuplicidade = (err: unknown): never => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new AppError(409, 'Já existe uma especialidade ativa com este nome.', 'NOME_DUPLICADO')
  }
  throw err
}

export async function especialidadesRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/', async (req) => {
    const { ativa, busca, ...pag } = listaSchema.parse(req.query)
    const where = { ativa, ...(busca && { nome: { contains: busca, mode: 'insensitive' as const } }) }
    const [data, total] = await Promise.all([
      prisma.especialidade.findMany({ where, select: PUBLICO, orderBy: { nome: 'asc' }, ...toSkipTake(pag) }),
      prisma.especialidade.count({ where }),
    ])
    return paginado(data, total, pag)
  })

  app.post('/', { preHandler: [authorize('ADMIN')] }, async (req, reply) => {
    const dados = corpoSchema.parse(req.body)
    try {
      const criada = await prisma.$transaction(async (tx) => {
        const e = await tx.especialidade.create({
          data: { ...dados, nomeAtivoChave: normalizar(dados.nome) },
          select: PUBLICO,
        })
        await registrarAuditoria(
          { usuarioId: req.user.sub, entidade: 'Especialidade', entidadeId: e.id, acao: 'CRIAR', dadosDepois: e },
          tx,
        )
        return e
      })
      return reply.status(201).send(criada)
    } catch (err) {
      return traduzirDuplicidade(err)
    }
  })

  app.put('/:id', { preHandler: [authorize('ADMIN')] }, async (req) => {
    const { id } = idSchema.parse(req.params)
    const dados = corpoSchema.parse(req.body)
    const antes = await buscar(id)
    try {
      return await prisma.$transaction(async (tx) => {
        const depois = await tx.especialidade.update({
          where: { id },
          // Inativa não ocupa o nome: a chave só é preenchida enquanto ativa.
          data: { ...dados, nomeAtivoChave: antes.ativa ? normalizar(dados.nome) : null },
          select: PUBLICO,
        })
        await registrarAuditoria(
          { usuarioId: req.user.sub, entidade: 'Especialidade', entidadeId: id, acao: 'ATUALIZAR', dadosAntes: antes, dadosDepois: depois },
          tx,
        )
        return depois
      })
    } catch (err) {
      return traduzirDuplicidade(err)
    }
  })

  // Sem DELETE: a especialidade pode estar vinculada a atendimentos; apenas inativa/reativa.
  for (const [rota, ativa, acao] of [
    ['inativar', false, 'INATIVAR'],
    ['reativar', true, 'REATIVAR'],
  ] as const) {
    app.patch(`/:id/${rota}`, { preHandler: [authorize('ADMIN')] }, async (req) => {
      const { id } = idSchema.parse(req.params)
      const antes = await buscar(id)
      if (antes.ativa === ativa) return antes
      try {
        return await prisma.$transaction(async (tx) => {
          const depois = await tx.especialidade.update({
            where: { id },
            data: { ativa, nomeAtivoChave: ativa ? normalizar(antes.nome) : null },
            select: PUBLICO,
          })
          await registrarAuditoria(
            { usuarioId: req.user.sub, entidade: 'Especialidade', entidadeId: id, acao, dadosAntes: antes, dadosDepois: depois },
            tx,
          )
          return depois
        })
      } catch (err) {
        return traduzirDuplicidade(err)
      }
    })
  }
}
