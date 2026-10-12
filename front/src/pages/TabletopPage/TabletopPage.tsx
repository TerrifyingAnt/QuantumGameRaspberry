import { useMemo, useState, useSyncExternalStore } from 'react'
import {
  cardInput,
  dismissCantPlay,
  getGameData,
  getRejectSeq,
  restartTabletop,
  selectTarget,
  subscribeGame,
} from '../../api/game'
import { getDiceImageUrl, getCardImageUrl } from '../../lib/assets'
import { diceFaceOf, parseDiceFace } from '../../lib/dice'
import type { DiceState } from '../../types/dice'
import { ALL_CARD_IDS } from '../../data/cards'
import type { CardId } from '../../types/card'
import { Modal } from '../../components/Modal/Modal'
import { DiceChoiceModal } from '../../components/DiceChoiceModal/DiceChoiceModal'
import { Button } from '../../components/Button/Button'
import s from './TabletopPage.module.css'

/**
 * Общий стол (один экран + PN532).
 *
 * Что на экране и зачем (оба игрока смотрят вместе):
 * 1) Цель по центру — общий ориентир «к чему стремимся»; без телефонов это
 *    единственный способ держать win-condition в поле зрения обоих.
 * 2) Два регистра симметрично (A слева / B справа) — полная открытая информация;
 *    нельзя спрятать «свой» ряд, как на личном телефоне.
 * 3) Чей ход + счётчик 0–2 карты — очередь у одного ридера; иначе непонятно,
 *    кто сейчас имеет право приложить карту.
 * 4) Подсветка выбранного кубита — цель следующей физической карты; выбор
 *    только касанием экрана (телефонов нет).
 * 5) Последняя карта на кубите (cardsOnField) — нужна для measurement /
 *    quantum_noise и чтобы видеть «защиту» без памяти.
 * 6) Полоса подсказки — следующий шаг жестом (выбрать → приложить /
 *    выбрать грань / вторую цель).
 */

const SEAT_LABELS = ['Игрок A', 'Игрок B'] as const

const CANT_PLAY_REASONS: Record<string, string> = {
  windowDoesNotFit: 'Карта на три кубита не ставится на край регистра.',
  nothingToUndo: 'На кубите нечего отменять.',
  notUndoable: 'Последнюю карту нельзя отменить.',
  identityFirst: 'Identity нельзя играть первой картой хода.',
  alreadyPlayed: 'Эта физическая карта уже сыграна.',
  invalidSecondTarget: 'Некорректная вторая цель.',
  invalidFace: 'Некорректная грань.',
  kroneckerAlreadyActive: 'Сначала закройте кронекер-пару.',
  registerMismatch: 'Вторая карта пары — только в те же регистры.',
  barrierAlreadySet: 'Барьер на следующего игрока уже стоит.',
  measured: 'Кубит закрыт измерением.',
}

const KNOWN = new Set<string>(ALL_CARD_IDS)

function toCardId(name: string | null | undefined): CardId | null {
  if (!name || !KNOWN.has(name)) return null
  return name as CardId
}

