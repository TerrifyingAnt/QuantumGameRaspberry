import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import s from './Modal.module.css'

export const Modal = ({
  children,
  title,
  onClose,
  fitContent = false,
  wide = false,
}: {
  children: React.ReactNode
  title: string
  onClose: () => void
  fitContent?: boolean
  wide?: boolean
}) => {
  // Клик, открывший модалку, не должен сразу попасть в оверлей и закрыть её.
  const canCloseRef = useRef(false)

  useEffect(() => {
    canCloseRef.current = false
    const timer = window.setTimeout(() => {
      canCloseRef.current = true
    }, 200)
    return () => window.clearTimeout(timer)
  }, [])

  const content = (
    <div
      className={s.modalWrapper}
      onClick={() => {
        if (canCloseRef.current) onClose()
      }}
    >
      <div
        className={`${s.modal} ${fitContent ? s.modalFit : ''} ${wide ? s.modalWide : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${s.modalContent} ${fitContent ? s.modalContentFit : ''}`}>
          {!fitContent && title ? <h2 className={s.modalTitle}>{title}</h2> : null}
          {children}
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
