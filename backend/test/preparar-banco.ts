// Cria o banco de teste (se não existir) e aplica as migrações antes dos testes de integração.
import { execSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

export const URL_TESTE =
  process.env.TEST_DATABASE_URL ?? 'postgresql://clinica:clinica@localhost:5433/clinica_escola_test?schema=public'

export default async function preparar() {
  const url = new URL(URL_TESTE)
  const nome = url.pathname.slice(1)
  if (!/^[a-z0-9_]+$/.test(nome) || !nome.endsWith('_test')) {
    throw new Error(`Banco de teste precisa terminar em "_test" (recebido: ${nome}).`)
  }

  // Conecta no banco "postgres" (manutenção) só para criar o de teste.
  const manutencao = new URL(URL_TESTE)
  manutencao.pathname = '/postgres'
  const admin = new PrismaClient({ datasourceUrl: manutencao.toString() })
  try {
    const existe = await admin.$queryRaw<unknown[]>`SELECT 1 FROM pg_database WHERE datname = ${nome}`
    if (existe.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${nome}"`)
  } finally {
    await admin.$disconnect()
  }

  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: URL_TESTE }, stdio: 'ignore' })
}
