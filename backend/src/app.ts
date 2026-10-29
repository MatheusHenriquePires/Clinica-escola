import Fastify from 'fastify'
import { atendimentosRoutes } from './modules/atendimentos/routes.js'
import { auditoriaRoutes } from './modules/auditoria/routes.js'
import { authRoutes } from './modules/auth/routes.js'
import { especialidadesRoutes } from './modules/especialidades/routes.js'
import { pacientesRoutes } from './modules/pacientes/routes.js'
import { corsPlugin } from './plugins/cors.js'
import { registrarErrorHandler } from './plugins/error-handler.js'
import { jwtPlugin } from './plugins/jwt.js'
import { rateLimitPlugin } from './plugins/rate-limit.js'
import { env } from './utils/env.js'

export async function buildApp() {
  const app = Fastify({
    logger:
      env.NODE_ENV === 'test'
        ? false
        : {
            level: 'info',
            // Nunca logar credenciais ou dados sensíveis.
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body',
                'res.headers["set-cookie"]',
                '*.senha',
                '*.senhaHash',
                '*.token',
              ],
              censor: '[REDACTED]',
            },
          },
  })

  registrarErrorHandler(app)
  await app.register(corsPlugin)
  await app.register(rateLimitPlugin)
  await app.register(jwtPlugin)

  app.get('/health', async () => ({ status: 'ok' }))

  await app.register(authRoutes, { prefix: '/auth' })
  await app.register(pacientesRoutes, { prefix: '/pacientes' })
  await app.register(especialidadesRoutes, { prefix: '/especialidades' })
  await app.register(atendimentosRoutes, { prefix: '/atendimentos' })
  await app.register(auditoriaRoutes, { prefix: '/auditoria' })

  return app
}
