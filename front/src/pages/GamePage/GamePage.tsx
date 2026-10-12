import { Menu } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button/Button'
import { getConnectionState, subscribeConnection } from '../../api/connection'
import {
  cardInput,
  dismissCantPlay,
  getGameData,
  getRejectSeq,
  giveUp,
  playCard,
  selectTarget,
  startGame,
  subscribeGame,
} from '../../api/game'
import type { GameStateData } from '../../api/events'
import type { BoardOwner } from '../../game/types'
import { getCardImageUrl, getDiceImageUrl } from '../../lib/assets'
import { diceFaceOf, parseDiceFace } from '../../lib/dice'
import { cubitCountLabel } from '../../lib/plural'
import type { DiceState } from '../../types/dice'
import { ALL_CARD_IDS } from '../../data/cards'
import type { CardId } from '../../types/card'
import { Modal } from '../../components/Modal/Modal'
import { DiceChoiceModal } from '../../components/DiceChoiceModal/DiceChoiceModal'
import { QubitSlot } from './QubitSlot'
import { RulesFrame } from './RulesFrame'
import s from './GamePage.module.css'

/** Карты без selectTarget (как requirement None / kronecker на сервере). */
const NO_TARGET_CARDS = new Set<CardId>([
  'identity',
  'barrier',
  'reshuffle',
  'kronecker_multiplication',
])

const avatar = (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11.25,17.25h1.5L12,18z"/>
    <path d="m15,12 l2,2"/>
    <path d="M18,6.5a0.5,0.5 0,0 0,-0.5 -0.5"/>
    <path d="M20.69,9.67a4.5,4.5 0,1 0,-7.04 -5.5,8.35 8.35,0 0,0 -3.3,0 4.5,4.5 0,1 0,-7.04 5.5C2.49,11.2 2,12.88 2,14.5 2,19.47 6.48,22 12,22s10,-2.53 10,-7.5c0,-1.62 -0.48,-3.3 -1.3,-4.83"/>
    <path d="M6,6.5a0.495,0.495 0,0 1,0.5 -0.5"/>
    <path d="m9,12 l-2,2"/>
  </svg>
)

type Slot = { dice: DiceState | null; frozen: boolean }

type Target = { player: number; cubit: number }

type Selection = {
  /** Состояние поля, к которому относится выбор. При новом setGameState выбор сбрасывается. */
  forState: GameStateData | null
  /** rejectSeq на момент выбора. При cantPlay сервер сбрасывает цель — выбор устаревает. */
  forReject: number
  target: Target | null
}

/** Тексты причин cantPlay (id из EVENTS.md). Неизвестный id показывается как есть. */
const CANT_PLAY_REASONS: Record<string, string> = {
  windowDoesNotFit: 'Карта не может быть сыграна на крайний кубит.',
  nothingToUndo: 'На выбранном кубите нет карты.',
  notUndoable: 'Последняя карта на этом кубите не отменяемая.',
  identityFirst: 'Identity нельзя играть первой картой хода.',
  alreadyPlayed: 'Эта карта уже сыграна в этой игре.',
  invalidSecondTarget: 'Некорректная вторая цель.',
  invalidFace: 'Некорректная грань.',
  kroneckerAlreadyActive: 'Кронекер-пара уже активна — сначала закройте её.',
  registerMismatch: 'Вторая карта пары должна попасть в те же регистры.',
  barrierAlreadySet: 'Следующий игрок уже помечен барьером.',
  measured: 'Кубит закрыт измерением — выберите другую цель.',
}

function toSlots(faces: string[] | undefined): Slot[] {
  return (faces ?? []).map((face) => ({ dice: parseDiceFace(face), frozen: false }))
}

const KNOWN_CARD_IDS = new Set<string>(ALL_CARD_IDS)

function toCardId(name: string): CardId | null {
  return KNOWN_CARD_IDS.has(name) ? (name as CardId) : null
}

/** Допустимые грани из cardNeedsInput в варианты для DiceChoiceModal. */
function toDiceOptions(faces: string[] | undefined): DiceState[] {
  return (faces ?? [])
    .map((face) => parseDiceFace(face))
    .filter((dice): dice is DiceState => dice !== null)
}

