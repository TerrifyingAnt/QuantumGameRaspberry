import { useSyncExternalStore } from 'react'
import s from './NotificationsPage.module.css'
import { Button } from '../../components/Button/Button'
import { ArrowLeft, Check, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getInvitesState, respondToInvite, subscribeInvites } from '../../api/invites'
import { cubitCountLabel } from '../../lib/plural'

export const NotificationsPage = () => {
  const navigate = useNavigate()
  const { incoming } = useSyncExternalStore(subscribeInvites, getInvitesState)

  return (
    <>
      <header className={s.header}>
        <div className={s.headerIconWrapper}>
          <div className={s.headerIconButton}>
            <ArrowLeft className={s.headerIcon} onClick={() => navigate('/')} />
          </div>
          <h2 className={s.headerTitle}>Приглашения</h2>
        </div>
      </header>
      <main className={s.notificationsWrapper}>
        {incoming.length > 0 ? (
          <div className={s.notificationsList}>
            {incoming.map((invite) => (
              <div className={s.notification} key={invite.from}>
                <div className={s.notificationInfo}>
                  <h3 className={s.notificationTitle}>{invite.fromName}</h3>
                  <p className={s.notificationText}>{cubitCountLabel(invite.cubitCount)} на поле</p>
                </div>
                <div className={s.notificationButtons}>
                  <Button type="secondary" onClick={() => respondToInvite(invite.from, false)}>
                    <X color="#F87171" size={18} />
                  </Button>
                  <Button type="secondary" onClick={() => respondToInvite(invite.from, true)}>
                    <Check color="#4ADE80" size={18} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={s.notificationsEmpty}>
            <p className={s.notificationsEmptyText}>Пока здесь ничего нет</p>
          </div>
        )}
      </main>
    </>
  )
}
