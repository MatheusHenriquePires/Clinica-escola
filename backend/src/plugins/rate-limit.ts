import fastifyRateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'
import { env } from '../utils/env.js'

// Limite global; o login define um limite bem menor na própria rota.
export const rateLimitPlugin = fp(async (app) => {
  await app.register(fastifyRateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
  })
})
