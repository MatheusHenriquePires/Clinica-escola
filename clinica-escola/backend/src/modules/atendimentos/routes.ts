// Dono: Daniel (atendimentos)
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { naoImplementado } from '../../utils/errors.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'

const listaSchema = paginacaoSchema.extend({
  pacienteId: z.string().uuid().optional(),
  especialidadeId: z.string().uuid().optional(),
  status: z.enum(['REALIZADO', 'CANCELADO', 'FALTOU']).optional(),
})

export async function atendimentosRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  // TODO (Daniel): ESTUDANTE/PROFISSIONAL só devem ver os próprios atendimentos.
  app.get('/', { preHandler: [authorize('ADMIN', 'RECEPCAO', 'PROFISSIONAL', 'ESTUDANTE')] }, async (req) => {
    const { pacienteId, especialidadeId, status, ...pag } = listaSchema.parse(req.query)
    const where = { pacienteId, especialidadeId, status }
    const [data, total] = await Promise.all([
      prisma.atendimento.findMany({ where, orderBy: { dataHora: 'desc' }, ...toSkipTake(pag) }),
      prisma.atendimento.count({ where }),
    ])
    return paginado(data, total, pag)
  })

  app.get('/:id', { preHandler: [authorize('ADMIN', 'RECEPCAO', 'PROFISSIONAL', 'ESTUDANTE')] }, async () => {
    throw naoImplementado('Daniel: buscar atendimento por id')
  })

  app.post('/', { preHandler: [authorize('ADMIN', 'PROFISSIONAL', 'ESTUDANTE')] }, async () => {
    throw naoImplementado('Daniel: criar atendimento (createdBy = usuário logado, auditoria)')
  })

  // Atendimento finalizado não deve mais ser editado.
  app.put('/:id', { preHandler: [authorize('ADMIN', 'PROFISSIONAL', 'ESTUDANTE')] }, async () => {
    throw naoImplementado('Daniel: atualizar atendimento (bloquear se finalizado, auditoria)')
  })

  app.patch('/:id/finalizar', { preHandler: [authorize('ADMIN', 'PROFISSIONAL')] }, async () => {
    throw naoImplementado('Daniel: finalizar atendimento (auditoria)')
  })
}
