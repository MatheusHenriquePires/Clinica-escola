import { Prisma } from '@prisma/client'
import type { FastifyError, FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { AppError } from '../utils/errors.js'

const resposta = (error: string, message: string, extra?: object) => ({ error, message, ...extra })

export function registrarErrorHandler(app: FastifyInstance) {
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send(resposta('NAO_ENCONTRADO', 'Rota não encontrada.'))
  })

  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send(
        resposta('VALIDACAO', 'Dados inválidos.', {
          detalhes: err.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
        }),
      )
    }
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(resposta(err.code, err.message))
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2002') {
        return reply.status(409).send(resposta('CONFLITO', 'Já existe um registro com esses dados.'))
      }
      if (err.code === 'P2025') {
        return reply.status(404).send(resposta('NAO_ENCONTRADO', 'Registro não encontrado.'))
      }
    }

    const status = (err as FastifyError).statusCode
    if (status === 429) {
      return reply.status(429).send(resposta('MUITAS_REQUISICOES', 'Muitas tentativas. Aguarde e tente novamente.'))
    }
    if (status === 401 || (err as FastifyError).code?.startsWith('FST_JWT')) {
      return reply.status(401).send(resposta('NAO_AUTENTICADO', 'Sessão inválida ou expirada. Faça login novamente.'))
    }
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send(resposta('REQUISICAO_INVALIDA', 'Requisição inválida.'))
    }

    // Loga só o erro (sem corpo/headers da requisição) e responde de forma genérica.
    req.log.error({ err }, 'Erro inesperado')
    return reply.status(500).send(resposta('ERRO_INTERNO', 'Erro interno. Tente novamente mais tarde.'))
  })
}
