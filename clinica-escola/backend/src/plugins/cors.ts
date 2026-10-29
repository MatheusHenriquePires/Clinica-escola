import fastifyCors from '@fastify/cors'
import fp from 'fastify-plugin'
import { env } from '../utils/env.js'

export const corsPlugin = fp(async (app) => {
  await app.register(fastifyCors, {
    origin: env.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
})
