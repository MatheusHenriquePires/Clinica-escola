import fastifyJwt from '@fastify/jwt'
import type { Perfil } from '@prisma/client'
import fp from 'fastify-plugin'
import { env } from '../utils/env.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; perfil: Perfil }
    user: { sub: string; perfil: Perfil }
  }
}

// Sessão com expiração: o token expira em JWT_EXPIRES_IN.
export const jwtPlugin = fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  })
})
