// Dono: Hugo (pacientes)
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { naoImplementado } from '../../utils/errors.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'

const listaSchema = paginacaoSchema.extend({
  busca: z.string().trim().min(1).optional(),
  ativo: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
})

export async function pacientesRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/', { preHandler: [authorize('ADMIN', 'RECEPCAO', 'PROFISSIONAL', 'ESTUDANTE')] }, async (req) => {
    const { busca, ativo, ...pag } = listaSchema.parse(req.query)
    const where = { ativo, ...(busca && { nome: { contains: busca, mode: 'insensitive' as const } }) }
    const [data, total] = await Promise.all([
      prisma.paciente.findMany({ where, orderBy: { nome: 'asc' }, ...toSkipTake(pag) }),
      prisma.paciente.count({ where }),
    ])
    return paginado(data, total, pag)
  })

  app.get('/:id', { preHandler: [authorize('ADMIN', 'RECEPCAO', 'PROFISSIONAL', 'ESTUDANTE')] }, async () => {
    throw naoImplementado('Hugo: buscar paciente por id')
  })

  app.post('/', { preHandler: [authorize('ADMIN', 'RECEPCAO')] }, async () => {
    throw naoImplementado('Hugo: criar paciente (validar CPF, registrar auditoria)')
  })

  app.put('/:id', { preHandler: [authorize('ADMIN', 'RECEPCAO')] }, async () => {
    throw naoImplementado('Hugo: atualizar paciente (registrar auditoria)')
  })

  // Sem DELETE: paciente só é inativado, nunca excluído fisicamente.
  app.patch('/:id/inativar', { preHandler: [authorize('ADMIN', 'RECEPCAO')] }, async () => {
    throw naoImplementado('Hugo: inativar paciente (ativo=false, registrar auditoria)')
  })
}
