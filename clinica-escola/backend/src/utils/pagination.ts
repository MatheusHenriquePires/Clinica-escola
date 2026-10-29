import { z } from 'zod'

export const paginacaoSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type Paginacao = z.infer<typeof paginacaoSchema>

/** Converte page/limit em skip/take do Prisma. */
export const toSkipTake = ({ page, limit }: Paginacao) => ({
  skip: (page - 1) * limit,
  take: limit,
})

/** Formato padrão de resposta de listagens. */
export const paginado = <T>(data: T[], total: number, { page, limit }: Paginacao) => ({
  data,
  meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
})
