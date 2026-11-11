import fastifyCors from '@fastify/cors'
import fp from 'fastify-plugin'
import { env } from '../utils/env.js'

export const corsPlugin = fp(async (app) => {
  await app.register(fastifyCors, {
    origin: env.CORS_ORIGIN.split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    // Necessário para o navegador enviar/receber o cookie de sessão entre front (:5173) e API (:3333).
    credentials: true,
  })
})
