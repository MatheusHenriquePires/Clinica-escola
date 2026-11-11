// Donos: Andrey / Pedro (front)
// Peças repetidas nas telas de cadastro. Estilo em styles/cadastro.css (prefixo cad__).
import { useEffect, useRef } from 'react'

/** Mensagem de retorno (sucesso/erro) com botão de fechar. Não renderiza nada sem texto. */
export function Aviso({ texto, onFechar }: { texto: string; onFechar: () => void }) {
  if (!texto) return null
  return (
    <p role="status" className="cad__aviso">
      {texto}
      <button aria-label="Fechar aviso" onClick={onFechar}>
        ×
      </button>
    </p>
  )
}

export interface MetaPaginacao {
  page: number
  totalPages: number
}

/** Anterior / Próxima. Some quando há uma página só. */
export function Paginacao({ meta, onPagina }: { meta: MetaPaginacao; onPagina: (p: number) => void }) {
  if (meta.totalPages <= 1) return null
  return (
    <div className="cad__paginacao">
      <button className="cad__secundario" disabled={meta.page <= 1} onClick={() => onPagina(meta.page - 1)}>
        ← Anterior
      </button>
      <span>
        Página {meta.page} de {meta.totalPages}
      </span>
      <button
        className="cad__secundario"
        disabled={meta.page >= meta.totalPages}
        onClick={() => onPagina(meta.page + 1)}
      >
        Próxima →
      </button>
    </div>
  )
}

/** Abas Ativos / Inativos das listas. */
export function AbasAtivos({ ativos, onMudar }: { ativos: boolean; onMudar: (ativos: boolean) => void }) {
  return (
    <div className="cad__abas" role="tablist">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          role="tab"
          aria-selected={ativos === v}
          className={ativos === v ? 'cad__aba cad__aba--ativa' : 'cad__aba'}
          onClick={() => onMudar(v)}
        >
          {v ? 'Ativos' : 'Inativos'}
        </button>
      ))}
    </div>
  )
}

/**
 * Enquanto o modal está aberto: Esc fecha e a página de fundo não rola.
 * `fechar` pode ignorar o Esc (ex.: durante o salvamento).
 */
export function useModal(aberto: boolean, fechar: () => void) {
  const ref = useRef(fechar)
  useEffect(() => {
    ref.current = fechar
  })
  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ref.current()
    }
    document.addEventListener('keydown', aoTeclar)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', aoTeclar)
      document.body.style.overflow = overflow
    }
  }, [aberto])
}

/** Cabeçalho padrão do modal (título + botão fechar). */
export function TopoModal({ id, titulo, onFechar }: { id: string; titulo: string; onFechar: () => void }) {
  return (
    <div className="cad__modal-topo">
      <h2 id={id}>{titulo}</h2>
      <button type="button" className="cad__fechar" aria-label="Fechar" onClick={onFechar}>
        ×
      </button>
    </div>
  )
}
