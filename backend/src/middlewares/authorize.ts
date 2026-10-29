import type { Perfil } from '@prisma/client'
import type { FastifyRequest } from 'fastify'
import { AppError } from '../utils/errors.js'

/** Uso: preHandler: [authorize('ADMIN', 'RECEPCAO')]. Rodar depois de authenticate. */
export const authorize =
  (...perfis: Perfil[]) =>
  async (req: FastifyRequest) => {
    if (!perfis.includes(req.user.perfil)) {
      throw new AppError(403, 'Você não tem permissão para esta ação.', 'PROIBIDO')
    }
  }
