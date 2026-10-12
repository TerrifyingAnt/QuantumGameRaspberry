import { useEffect, useRef, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getGameData, subscribeGame } from '../../api/game'
import type { GameStartedData } from '../../api/events'

/**
 * Переводит участников на /game при приходе gameStarted.
 * Второй игрок мог не отправлять startGame и находиться на любой странице,
 * поэтому слушатель глобальный. Реагирует только на смену started,
 * чтобы не затаскивать обратно на поле после «Сдаться».
 */
export const GameRedirect = () => {
  const navigate = useNavigate()
  const pathname = useLocation().pathname
  const started = useSyncExternalStore(subscribeGame, getGameData).started
  const prevStarted = useRef<GameStartedData | null>(null)

  useEffect(() => {
    // Режим общего стола живёт на /tabletop — туда не тащим телефонный /game.
    if (pathname.startsWith('/tabletop')) {
      prevStarted.current = started
      return
    }
    if (started && started !== prevStarted.current && pathname !== '/game') {
      navigate('/game')
    }
    prevStarted.current = started
  }, [started, pathname, navigate])

  return null
}
