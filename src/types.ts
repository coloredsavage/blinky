export enum GameMode {
  None,
  SinglePlayer,
  Multiplayer,
  Global,
}

export interface PlayerState {
  username: string;
  isReady: boolean;
  isHost: boolean;
  score: number;
}

export enum GameStatus {
    Idle,
    Countdown,
    Playing,
    GameOver,
}

export type PeerData = 
    | { type: 'USER_INFO'; payload: { username: string } }
    | { type: 'READY_STATE'; payload: { isReady: boolean } }
    | { type: 'START_GAME' }
    | { type: 'BLINK' } // Sender is always the one who blinked, payload is not needed.
    | { type: 'REMATCH_REQUEST' }
    | { type: 'REMATCH_ACCEPT' };