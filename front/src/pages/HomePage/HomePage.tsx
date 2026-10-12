import { useSyncExternalStore, useState } from "react";
import { Button } from "../../components/Button/Button";
import { Modal } from "../../components/Modal/Modal";
import s from "./HomePage.module.css";
import { Bell } from "lucide-react";
import { getConnectionState, subscribeConnection } from "../../api/connection";
import { getInvitesState, invitePlayer, subscribeInvites } from "../../api/invites";
import { cubitCountLabel } from "../../lib/plural";
import type { OnlineUser } from "../../api/events";
import { QUBIT_COUNT_OPTIONS, type QubitCount } from "../../types/qubitDemo";
import { useNavigate } from "react-router-dom";

export const HomePage = () => {
    const [openModal, setOpenModal] = useState(false);
    const [selectedUser, setSelectedUser] = useState<OnlineUser | null>(null);
    const [qubitCount, setQubitCount] = useState<QubitCount>(4);
    const navigate = useNavigate();

    const { userId, onlineUsers } = useSyncExternalStore(subscribeConnection, getConnectionState);
    const { incoming } = useSyncExternalStore(subscribeInvites, getInvitesState);
    const myName = onlineUsers.find((user) => user.id === userId)?.name ?? '';
    const otherUsers = onlineUsers.filter((user) => user.id !== userId);
    const hasInvites = incoming.length > 0;

    const handleModal = (user: OnlineUser) => {
        setOpenModal(true);
        setSelectedUser(user);
    };

    const handleInvite = () => {
        if (!selectedUser || userId === null) return;
        const sent = invitePlayer(selectedUser.id, qubitCount);
        if (sent) setOpenModal(false);
    };

    return (
        <>
          <header className={s.header}>
            <div className={s.username}>
                <div className={s.avatar}>
                    <svg xmlns="http://www.w3.org/2000/svg"
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#FFFFFF"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round">
                        <path d="M11.25,17.25h1.5L12,18z"/>
                        <path d="m15,12 l2,2"/>
                        <path d="M18,6.5a0.5,0.5 0,0 0,-0.5 -0.5"/>
                        <path d="M20.69,9.67a4.5,4.5 0,1 0,-7.04 -5.5,8.35 8.35,0 0,0 -3.3,0 4.5,4.5 0,1 0,-7.04 5.5C2.49,11.2 2,12.88 2,14.5 2,19.47 6.48,22 12,22s10,-2.53 10,-7.5c0,-1.62 -0.48,-3.3 -1.3,-4.83"/>
                        <path d="M6,6.5a0.495,0.495 0,0 1,0.5 -0.5"/>
                        <path d="m9,12 l-2,2"/>
                    </svg>
                </div>
                <span className={s.usernameText}>{myName}</span>
            </div>
            <div className={s.bell} onClick={() => navigate('/notifications')}>
                {hasInvites && (
                    <div className={s.newNotification}/>
                )}
                <Bell />
            </div>
          </header>

          <main className={s.users}>
            {otherUsers.length > 0 ?
                otherUsers.map((user) => (
                    <div className={s.user} key={user.id} onClick={() => handleModal(user)}>
                        <div className={s.userInfo}>
                            <div className={s.avatar}>
                                <svg xmlns="http://www.w3.org/2000/svg"
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="#FFFFFF"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round">
                                    <path d="M11.25,17.25h1.5L12,18z"/>
                                    <path d="m15,12 l2,2"/>
                                    <path d="M18,6.5a0.5,0.5 0,0 0,-0.5 -0.5"/>
                                    <path d="M20.69,9.67a4.5,4.5 0,1 0,-7.04 -5.5,8.35 8.35,0 0,0 -3.3,0 4.5,4.5 0,1 0,-7.04 5.5C2.49,11.2 2,12.88 2,14.5 2,19.47 6.48,22 12,22s10,-2.53 10,-7.5c0,-1.62 -0.48,-3.3 -1.3,-4.83"/>
                                    <path d="M6,6.5a0.495,0.495 0,0 1,0.5 -0.5"/>
                                    <path d="m9,12 l-2,2"/>
                                </svg>
                            </div>
                            <span>{user.name}</span>
                        </div>
                        <div className={s.status}/>
                    </div>
                )) : (
                <div className={s.noUsers}>
                    <span className={s.noUsersText}>Нет активных пользователей</span>
                </div>
            )}
          </main>

          {openModal && selectedUser && (
            <Modal title="Пригласить в игру" onClose={() => setOpenModal(false)}>
                <div className={s.modalContent}>
                    <span className={s.modalInfo}>Отправить приглашение</span>
                    <span className={s.modalUsername}>{selectedUser.name}</span>
                </div>
                <div className={s.difficultyBlock}>
                    <span className={s.difficultyLabel}>Сложность</span>
                    <span className={s.difficultyHint}>{cubitCountLabel(qubitCount)} на поле</span>
                    <div className={s.difficultyRow}>
                        {QUBIT_COUNT_OPTIONS.map((n) => (
                            <button
                                key={n}
                                type="button"
                                className={`${s.difficultyBtn} ${qubitCount === n ? s.difficultyBtnActive : ''}`}
                                onClick={() => setQubitCount(n)}
                            >
                                {n}
                            </button>
                        ))}
                    </div>
                </div>
                <div className={s.modalButtons}>
                    <Button type="secondary" onClick={() => setOpenModal(false)}>Отмена</Button>
                    <Button type="primary" onClick={handleInvite}>
                        Пригласить
                    </Button>
                </div>
                {userId === null && (
                    <span className={s.modalInfo}>Нет связи с сервером — подождите подключения.</span>
                )}
            </Modal>
          )}
        </>
    );
};
