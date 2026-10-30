// Cadastro de aluno = usuário com perfil ESTUDANTE. Somente ADMIN gerencia (RG-05, seção 7 do PDF).
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { authenticate } from '../../middlewares/authenticate.js'
import { authorize } from '../../middlewares/authorize.js'
import { AppError } from '../../utils/errors.js'
import { hashSenha } from '../../utils/password.js'
import { paginacaoSchema, paginado, toSkipTake } from '../../utils/pagination.js'
import { prisma } from '../../utils/prisma.js'
import { registrarAuditoria } from '../auditoria/service.js'
import { CURSOS } from './cursos.js'

const PUBLICO = {
  id: true,
  nome: true,
  email: true,
  matricula: true,
  curso: true,
  perfil: true,
  ativo: true,
  createdAt: true,
} as const

const listaSchema = paginacaoSchema.extend({
  busca: z.string().trim().min(1).optional(),
  ativo: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
})

const nomeSchema = z
  .string()
  .transform((v) => v.trim().replace(/\s+/g, ' '))
  .pipe(z.string().min(3, 'Informe o nome completo.').max(120))

const emailSchema = z.string().trim().toLowerCase().email('Email inválido.').max(160)

const matriculaSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,20}$/, 'A matrícula deve ter de 4 a 20 letras ou números.')

const cursoSchema = z.enum(CURSOS, { errorMap: () => ({ message: 'Selecione um curso da lista.' }) })

const senhaSchema = z
  .string()
  .min(8, 'A senha deve ter ao menos 8 caracteres.')
  .max(200)
  .regex(/[A-Za-z]/, 'A senha deve ter ao menos uma letra.')
  .regex(/\d/, 'A senha deve ter ao menos um número.')

const dadosSchema = z.object({
  nome: nomeSchema,
  email: emailSchema,
  matricula: matriculaSchema,
  curso: cursoSchema,
})
const criarSchema = dadosSchema.extend({ senha: senhaSchema })
const editarSchema = dadosSchema
const senhaBodySchema = z.object({ senha: senhaSchema })
const idSchema = z.object({ id: z.string().uuid() })

async function buscarAluno(id: string) {
  const aluno = await prisma.usuario.findFirst({ where: { id, perfil: 'ESTUDANTE' }, select: PUBLICO })
  if (!aluno) throw new AppError(404, 'Aluno não encontrado.', 'NAO_ENCONTRADO')
  return aluno
}

/** Garante email e matrícula únicos (ignorando o próprio aluno na edição). */
async function checarDuplicidade(email: string, matricula: string, ignorarId?: string) {
  const outros = ignorarId ? { id: { not: ignorarId } } : {}
  if (await prisma.usuario.findFirst({ where: { email, ...outros }, select: { id: true } })) {
    throw new AppError(409, 'Já existe um usuário com este email.', 'EMAIL_DUPLICADO')
  }
  if (await prisma.usuario.findFirst({ where: { matricula, ...outros }, select: { id: true } })) {
    throw new AppError(409, 'Já existe um aluno com esta matrícula.', 'MATRICULA_DUPLICADA')
  }
}

export async function alunosRoutes(app: FastifyInstance) {
  app.addHook('onRequest', authenticate)
  app.addHook('preHandler', authorize('ADMIN'))

  app.get('/', async (req) => {
    const { busca, ativo, ...pag } = listaSchema.parse(req.query)
    const where = {
      perfil: 'ESTUDANTE' as const,
      ativo,
      ...(busca && {
        OR: [
          { nome: { contains: busca, mode: 'insensitive' as const } },
          { email: { contains: busca, mode: 'insensitive' as const } },
          { matricula: { contains: busca, mode: 'insensitive' as const } },
          { curso: { contains: busca, mode: 'insensitive' as const } },
        ],
      }),
    }
    const [data, total] = await Promise.all([
      prisma.usuario.findMany({ where, select: PUBLICO, orderBy: { nome: 'asc' }, ...toSkipTake(pag) }),
      prisma.usuario.count({ where }),
    ])
    return paginado(data, total, pag)
  })

  // Lista fixa de cursos aceitos (fonte única para o formulário).
  app.get('/cursos', async () => CURSOS)

  app.post('/', async (req, reply) => {
    const { senha, ...dados } = criarSchema.parse(req.body)
    await checarDuplicidade(dados.email, dados.matricula)

    const senhaHash = await hashSenha(senha)
    const aluno = await prisma.$transaction(async (tx) => {
      const criado = await tx.usuario.create({
        data: { ...dados, senhaHash, perfil: 'ESTUDANTE' },
        select: PUBLICO,
      })
      await registrarAuditoria(
        { usuarioId: req.user.sub, entidade: 'Aluno', entidadeId: criado.id, acao: 'CRIAR', dadosDepois: criado },
        tx,
      )
      return criado
    })
    return reply.status(201).send(aluno)
  })

  app.put('/:id', async (req) => {
    const { id } = idSchema.parse(req.params)
    const dados = editarSchema.parse(req.body)
    const antes = await buscarAluno(id)
    await checarDuplicidade(dados.email, dados.matricula, id)

    return prisma.$transaction(async (tx) => {
      const depois = await tx.usuario.update({ where: { id }, data: dados, select: PUBLICO })
      await registrarAuditoria(
        { usuarioId: req.user.sub, entidade: 'Aluno', entidadeId: id, acao: 'ATUALIZAR', dadosAntes: antes, dadosDepois: depois },
        tx,
      )
      return depois
    })
  })

  // O admin define uma nova senha; ela nunca vai para a auditoria (campo removido em registrarAuditoria).
  app.post('/:id/redefinir-senha', async (req, reply) => {
    const { id } = idSchema.parse(req.params)
    const { senha } = senhaBodySchema.parse(req.body)
    await buscarAluno(id)

    const senhaHash = await hashSenha(senha)
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id }, data: { senhaHash } })
      await registrarAuditoria({ usuarioId: req.user.sub, entidade: 'Aluno', entidadeId: id, acao: 'REDEFINIR_SENHA' }, tx)
    })
    return reply.status(204).send()
  })

  // Sem DELETE: o aluno pode estar vinculado a atendimentos; apenas inativa/reativa.
  for (const [rota, ativo, acao] of [
    ['inativar', false, 'INATIVAR'],
    ['reativar', true, 'REATIVAR'],
  ] as const) {
    app.patch(`/:id/${rota}`, async (req) => {
      const { id } = idSchema.parse(req.params)
      const antes = await buscarAluno(id)
      if (antes.ativo === ativo) return antes
      return prisma.$transaction(async (tx) => {
        const depois = await tx.usuario.update({ where: { id }, data: { ativo }, select: PUBLICO })
        await registrarAuditoria(
          { usuarioId: req.user.sub, entidade: 'Aluno', entidadeId: id, acao, dadosAntes: antes, dadosDepois: depois },
          tx,
        )
        return depois
      })
    })
  }
}
