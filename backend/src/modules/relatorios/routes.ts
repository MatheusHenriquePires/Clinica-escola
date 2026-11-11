// Relatórios gerenciais para a coordenação (somente ADMIN).
import type { StatusAtendimento } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { inicioDoDiaLocal } from '../../utils/agenda.js'
import { prisma } from '../../utils/prisma.js'

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')

/** Período em dias inteiros do fuso da clínica; padrão: últimos 30 dias. */
export const periodoSchema = z
  .object({ de: dia.optional(), ate: dia.optional() })
  .transform(({ de, ate }) => {
    // Meio-dia UTC cai no mesmo dia civil em qualquer fuso do Brasil.
    const meioDia = (d: string) => new Date(`${d}T12:00:00Z`)
    const fim = inicioDoDiaLocal(ate ? meioDia(ate) : new Date(), 1)
    const inicio = de ? inicioDoDiaLocal(meioDia(de)) : inicioDoDiaLocal(fim, -30)
    return { inicio, fim }
  })
  .refine((p) => p.inicio < p.fim, { message: 'A data inicial deve ser anterior ou igual à final.', path: ['ate'] })
  .refine((p) => p.fim.getTime() - p.inicio.getTime() <= 400 * 86_400_000, {
    message: 'Período máximo de 400 dias.',
    path: ['de'],
  })

type Contagem = Record<StatusAtendimento, number> & { total: number }
const zerada = (): Contagem => ({ total: 0, AGENDADO: 0, REALIZADO: 0, CANCELADO: 0, FALTOU: 0 })

/** Faltas sobre consultas que deveriam ter acontecido (realizadas + faltas). */
const taxaFaltas = (c: Contagem) => {
  const base = c.REALIZADO + c.FALTOU
  return base ? Math.round((c.FALTOU / base) * 1000) / 10 : 0
}

function agrupar<K extends string>(linhas: { chave: K; status: StatusAtendimento; n: number }[]) {
  const mapa = new Map<K, Contagem>()
  for (const { chave, status, n } of linhas) {
    const c = mapa.get(chave) ?? zerada()
    c[status] += n
    c.total += n
    mapa.set(chave, c)
  }
  return mapa
}

export async function relatoriosRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)
  app.addHook('preHandler', authorize('ADMIN'))

  app.get('/', async (req) => {
    const { inicio, fim } = periodoSchema.parse(req.query)
    const where = { dataHora: { gte: inicio, lt: fim } }

    const [porEsp, porResp, finalizados] = await Promise.all([
      prisma.atendimento.groupBy({ by: ['especialidadeId', 'status'], where, _count: { _all: true } }),
      prisma.atendimento.groupBy({ by: ['responsavelId', 'status'], where, _count: { _all: true } }),
      prisma.atendimento.groupBy({ by: ['responsavelId'], where: { ...where, finalizado: true }, _count: { _all: true } }),
    ])

    const esp = agrupar(porEsp.map((l) => ({ chave: l.especialidadeId, status: l.status, n: l._count._all })))
    const resp = agrupar(porResp.map((l) => ({ chave: l.responsavelId, status: l.status, n: l._count._all })))
    const finalizadosPor = new Map(finalizados.map((f) => [f.responsavelId, f._count._all]))

    const [especialidades, responsaveis] = await Promise.all([
      prisma.especialidade.findMany({ where: { id: { in: [...esp.keys()] } }, select: { id: true, nome: true } }),
      prisma.usuario.findMany({
        where: { id: { in: [...resp.keys()] } },
        select: { id: true, nome: true, perfil: true, curso: true, matricula: true },
      }),
    ])

    const totais = zerada()
    for (const c of esp.values()) {
      for (const k of Object.keys(c) as (keyof Contagem)[]) totais[k] += c[k]
    }

    return {
      periodo: { de: inicio, ate: fim },
      totais: { ...totais, taxaFaltas: taxaFaltas(totais) },
      porEspecialidade: especialidades
        .map((e) => ({ ...e, ...esp.get(e.id)!, taxaFaltas: taxaFaltas(esp.get(e.id)!) }))
        .sort((a, b) => b.total - a.total),
      porResponsavel: responsaveis
        .map((r) => ({
          ...r,
          ...resp.get(r.id)!,
          finalizados: finalizadosPor.get(r.id) ?? 0,
          taxaFaltas: taxaFaltas(resp.get(r.id)!),
        }))
        .sort((a, b) => b.REALIZADO - a.REALIZADO || a.nome.localeCompare(b.nome)),
    }
  })
}
