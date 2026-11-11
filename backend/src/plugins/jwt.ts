import fastifyCookie from '@fastify/cookie'
import fastifyJwt from '@fastify/jwt'
import type { Perfil } from '@prisma/client'
import type { FastifyInstance, FastifyReply } from 'fastify'
import fp from 'fastify-plugin'
import { env } from '../utils/env.js'

declare module '@fastify/jwt' {
  interface FastifyJWT {
    /** v = versão da sessão do usuário no momento da emissão. */
    payload: { sub: string; perfil: Perfil; v?: number }
    user: { sub: string; perfil: Perfil; v?: number; exp?: number }
  }
}

/** Cookie que guarda o JWT. httpOnly: o JavaScript da página não consegue ler o token (protege contra XSS). */
export const COOKIE_SESSAO = 'clinica_sessao'

// Sessão com expiração: o token expira em JWT_EXPIRES_IN.
// O token é aceito pelo cookie (navegador) ou pelo header Authorization: Bearer (scripts e testes).
export const jwtPlugin = fp(async (app) => {
  await app.register(fastifyCookie)
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
    cookie: { cookieName: COOKIE_SESSAO, signed: false },
  })
})

const opcoesCookie = {
  httpOnly: true,
  // Strict: o navegador não envia o cookie em requisições vindas de outros sites (protege contra CSRF).
  sameSite: 'strict',
  secure: env.NODE_ENV === 'production',
  path: '/',
} as const

/** Gera um token novo, grava no cookie e devolve quando ele expira (timestamp em ms). */
export function emitirSessao(
  app: FastifyInstance,
  reply: FastifyReply,
  usuario: { id: string; perfil: Perfil; versaoSessao: number },
) {
  const token = app.jwt.sign({ sub: usuario.id, perfil: usuario.perfil, v: usuario.versaoSessao })
  const { exp } = app.jwt.decode<{ exp: number }>(token)!
  const expiraEm = exp * 1000
  reply.setCookie(COOKIE_SESSAO, token, { ...opcoesCookie, expires: new Date(expiraEm) })
  return expiraEm
}

export function encerrarSessao(reply: FastifyReply) {
  reply.clearCookie(COOKIE_SESSAO, opcoesCookie)
}
