# Clínica Escola

Monorepo: `backend` (Fastify + Prisma + PostgreSQL) e `frontend` (React + Vite).

## Como rodar

Pré-requisitos: Node 20+, Docker.

```bash
# 1. Banco
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env        # ajuste JWT_SECRET
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev                 # http://localhost:3333

# 3. Frontend (outro terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

Testes e checagem de tipos: `cd backend && npm test && npm run typecheck`.

### Usuários do seed

Senha de todos: valor de `SEED_PASSWORD` (padrão de dev em `.env.example`). **Trocar fora do desenvolvimento.**

| Perfil | Email |
| --- | --- |
| ADMIN | admin@clinica.local |
| RECEPCAO | recepcao@clinica.local |
| PROFISSIONAL | profissional@clinica.local |
| ESTUDANTE | estudante@clinica.local |

## Regras já prontas

- Login (`POST /auth/login`) com mensagem de erro genérica e rate limit (`LOGIN_RATE_LIMIT_*`); sessão expira em `JWT_EXPIRES_IN`.
- `authenticate` + `authorize(...perfis)` em `backend/src/middlewares`.
- Paciente e especialidade nunca são excluídos: apenas inativados (`PATCH /:id/inativar`, sem `DELETE`).
- Nome de especialidade único entre ativas via `nomeAtivoChave` (preencher com `normalizar(nome)`; `null` ao inativar).
- Listagens paginadas: `?page=1&limit=20` (máx. 100) -> `{ data, meta }`.
- Handler global de erros; logs com redação de `authorization`, corpo da requisição, senhas e tokens.
- Auditoria: use `registrarAuditoria()` em `modules/auditoria/service.ts` nas escritas.

Rotas ainda não implementadas respondem `501` e têm um `TODO` com o responsável.

## Donos dos módulos

| Módulo | Responsável |
| --- | --- |
| auth | Matheus |
| pacientes | Hugo |
| especialidades, auditoria | Otávio |
| atendimentos | Daniel |
| frontend | Andrey / Pedro |
