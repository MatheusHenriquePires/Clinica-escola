-- Sessão revogável: tokens guardam a versão; incrementar invalida os tokens antigos.
ALTER TABLE "Usuario" ADD COLUMN "versaoSessao" INTEGER NOT NULL DEFAULT 0;

-- Supervisão: profissional que valida o atendimento feito por estudante.
ALTER TABLE "Atendimento" ADD COLUMN "supervisorId" TEXT;

CREATE INDEX "Atendimento_supervisorId_finalizado_idx" ON "Atendimento"("supervisorId", "finalizado");

ALTER TABLE "Atendimento" ADD CONSTRAINT "Atendimento_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "Usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
