// Indicadores do Início, de acordo com o perfil de quem está logado.
import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { authenticate } from '../../middlewares/authenticate.js'
import { inicioDoDiaLocal } from '../../utils/agenda.js'
import { prisma } from '../../utils/prisma.js'
import { escopoVisivel, INCLUIR } from '../atendimentos/routes.js'

export async function painelRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  app.get('/', async (req) => {
    const agora = new Date()
    const hoje = inicioDoDiaLocal(agora)
    const amanha = inicioDoDiaLocal(agora, 1)
    const em7dias = inicioDoDiaLocal(agora, 7)
    const ha7dias = inicioDoDiaLocal(agora, -7)
    const { perfil, sub } = req.user

    const escopo = escopoVisivel(req)
    const conta = (where: Prisma.AtendimentoWhereInput) => prisma.atendimento.count({ where: { AND: [escopo, where] } })
    const registrado = { finalizado: false, status: { not: 'AGENDADO' as const } }

    // Pendências: o que cada perfil precisa resolver.
    const pendencias: Record<string, Prisma.AtendimentoWhereInput> = {
      ADMIN: { ...registrado },
      RECEPCAO: { status: 'AGENDADO', dataHora: { lt: agora } }, // consultas que passaram sem registro
      PROFISSIONAL: { ...registrado, OR: [{ supervisorId: sub }, { responsavelId: sub, supervisorId: null }] },
      ESTUDANTE: { ...registrado, responsavelId: sub },
    }

    const [proximas, consultasHoje, realizadasHoje, proximos7dias, faltas7dias, cancelados7dias, pendentes, pacientesAtivos] =
      await Promise.all([
        prisma.atendimento.findMany({
          where: { AND: [escopo, { status: 'AGENDADO', dataHora: { gte: agora } }] },
          include: INCLUIR,
          orderBy: { dataHora: 'asc' },
          take: 6,
        }),
        conta({ status: { in: ['AGENDADO', 'REALIZADO'] }, dataHora: { gte: hoje, lt: amanha } }),
        conta({ status: 'REALIZADO', dataHora: { gte: hoje, lt: amanha } }),
        conta({ status: 'AGENDADO', dataHora: { gte: agora, lt: em7dias } }),
        conta({ status: 'FALTOU', dataHora: { gte: ha7dias, lt: amanha } }),
        conta({ status: 'CANCELADO', dataHora: { gte: ha7dias, lt: amanha } }),
        conta(pendencias[perfil] ?? registrado),
        perfil === 'ADMIN' || perfil === 'RECEPCAO' ? prisma.paciente.count({ where: { ativo: true } }) : null,
      ])

    return {
      perfil,
      indicadores: { consultasHoje, realizadasHoje, proximos7dias, faltas7dias, cancelados7dias, pendentes, pacientesAtivos },
      proximas,
    }
  })
}
