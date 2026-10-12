import type { AuthorizedUser, GameHistoryItem } from '../types/profile'

export const MOCK_PROFILE: AuthorizedUser = {
  id: 1,
  email: 'player@example.com',
  league: 'SILVER_III',
  nickname: 'Алексей',
  ratingPoints: 756,
  winsAmount: 18,
  gamesPlayed: 42,
  createdAt: '2026-01-15T00:00:00',
}

export const MOCK_HISTORY: GameHistoryItem[] = [
  {
    isWinner: true,
    opponentNickname: 'NeoQubit',
    totalMoves: 12,
    ratingChange: 24,
    playedAt: '2026-08-27T18:30:00',
  },
  {
    isWinner: false,
    opponentNickname: 'QuantumFox',
    totalMoves: 8,
    ratingChange: -11,
    playedAt: '2026-08-26T14:10:00',
  },
  {
    isWinner: true,
    opponentNickname: 'Guest-7f3a',
    totalMoves: 15,
    ratingChange: 18,
    playedAt: '2026-08-25T09:45:00',
  },
]
