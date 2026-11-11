# Clínica Escola

Monorepo: `backend` (Fastify + Prisma + PostgreSQL) e `frontend` (React + Vite).

## Como rodar

Pré-requisitos: Node 20+, Docker.

Na raiz do projeto, com `backend/.env` e `frontend/.env` criados a partir dos `.env.example` (ajuste `JWT_SECRET`):

```bash
npm run install:all   # uma vez
npm run dev           # sobe o Postgres, aplica migrações + seed, back em :3333 e front em :5173
```

Ou separado:

```bash
npm run db                          # Postgres no Docker (porta 5433)
cd backend && npm run setup         # migrações + seed
cd backend && npm run dev           # http://localhost:3333
cd frontend && npm run dev          # http://localhost:5173
```

> Novas migrações: `cd backend && npx prisma migrate dev --name <nome>`. Se o Prisma pedir para **resetar** o banco
> por migrações antigas que não existem mais no repositório, não aceite: gere o SQL com
> `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`,
> salve em `prisma/migrations/<data>_<nome>/migration.sql` e aplique com `npx prisma migrate deploy`.

### Testes e qualidade

```bash
cd backend
npm test                 # unitários (sem banco)
npm run test:integracao  # com Postgres real: cria e usa o banco clinica_escola_test (precisa do `npm run db`)
npm run typecheck

cd frontend
npm run build            # checagem de tipos + build
npm run lint
npm run format:check
```

### Usuários do seed

Senha de todos: valor de `SEED_PASSWORD` (padrão de dev em `.env.example`). **Trocar fora do desenvolvimento.**

| Perfil | Email |
| --- | --- |
| ADMIN | admin@clinica.local |
| RECEPCAO | recepcao@clinica.local |
| PROFISSIONAL | profissional@clinica.local |
| ESTUDANTE | estudante@clinica.local |

## Telas

| Tela | Quem acessa | O que faz |
| --- | --- | --- |
| Início | todos | Indicadores do dia/semana por perfil, pendências e próximas consultas |
| Agenda | admin, recepção, profissional | Grade semanal com consultas e vagas livres; clicar numa vaga abre o agendamento |
| Atendimentos | todos | Agendar, registrar, finalizar; filtro "aguardando validação" para supervisores |
| Pacientes → Histórico | todos | Prontuário: dados do paciente e linha do tempo dos atendimentos |
| Relatórios | admin | Por especialidade e por responsável, taxa de faltas, CSV e impressão/PDF |
| Auditoria | admin | Quem alterou o quê e quando, com o antes/depois de cada campo |
| Usuários | admin | Contas de administração e recepção |
| Meu perfil | todos | Dados da conta e troca da própria senha |

## Regras

**Sessão e acesso**
- Login (`POST /auth/login`) com mensagem genérica e rate limit (`LOGIN_RATE_LIMIT_*`).
- O token fica num cookie `HttpOnly; SameSite=Strict` (o JS não lê). Também é aceito `Authorization: Bearer`.
  Front e API precisam estar no mesmo site (em dev, `localhost:5173` e `localhost:3333`).
- A sessão expira em `JWT_EXPIRES_IN`; o front renova sozinho (`POST /auth/refresh`) se o usuário estiver em uso.
- **Revogação imediata:** inativar o usuário, trocar seu perfil ou senha incrementa `Usuario.versaoSessao`;
  tokens antigos passam a responder 401 na próxima requisição.
- `authenticate` + `authorize(...perfis)` em `backend/src/middlewares`.

**Agenda**
- Nem o responsável nem o **paciente** podem ter duas consultas sobrepostas (duração padrão de 30 min).
- Gravações concorrentes na agenda do mesmo responsável/paciente são serializadas com `pg_advisory_xact_lock`:
  dois agendamentos simultâneos no mesmo horário → um 201 e um 409.
- Consulta agendada com profissional precisa caber nos horários dele.

**Supervisão de estudantes**
- Atendimento de estudante exige um supervisor: profissional ativo da mesma especialidade.
- O supervisor vê, revisa e **valida** (finaliza) o atendimento; o estudante não finaliza.
- `GET /atendimentos?pendentesRevisao=true` lista o que aguarda validação.

**Privacidade (LGPD)**
- Estudante vê dos pacientes só nome, nascimento e CPF mascarado (`***.982.247-**`), sem busca por CPF.
- Contato, endereço e observações só dos pacientes que ele já atendeu.

**Dados**
- Paciente, especialidade e usuários nunca são excluídos: apenas inativados.
- Nome de especialidade único entre ativas via `nomeAtivoChave`.
- Listagens paginadas: `?page=1&limit=20` (máx. 100) → `{ data, meta }`.
- Handler global de erros; logs com redação de `authorization`, cookies, corpo da requisição, senhas e tokens.
- Auditoria: `registrarAuditoria()` em `modules/auditoria/service.ts` em toda escrita.

## Donos dos módulos

| Módulo | Responsável |
| --- | --- |
| auth, usuários | Matheus |
| pacientes | Hugo |
| especialidades, auditoria | Otávio |
| atendimentos, agenda | Daniel |
| frontend | Andrey / Pedro |
