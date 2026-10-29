import { buildApp } from './app.js'
import { env } from './utils/env.js'
import { prisma } from './utils/prisma.js'

const app = await buildApp()

const encerrar = async () => {
  await app.close()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGINT', encerrar)
process.on('SIGTERM', encerrar)

try {
  await app.listen({ port: env.PORT, host: env.HOST })
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
