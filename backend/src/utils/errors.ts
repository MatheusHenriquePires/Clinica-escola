/** Erro de negócio com status HTTP e mensagem segura para o cliente. */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code = 'ERRO',
  ) {
    super(message)
  }
}

export const naoImplementado = (quem: string) =>
  new AppError(501, `Ainda não implementado (TODO: ${quem}).`, 'NAO_IMPLEMENTADO')
