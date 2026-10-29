import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3333),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa ter ao menos 32 caracteres'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  RATE_LIMIT_MAX: z.coerce.number().default(200),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(5),
  LOGIN_RATE_LIMIT_WINDOW: z.string().default('15 minutes'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  // Mostra apenas os nomes/mensagens das variáveis inválidas, nunca os valores.
  const problemas = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  console.error('Variáveis de ambiente inválidas:\n- ' + problemas.join('\n- '))
  process.exit(1)
}

export const env = parsed.data
