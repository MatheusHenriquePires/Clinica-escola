-- CreateTable
CREATE TABLE "_ProfissionalEspecialidades" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ProfissionalEspecialidades_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_ProfissionalEspecialidades_B_index" ON "_ProfissionalEspecialidades"("B");

-- AddForeignKey
ALTER TABLE "_ProfissionalEspecialidades" ADD CONSTRAINT "_ProfissionalEspecialidades_A_fkey" FOREIGN KEY ("A") REFERENCES "Especialidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ProfissionalEspecialidades" ADD CONSTRAINT "_ProfissionalEspecialidades_B_fkey" FOREIGN KEY ("B") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

