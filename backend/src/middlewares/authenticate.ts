import type { FastifyReply, FastifyRequest } from 'fastify'
import { AppError } from '../utils/errors.js'
import { prisma } from '../utils/prisma.js'

/**
 * Exige um JWT válido (não expirado) de um usuário ainda ativo e com a mesma versão de sessão.
 * Inativar o usuário, mudar o perfil ou a senha incrementa `versaoSessao` e derruba os tokens antigos na hora.
 */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
  await req.jwtVerify() // lança FST_JWT_* -> tratado como 401 no error-handler
  const usuario = await prisma.usuario.findUnique({
    where: { id: req.user.sub },
    select: { ativo: true, versaoSessao: true },
  })
  if (!usuario?.ativo || usuario.versaoSessao !== (req.user.v ?? 0)) {
    throw new AppError(401, 'Sessão inválida ou expirada. Faça login novamente.', 'NAO_AUTENTICADO')
  }
}

/** Use no `data` de um update de usuário para invalidar todas as sessões abertas dele. */
export const revogarSessoes = { versaoSessao: { increment: 1 } } as const