export const TabletopPage = () => {
  const { started, state, ended, needsInput, cantPlay } = useSyncExternalStore(
    subscribeGame,
    getGameData,
  )
  const [selection, setSelection] = useState<{
    forReject: number
    player: number
    cubit: number
  } | null>(null)

  const rejectSeq = getRejectSeq()
  const selected =
    selection && selection.forReject === rejectSeq
      ? { player: selection.player, cubit: selection.cubit }
      : null

  const awaitingSecond = needsInput?.need === 'secondTarget'
  const current = state?.currentPlayer ?? 0
  const canInteract = started !== null && state !== null && ended === null

  const hint = useMemo(() => {
    if (!started || !state) return 'Ожидание партии…'
    if (ended) {
      const idx = started.players.indexOf(ended.winnerId)
      return `Победа: ${SEAT_LABELS[idx] ?? ended.winnerName}`
    }
    if (awaitingSecond) {
      return `${SEAT_LABELS[current]}: выберите второй кубит для «${needsInput.card}»`
    }
    if (needsInput?.need === 'face') {
      return `${SEAT_LABELS[current]}: выберите грань на экране`
    }
    if (state.kronecker) {
      const phase = state.kronecker.cardsPlayed === 0 ? 'первую' : 'вторую'
      return `${SEAT_LABELS[current]}: кронекер — приложите ${phase} карту пары`
    }
    if (!selected) {
      return `${SEAT_LABELS[current]}: коснитесь кубита, затем приложите карту к ридеру`
    }
    return `${SEAT_LABELS[current]}: цель выбрана — приложите карту к ридеру (${state.playedCards}/2)`
  }, [started, state, ended, awaitingSecond, needsInput, current, selected])

  const onCubitClick = (player: number, cubit: number) => {
    if (!canInteract) return
    if (awaitingSecond) {
      if (cardInput({ secondTarget: { player, cubit } })) {
        setSelection({ forReject: rejectSeq, player, cubit })
      }
      return
    }
    if (!selectTarget(player, cubit)) return
    setSelection({ forReject: rejectSeq, player, cubit })
  }

  const renderRegister = (playerIndex: number) => {
    const faces = state?.registers[playerIndex] ?? []
    const active = state?.currentPlayer === playerIndex
    const skip = state?.skipNextTurn?.[playerIndex] === true
    return (
      <section
        className={`${s.seat} ${playerIndex === 0 ? s.seatA : s.seatB} ${active ? s.seatActive : ''}`}
      >
        <header className={s.seatHeader}>
          <span className={s.seatName}>{SEAT_LABELS[playerIndex]}</span>
          {active && <span className={s.seatTurn}>ходит</span>}
          {skip && <span className={s.seatSkip}>пропуск</span>}
        </header>
        <div className={s.cubitRow}>
          {faces.map((face, cubit) => {
            const dice = parseDiceFace(face)
            const card = toCardId(state?.cardsOnField[playerIndex]?.[cubit])
            const isSelected =
              selected?.player === playerIndex && selected.cubit === cubit
            const measured = card === 'measurement'
            return (
              <button
                key={cubit}
                type="button"
                className={`${s.cubit} ${isSelected ? s.cubitSelected : ''} ${measured ? s.cubitMeasured : ''} ${canInteract ? s.cubitReady : ''}`}
                onClick={() => onCubitClick(playerIndex, cubit)}
                disabled={!canInteract}
              >
                {card && (
                  <img className={s.cubitCard} src={getCardImageUrl(card)} alt="" />
                )}
                {dice && (
                  <img className={s.cubitDice} src={getDiceImageUrl(dice)} alt={face} />
                )}
                <span className={s.cubitIndex}>{cubit + 1}</span>
              </button>
            )
          })}
        </div>
      </section>
    )
  }

  return (
    <div className={s.root}>
      <div className={s.hint}>{hint}</div>

      <div className={s.board}>
        {renderRegister(0)}

        <section className={s.target}>
          <span className={s.targetLabel}>Цель</span>
          <div className={s.cubitRow}>
            {(state?.targetRegister ?? []).map((face, i) => {
              const dice = parseDiceFace(face)
              return (
                <div className={`${s.cubit} ${s.cubitTarget}`} key={i}>
                  {dice && (
                    <img className={s.cubitDice} src={getDiceImageUrl(dice)} alt={face} />
                  )}
                </div>
              )
            })}
          </div>
          <div className={s.meter}>
            <span className={s.meterValue}>{state?.playedCards ?? 0}/2</span>
            <span className={s.meterLabel}>карты хода</span>
          </div>
        </section>

        {renderRegister(1)}
      </div>

      {needsInput?.need === 'face' && (
        <DiceChoiceModal
          title={`Грань для «${needsInput.card}»`}
          options={(needsInput.faces ?? [])
            .map((f) => parseDiceFace(f))
            .filter((d): d is DiceState => d !== null)}
          onSelect={(dice) => cardInput({ face: diceFaceOf(dice) })}
          onClose={() => {}}
        />
      )}

      {cantPlay !== null && (
        <Modal title="Карту нельзя сыграть" onClose={dismissCantPlay}>
          <p className={s.modalText}>{CANT_PLAY_REASONS[cantPlay] ?? cantPlay}</p>
          <Button type="primary" onClick={dismissCantPlay}>
            Понятно
          </Button>
        </Modal>
      )}

      {ended && (
        <Modal title="Партия окончена" onClose={() => {}}>
          <p className={s.modalText}>{hint}</p>
          <Button type="primary" onClick={() => restartTabletop()}>
            Новая партия
          </Button>
        </Modal>
      )}
    </div>
  )
}
