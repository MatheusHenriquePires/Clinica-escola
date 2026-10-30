/**
 * Cursos que a clínica aceita no cadastro de aluno. Fonte única: o frontend lê esta lista
 * em GET /alunos/cursos. Para incluir ou remover um curso, edite aqui (ordem alfabética).
 */
export const CURSOS = [
  'Biomedicina',
  'Educação Física',
  'Enfermagem',
  'Farmácia',
  'Fisioterapia',
  'Fonoaudiologia',
  'Nutrição',
  'Odontologia',
  'Psicologia',
  'Terapia Ocupacional',
] as const

export type Curso = (typeof CURSOS)[number]
