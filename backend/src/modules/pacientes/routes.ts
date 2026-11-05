// Dono: Hugo (pacientes)
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { AppError } from '../../utils/errors.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'
import { registrarAuditoria } from '../auditoria/service.js'

const listaSchema = paginacaoSchema.extend({
  busca: z.string().trim().min(1).optional(),
  ativo: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
})

/** Valida os dígitos verificadores do CPF (rejeita sequências repetidas). */
export const cpfValido = (d: string) => {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false
  const digito = (n: number) => {
    let soma = 0
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i)
    const r = (soma * 10) % 11
    return r === 10 ? 0 : r
  }
  return digito(9) === Number(d[9]) && digito(10) === Number(d[10])
}

const soDigitos = (v: string) => v.replace(/\D/g, '')

const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null)

const corpoSchema = z.object({
  nome: z
    .string()
    .transform((v) => v.trim().replace(/\s+/g, ' '))
    .pipe(z.string().min(3, 'Informe o nome completo.').max(120)),
  dataNascimento: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data de nascimento inválida.')
    .transform((v) => new Date(`${v}T00:00:00.000Z`))
    .refine((d) => !Number.isNaN(d.getTime()), 'Data de nascimento inválida.')
    .refine((d) => d.getTime() <= Date.now(), 'A data de nascimento não pode ser futura.')
    .refine((d) => d.getUTCFullYear() >= 1900, 'Data de nascimento inválida.'),
  // CPF opcional (ponto em aberto com o professor); quando informado, precisa ser válido.
  cpf: z
    .string()
    .optional()
    .transform((v) => (v ? soDigitos(v) : null))
    .refine((v) => v === null || cpfValido(v), 'CPF inválido.'),
  telefone: z
    .string()
    .optional()
    .transform((v) => (v ? soDigitos(v) : null))
    .refine((v) => v === null || v.length === 10 || v.length === 11, 'Telefone inválido.'),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(160)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || z.string().email().safeParse(v).success, 'Email inválido.'),
  endereco: opcional(300),
  contatoResponsavel: opcional(200),
  observacoes: opcional(2000),
})
const idSchema = z.object({ id: z.string().uuid() })

async function buscar(id: string) {
  const p = await prisma.paciente.findUnique({ where: { id } })
  if (!p) throw new AppError(404, 'Paciente não encontrado.', 'NAO_ENCONTRADO')
  return p
}

async function checarCpf(cpf: string | null, ignorarId?: string) {
  if (!cpf) return
  const outro = await prisma.paciente.findFirst({
    where: { cpf, ...(ignorarId && { id: { not: ignorarId } }) },
    select: { id: true },
  })
  if (outro) throw new AppError(409, 'Já existe um paciente cadastrado com este CPF.', 'CPF_DUPLICADO')
}

/** Corrida entre duas gravações com o mesmo CPF: o índice único barra e vira 409. */
const traduzirDuplicidade = (err: unknown): never => {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    throw new AppError(409, 'Já existe um paciente cadastrado com este CPF.', 'CPF_DUPLICADO')
  }
  throw err
}

export async function pacientesRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)

  const todos = authorize('ADMIN', 'RECEPCAO', 'PROFISSIONAL', 'ESTUDANTE')
  const gestao = authorize('ADMIN', 'RECEPCAO')

  app.get('/', { preHandler: [todos] }, async (req) => {
    const { busca, ativo, ...pag } = listaSchema.parse(req.query)
    const digitos = busca ? soDigitos(busca) : ''
    const where: Prisma.PacienteWhereInput = {
      ativo,
      ...(busca && {
        OR: [
          { nome: { contains: busca, mode: 'insensitive' } },
          ...(digitos.length >= 3 ? [{ cpf: { contains: digitos } }] : []),
        ],
      }),
    }
    const [data, total] = await Promise.all([
      prisma.paciente.findMany({ where, orderBy: { nome: 'asc' }, ...toSkipTake(pag) }),
      prisma.paciente.count({ where }),
    ])
    return paginado(data, total, pag)
  })

  app.get('/:id', { preHandler: [todos] }, async (req) => buscar(idSchema.parse(req.params).id))

  app.post('/', { preHandler: [gestao] }, async (req, reply) => {
    const dados = corpoSchema.parse(req.body)
    await checarCpf(dados.cpf)
    try {
      const criado = await prisma.$transaction(async (tx) => {
        const p = await tx.paciente.create({ data: dados })
        await registrarAuditoria(
          { usuarioId: req.user.sub, entidade: 'Paciente', entidadeId: p.id, acao: 'CRIAR', dadosDepois: p },
          tx,
        )
        return p
      })
      return reply.status(201).send(criado)
    } catch (err) {
      return traduzirDuplicidade(err)
    }
  })

  // Campos opcionais ausentes no corpo são gravados como vazios (o formulário envia o estado completo).
  app.put('/:id', { preHandler: [gestao] }, async (req) => {
    const { id } = idSchema.parse(req.params)
    const dados = corpoSchema.parse(req.body)
    const antes = await buscar(id)
    await checarCpf(dados.cpf, id)
    try {
      return await prisma.$transaction(async (tx) => {
        const depois = await tx.paciente.update({ where: { id }, data: dados })
        await registrarAuditoria(
          { usuarioId: req.user.sub, entidade: 'Paciente', entidadeId: id, acao: 'ATUALIZAR', dadosAntes: antes, dadosDepois: depois },
          tx,
        )
        return depois
      })
    } catch (err) {
      return traduzirDuplicidade(err)
    }
  })

  // Sem DELETE: paciente só é inativado (e pode ser reativado), nunca excluído fisicamente.
  for (const [rota, ativo, acao] of [
    ['inativar', false, 'INATIVAR'],
    ['reativar', true, 'REATIVAR'],
  ] as const) {
    app.patch(`/:id/${rota}`, { preHandler: [gestao] }, async (req) => {
      const { id } = idSchema.parse(req.params)
      const antes = await buscar(id)
      if (antes.ativo === ativo) return antes
      return prisma.$transaction(async (tx) => {
        const depois = await tx.paciente.update({ where: { id }, data: { ativo } })
        await registrarAuditoria(
          { usuarioId: req.user.sub, entidade: 'Paciente', entidadeId: id, acao, dadosAntes: antes, dadosDepois: depois },
          tx,
        )
        return depois
      })
    })
  }
}
