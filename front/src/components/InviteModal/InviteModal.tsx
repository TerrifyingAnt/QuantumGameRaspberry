import { useSyncExternalStore } from 'react'
import { Button } from '../Button/Button'
import { Modal } from '../Modal/Modal'
import {
  dismissInviteStatus,
  getInvitesState,
  respondToInvite,
  subscribeInvites,
} from '../../api/invites'
import { cubitCountLabel } from '../../lib/plural'
import s from './InviteModal.module.css'

/** Глобальные модалки входящего приглашения и статуса исходящего. */
export const InviteModal = () => {
  const { incoming, statusMessage } = useSyncExternalStore(subscribeInvites, getInvitesState)
  const top = incoming[0] ?? null

  if (top) {
    return (
      <Modal title="Приглашение в игру" onClose={() => respondToInvite(top.from, false)}>
        <p className={s.text}>
          <strong>{top.fromName}</strong> предлагает сыграть
        </p>
        <p className={s.hint}>{cubitCountLabel(top.cubitCount)} на поле</p>
        <div className={s.actions}>
          <Button type="secondary" onClick={() => respondToInvite(top.from, false)}>
            Отказаться
          </Button>
          <Button type="primary" onClick={() => respondToInvite(top.from, true)}>
            Согласиться
          </Button>
        </div>
      </Modal>
    )
  }

  if (statusMessage) {
    return (
      <Modal title="Приглашение" onClose={dismissInviteStatus}>
        <p className={s.text}>{statusMessage}</p>
        <div className={s.actions}>
          <Button type="primary" onClick={dismissInviteStatus}>
            Понятно
          </Button>
        </div>
      </Modal>
    )
  }

  return null
}
