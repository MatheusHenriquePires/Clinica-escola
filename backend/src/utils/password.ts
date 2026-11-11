import argon2 from 'argon2'
import { z } from 'zod'

export const hashSenha = (senha: string) => argon2.hash(senha, { type: argon2.argon2id })

export const verificarSenha = (hash: string, senha: string) => argon2.verify(hash, senha)

/** Regra única de senha forte (cadastro, redefinição e troca pelo próprio usuário). */
export const senhaSchema = z
  .string()
  .min(8, 'A senha deve ter ao menos 8 caracteres.')
  .max(200)
  .regex(/[A-Za-z]/, 'A senha deve ter ao menos uma letra.')
  .regex(/\d/, 'A senha deve ter ao menos um número.')
