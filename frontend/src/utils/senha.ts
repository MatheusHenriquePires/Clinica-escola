/** Mesma regra de senha forte do back (utils/password.ts). Só para feedback imediato no formulário. */
export const erroSenha = (senha: string) => {
  if (senha.length < 8) return 'A senha deve ter ao menos 8 caracteres.'
  if (!/[A-Za-z]/.test(senha)) return 'A senha deve ter ao menos uma letra.'
  if (!/\d/.test(senha)) return 'A senha deve ter ao menos um número.'
  return ''
}
