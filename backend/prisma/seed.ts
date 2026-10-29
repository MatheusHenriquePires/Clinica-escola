import 'dotenv/config'
import { Perfil, PrismaClient } from '@prisma/client'
import { hashSenha } from '../src/utils/password.js'

const prisma = new PrismaClient()

const usuarios: { nome: string; email: string; perfil: Perfil }[] = [
  { nome: 'Administrador', email: 'admin@clinica.local', perfil: 'ADMIN' },
  { nome: 'Recepção', email: 'recepcao@clinica.local', perfil: 'RECEPCAO' },
  { nome: 'Profissional', email: 'profissional@clinica.local', perfil: 'PROFISSIONAL' },
  { nome: 'Estudante', email: 'estudante@clinica.local', perfil: 'ESTUDANTE' },
]

async function main() {
  const senhaHash = await hashSenha(process.env.SEED_PASSWORD ?? 'Trocar@123')
  for (const u of usuarios) {
    await prisma.usuario.upsert({
      where: { email: u.email },
      update: {},
      create: { ...u, senhaHash },
    })
  }
  console.log('Seed ok. Usuários:', usuarios.map((u) => u.email).join(', '))
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
