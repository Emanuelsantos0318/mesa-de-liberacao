import { type ReactNode } from 'react'

export function SidePanel({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-backdrop panel-backdrop" onClick={onClose}>
      <aside className="panel modal-card panel-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="close" type="button" onClick={onClose} aria-label="Fechar">×</button>
        </header>
        {children}
      </aside>
    </div>
  )
}
