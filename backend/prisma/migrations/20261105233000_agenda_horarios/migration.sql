-- AlterEnum
ALTER TYPE "StatusAtendimento" ADD VALUE 'AGENDADO';

-- CreateTable
CREATE TABLE "Horario" (
    "id" TEXT NOT NULL,
    "profissionalId" TEXT NOT NULL,
    "diaSemana" INTEGER NOT NULL,
    "inicio" TEXT NOT NULL,
    "fim" TEXT NOT NULL,

    CONSTRAINT "Horario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Horario_profissionalId_diaSemana_idx" ON "Horario"("profissionalId", "diaSemana");

-- AddForeignKey
ALTER TABLE "Horario" ADD CONSTRAINT "Horario_profissionalId_fkey" FOREIGN KEY ("profissionalId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

