import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * Если сервер в TABLETOP_MODE — сразу открываем общий стол,
 * минуя лобби и телефоны.
 */
export const TabletopGate = () => {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/tabletop')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { enabled?: boolean } | null) => {
        if (cancelled || !data?.enabled) {
          setChecked(true)
          return
        }
        if (!pathname.startsWith('/tabletop')) {
          navigate('/tabletop', { replace: true })
        }
        setChecked(true)
      })
      .catch(() => setChecked(true))
    return () => {
      cancelled = true
    }
  }, [navigate, pathname])

  // Пока не проверили — ничего не блокируем (на обычном сервере лобби ок).
  void checked
  return null
}
