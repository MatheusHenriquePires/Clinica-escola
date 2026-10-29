// Dono: Otávio (especialidades/auditoria)
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'

const filtroSchema = paginacaoSchema.extend({
  entidade: z.string().optional(),
  entidadeId: z.string().optional(),
})

export async function auditoriaRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  // Somente leitura: auditoria nunca é alterada ou excluída via API.
  app.get('/', { preHandler: [authorize('ADMIN')] }, async (req) => {
    const { entidade, entidadeId, ...pag } = filtroSchema.parse(req.query)
    const where = { entidade, entidadeId }
    const [data, total] = await Promise.all([
      prisma.auditoria.findMany({ where, orderBy: { createdAt: 'desc' }, ...toSkipTake(pag) }),
      prisma.auditoria.count({ where }),
    ])
    return paginado(data, total, pag)
  })

  // TODO (Otávio): filtros por usuário e período.
}