export const GamePage = () => {
  const navigate = useNavigate()
  const { userId, onlineUsers } = useSyncExternalStore(subscribeConnection, getConnectionState)
  const { started, state, ended, needsInput, cantPlay } = useSyncExternalStore(subscribeGame, getGameData)

  const [selection, setSelection] = useState<Selection>({ forState: null, forReject: 0, target: null })
  const [menuOpen, setMenuOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)

  const myIndex = started && userId !== null ? started.players.indexOf(userId) : -1
  const inGame = myIndex >= 0
  const otherIndex = myIndex === 0 ? 1 : 0

  const myRegister = inGame && state ? state.registers[myIndex] : undefined
  const opponentRegister = inGame && state ? state.registers[otherIndex] : undefined
  const mySlots = toSlots(myRegister)
  const opponentSlots = toSlots(opponentRegister)
  const targetFaces = state ? state.targetRegister : []

  const myTurn = inGame && state !== null && state.currentPlayer === myIndex

  /** Игрок помечен барьером и пропустит свой следующий ход (skipNextTurn). */
  const skipsNext = (playerIndex: number): boolean => state?.skipNextTurn?.[playerIndex] === true

  /** swap ждёт вторую цель: сервер в этом режиме игнорирует selectTarget. */
  const awaitingSecond = needsInput !== null && needsInput.need === 'secondTarget'

  const rejectSeq = getRejectSeq()
  const selectionFresh = selection.forState === state && selection.forReject === rejectSeq
  const selectedTarget = selectionFresh ? selection.target : null

  const onSlotClick = (player: number, cubit: number) => {
    if (awaitingSecond) {
      if (cardInput({ secondTarget: { player, cubit } })) {
        setSelection({
          forState: state,
          forReject: rejectSeq,
          target: { player, cubit },
        })
      }
      return
    }
    if (!myTurn) return
    if (!selectTarget(player, cubit)) return
    setSelection({
      forState: state,
      forReject: rejectSeq,
      target: { player, cubit },
    })
  }

  const onPlayCard = (cardId: CardId) => {
    if (!myTurn || awaitingSecond || needsInput !== null) return
    if (!NO_TARGET_CARDS.has(cardId) && selectedTarget === null) return
    playCard(cardId)
  }

  const canPickCards = myTurn && !awaitingSecond && needsInput === null
  const kroneckerBanner = state !== null && state.kronecker !== null
  const hintText = (() => {
    if (!myTurn || awaitingSecond || needsInput !== null || kroneckerBanner) return null
    if (selectedTarget === null) {
      return 'Коснитесь кубита, затем выберите карту внизу (identity / barrier — сразу)'
    }
    return 'Выберите карту'
  })()

  const nicknameOf = (playerId: number): string =>
    onlineUsers.find((user) => user.id === playerId)?.name ?? 'Игрок'

  const fieldCardAt = (playerIndex: number, cubit: number): CardId | null => {
    if (!state) return null
    const cell = state.cardsOnField[playerIndex]?.[cubit] ?? null
    return cell === null ? null : toCardId(cell)
  }

  const restart = () => {
    if (started) startGame(started.players, started.cubitCount)
  }

  const renderRow = (owner: BoardOwner, label: string, slots: Slot[], playerIndex: number) => (
    <>
      <div className={s.rowLabel}>{label}</div>
      <div className={s.boardRow}>
        {slots.map((slot, index) => (
          <QubitSlot
            key={`${owner}-${index}`}
            slot={slot}
            ready={myTurn || awaitingSecond}
            selected={
              selectedTarget !== null &&
              selectedTarget.player === playerIndex &&
              selectedTarget.cubit === index
            }
            disabled={!myTurn && !awaitingSecond}
            card={fieldCardAt(playerIndex, index)}
            onClick={() => onSlotClick(playerIndex, index)}
          />
        ))}
      </div>
    </>
  )

  if (!started || !inGame) {
    return (
      <main className={s.main}>
        <p className={s.modalText}>Ожидание начала игры…</p>
      </main>
    )
  }

  const myId = started.players[myIndex]
  const opponentId = started.players[otherIndex]

  return (
    <>
      <header className={s.gameHeader}>
        <div className={s.menuButton} onClick={() => setMenuOpen(true)}>
          <Menu className={s.menuIcon} />
        </div>
      </header>

      <main className={s.main}>
        <section className={s.playersBar}>
          <div className={s.playersRow}>
            <div className={`${s.playerCard} ${myTurn ? s.playerCardActive : ''}`}>
              <div className={s.playerAvatar}>{avatar}</div>
              <span className={s.playerName}>{nicknameOf(myId)}</span>
              {skipsNext(myIndex) && <span className={s.playerStatusSkip}>пропустит ход</span>}
            </div>
            <div className={s.playedCounter}>
              <span className={s.playedCounterValue}>{state ? state.playedCards : 0}/2</span>
              <span className={s.playedCounterLabel}>карты</span>
              {state !== null && (
                <span className={`${s.playedCounterTurn} ${myTurn ? s.playedCounterTurnActive : ''}`}>
                  {myTurn ? 'ваш ход' : 'ход другого игрока'}
                </span>
              )}
            </div>
            <div className={`${s.playerCard} ${!myTurn && state ? s.playerCardActive : ''}`}>
              <div className={s.playerAvatar}>{avatar}</div>
              <span className={s.playerName}>{nicknameOf(opponentId)}</span>
              {skipsNext(otherIndex) && <span className={s.playerStatusSkip}>пропустит ход</span>}
            </div>
          </div>
        </section>

        <section className={s.targetSection}>
          <span className={s.sectionLabel}>Цель · {cubitCountLabel(started.cubitCount)}</span>
          <div className={s.targetRow}>
            {targetFaces.map((face, i) => {
              const dice = parseDiceFace(face)
              return (
                <div className={s.targetDiceSlot} key={i}>
                  {dice && <img className={s.targetDiceImage} src={getDiceImageUrl(dice)} alt="" />}
                </div>
              )
            })}
          </div>
        </section>


        {awaitingSecond && (
          <div className={s.awaitBanner}>
            Карта «{needsInput.card}»: выберите второй кубит
          </div>
        )}

        {state !== null && state.kronecker !== null && (
          <div className={s.awaitBanner}>
            Кронекер-пара: {state.kronecker.cardsPlayed === 0 ? 'ожидает первую карту' : 'ожидает вторую карту'}
            {state.kronecker.registers.length > 0
              ? ` — регистры: ${state.kronecker.registers.map((r) => nicknameOf(started.players[r])).join(', ')}`
              : ' — регистры не ограничены'}
          </div>
        )}

        {hintText && <div className={s.awaitBanner}>{hintText}</div>}

        {!hintText && !awaitingSecond && !(state !== null && state.kronecker !== null) && (
          <div className={s.awaitBanner} style={{ visibility: 'hidden' }}>
            ---
          </div>
        )}

        <section className={s.boardSection}>
          <div className={s.boardContainer}>
            {renderRow('opponent', 'Соперник', opponentSlots, otherIndex)}
            {renderRow('my', 'Ваш ряд', mySlots, myIndex)}
          </div>
        </section>

        <section className={s.cardTray} aria-label="Карты">
          <div className={s.cardTrayScroll}>
            {ALL_CARD_IDS.map((cardId) => {
              const needsTarget = !NO_TARGET_CARDS.has(cardId)
              const enabled =
                canPickCards && (!needsTarget || selectedTarget !== null)
              return (
                <button
                  key={cardId}
                  type="button"
                  className={`${s.cardTrayItem}${enabled ? ` ${s.cardTrayItemReady}` : ''}`}
                  disabled={!enabled}
                  onClick={() => onPlayCard(cardId)}
                  title={cardId}
                >
                  <img src={getCardImageUrl(cardId)} alt={cardId} draggable={false} />
                </button>
              )
            })}
          </div>
        </section>
      </main>

      {needsInput?.need === 'face' && (
        <DiceChoiceModal
          title="Выберите грань"
          options={toDiceOptions(needsInput.faces)}
          onSelect={(dice) => {
            cardInput({ face: diceFaceOf(dice) })
          }}
          // Пока карта ждёт ввода, сервер игнорирует selectTarget — закрыть
          // без выбора не даём, ввод обязателен для продолжения игры.
          onClose={() => {}}
        />
      )}

      {cantPlay !== null && (
        <Modal title="Невозможно сыграть карту" onClose={dismissCantPlay}>
          <p className={s.modalText}>{CANT_PLAY_REASONS[cantPlay] ?? cantPlay}</p>
          <div className={s.modalActions}>
            <Button type="primary" onClick={dismissCantPlay}>Понятно</Button>
          </div>
        </Modal>
      )}

      {menuOpen && (
        <Modal title="Меню" onClose={() => setMenuOpen(false)}>
          <div className={s.menuModalContent}>
            <button
              type="button"
              className={s.menuModalItem}
              onClick={() => {
                setMenuOpen(false)
                setRulesOpen(true)
              }}
            >
              Правила
            </button>
            <button
              type="button"
              className={`${s.menuModalItem} ${s.menuModalItemDanger}`}
              onClick={() => {
                giveUp()
                navigate('/')
              }}
            >
              Сдаться
            </button>
          </div>
        </Modal>
      )}

      {rulesOpen && (
        <Modal title="Правила" wide onClose={() => setRulesOpen(false)}>
          <RulesFrame />
        </Modal>
      )}

      {ended && (
        <Modal title={ended.winnerId === myId ? 'Победа' : 'Поражение'} onClose={() => {}}>
          <p className={s.modalText}>
            {ended.winnerId === myId
              ? 'Ваш ряд совпал с целью.'
              : `Победил ${nicknameOf(ended.winnerId)}.`}
          </p>
          <div className={s.modalActions}>
            <Button type="secondary" onClick={() => navigate('/')}>На главную</Button>
            <Button type="primary" onClick={restart}>Ещё раз</Button>
          </div>
        </Modal>
      )}
    </>
  )
}
