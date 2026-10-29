// Dono: Otávio (especialidades/auditoria)
import type { Prisma } from '@prisma/client'
import { prisma } from '../../utils/prisma.js'

// Campos que nunca devem ir para a trilha de auditoria.
const SENSIVEIS = ['senhaHash', 'senha', 'token']

const limpar = (dados: unknown): Prisma.InputJsonValue | undefined => {
  if (dados == null) return undefined
  const copia = JSON.parse(JSON.stringify(dados)) as Record<string, unknown>
  for (const campo of SENSIVEIS) delete copia[campo]
  return copia as Prisma.InputJsonValue
}

interface RegistroAuditoria {
  usuarioId: string
  entidade: string
  entidadeId: string
  acao: string
  dadosAntes?: unknown
  dadosDepois?: unknown
}

/** Chamar nos services de pacientes/especialidades/atendimentos a cada criar/alterar/inativar. */
export function registrarAuditoria(r: RegistroAuditoria, tx: Prisma.TransactionClient = prisma) {
  return tx.auditoria.create({
    data: {
      usuarioId: r.usuarioId,
      entidade: r.entidade,
      entidadeId: r.entidadeId,
      acao: r.acao,
      dadosAntes: limpar(r.dadosAntes),
      dadosDepois: limpar(r.dadosDepois),
    },
  })
}
