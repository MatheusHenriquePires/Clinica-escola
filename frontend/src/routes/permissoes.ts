// Donos: Andrey / Pedro (front)
import type { Perfil } from '../contexts/AuthContext'

/**
 * Espelho das regras do back (middleware `authorize`), usado só para UX:
 * esconder menus/botões e evitar telas inúteis. Quem barra de verdade é a API.
 * Se mudar lá, mude aqui.
 */
const TODOS: Perfil[] = ['ADMIN', 'RECEPCAO', 'PROFISSIONAL', 'ESTUDANTE']

export const PERMISSOES = {
  pacientes: { acessar: TODOS, editar: ['ADMIN', 'RECEPCAO'] as Perfil[] },
  especialidades: { acessar: TODOS, editar: ['ADMIN'] as Perfil[] },
  atendimentos: { acessar: TODOS, editar: TODOS },
  alunos: { acessar: ['ADMIN'] as Perfil[], editar: ['ADMIN'] as Perfil[] },
}

export const podeEditar = (modulo: keyof typeof PERMISSOES, perfil?: Perfil) =>
  !!perfil && PERMISSOES[modulo].editar.includes(perfil)
