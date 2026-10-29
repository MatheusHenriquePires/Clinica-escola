import type { FastifyReply, FastifyRequest } from 'fastify'

/** Exige um JWT válido (não expirado). Preenche request.user. */
export async function authenticate(req: FastifyRequest, _reply: FastifyReply) {
  await req.jwtVerify() // lança FST_JWT_* -> tratado como 401 no error-handler
}
