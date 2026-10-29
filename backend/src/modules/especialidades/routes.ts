// Dono: Otávio (especialidades/auditoria)
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { naoImplementado } from '../../utils/errors.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'

const listaSchema = paginacaoSchema.extend({
  ativa: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
})

export async function especialidadesRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/', async (req) => {
    const { ativa, ...pag } = listaSchema.parse(req.query)
    const [data, total] = await Promise.all([
      prisma.especialidade.findMany({
        where: { ativa },
        select: { id: true, nome: true, descricao: true, ativa: true },
        orderBy: { nome: 'asc' },
        ...toSkipTake(pag),
      }),
      prisma.especialidade.count({ where: { ativa } }),
    ])
    return paginado(data, total, pag)
  })

  // Ao criar/renomear/reativar: nomeAtivoChave = normalizar(nome) (ver utils/normalize.ts).
  // Ao inativar: ativa=false e nomeAtivoChave=null. Nunca excluir fisicamente.
  app.post('/', { preHandler: [authorize('ADMIN')] }, async () => {
    throw naoImplementado('Otávio: criar especialidade (preencher nomeAtivoChave, auditoria)')
  })

  app.put('/:id', { preHandler: [authorize('ADMIN')] }, async () => {
    throw naoImplementado('Otávio: atualizar especialidade (auditoria)')
  })

  app.patch('/:id/inativar', { preHandler: [authorize('ADMIN')] }, async () => {
    throw naoImplementado('Otávio: inativar especialidade (ativa=false, nomeAtivoChave=null, auditoria)')
  })
}
