import React, { createContext, useContext, useReducer, ReactNode, useEffect, useCallback } from 'react';
import { eventBus } from '../utils/EventBus';

interface Player {
  id: string;
  name: string;
  score: number;
  isOnline?: boolean;
  lastSeen?: Date;
}

interface ChatMessage {
  id: string;
  playerName: string;
  message: string;
  timestamp: Date;
}

// StatusCard interface'ini ekle
export interface StatusCard {
  id: string;
  text: string;
  category: string;
  categoryKey: string;
  difficulty?: string;
}

// Mevcut interface'lere ekle:
export interface Meme {
  id: string;
  playerId: string;
  playerName: string;
  topText?: string;     // eski format için opsiyonel
  bottomText?: string;  // eski format için opsiyonel
  template?: number;    // eski format için opsiyonel
  imageData?: string;   // yeni format (canvas export)
  isImageMeme?: boolean;
  votes: number;
}

export interface GameSettings {
  maxRounds: number;
  memeCreationTime: number; // dakika
  votingTime: number; // saniye
  minPlayers: number;
  maxPlayers: number;
  minPlayersEnabled: boolean;
  maxPlayersEnabled: boolean;
  enabledCategories: string[];
}

export interface GameState {
  roomCode: string;
  players: Player[];
  currentPlayer: Player | null;
  gameState: 'waiting' | 'playing' | 'meme-creation' | 'voting' | 'results' | 'finished';
  currentRound: number;
  maxRounds: number;
  currentJudge: Player | null;
  situationCard: StatusCard | null;
  memes: Meme[];
  scores: { [playerId: string]: number };
  finalScores?: { player: Player; score: number }[];
  timeLeft: number;
  chatHistory: ChatMessage[];
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting';
  lastSync: Date | null;
  gameSettings: GameSettings;
}

// Real-time sync için state yükle
const loadStateFromStorage = (): Partial<GameState> => {
  try {
    const savedState = localStorage.getItem('mimclash-game-state');
    if (savedState) {
      const parsed = JSON.parse(savedState);
      // Timestamp'leri Date objesine çevir
      if (parsed.lastSync) {
        parsed.lastSync = new Date(parsed.lastSync);
      }
      return parsed;
    }
  } catch (error) {
    console.error('localStorage okuma hatası:', error);
  }
  return {};
};

// Real-time sync için state kaydet
const saveStateToStorage = (state: GameState) => {
  try {
    const stateToSave = {
      roomCode: state.roomCode,
      currentPlayer: state.currentPlayer,
      gameState: state.gameState,
      currentRound: state.currentRound,
      maxRounds: state.maxRounds,
      currentJudge: state.currentJudge,
      situationCard: state.situationCard,
      scores: state.scores,
      lastSync: new Date(),
      connectionStatus: state.connectionStatus
    };
    localStorage.setItem('mimclash-game-state', JSON.stringify(stateToSave));
    
    // Chat history'yi ayrı kaydet
    if (state.chatHistory && state.chatHistory.length > 0) {
      localStorage.setItem(`mimclash-chat-${state.roomCode}`, JSON.stringify(state.chatHistory.slice(-100)));
    }
  } catch (error) {
    console.error('localStorage yazma hatası:', error);
  }
};

const initialState: GameState = {
  roomCode: '',
  players: [],
  currentPlayer: null,
  gameState: 'waiting',
  currentRound: 0,
  maxRounds: 5,
  currentJudge: null,
  situationCard: null,
  memes: [],
  scores: {},
  timeLeft: 0,
  chatHistory: [],
  connectionStatus: 'disconnected',
  lastSync: null,
  gameSettings: {
    maxRounds: 5,
    memeCreationTime: 3,
    votingTime: 60,
    minPlayers: 3,
    maxPlayers: 8,
    minPlayersEnabled: true,
    maxPlayersEnabled: true,
    enabledCategories: ['work', 'traffic', 'relationship', 'technology', 'entertainment', 'daily']
  }
};

type GameAction =
  | { type: 'SET_ROOM_CODE'; payload: string }
  | { type: 'SET_PLAYERS'; payload: Player[] }
  | { type: 'SET_CURRENT_PLAYER'; payload: Player }
  | { type: 'SET_GAME_STATE'; payload: GameState['gameState'] }
  | { type: 'SET_ROUND_INFO'; payload: { round: number; maxRounds: number; judge: Player | null; situationCard: StatusCard | null } }
  | { type: 'SET_CURRENT_ROUND'; payload: number }
  | { type: 'SET_MAX_ROUNDS'; payload: number }
  | { type: 'SET_SITUATION_CARD'; payload: StatusCard | null }
  | { type: 'SET_MEMES'; payload: Meme[] }
  | { type: 'SET_SCORES'; payload: Record<string, number> }
  | { type: 'SET_TIME_LEFT'; payload: number }
  | { type: 'SET_CHAT_HISTORY'; payload: ChatMessage[] }
  | { type: 'ADD_CHAT_MESSAGE'; payload: ChatMessage }
  | { type: 'SET_CONNECTION_STATUS'; payload: 'connected' | 'disconnected' | 'reconnecting' }
  | { type: 'SET_GAME_SETTINGS'; payload: GameSettings }
  | { type: 'SYNC_STATE'; payload: Partial<GameState> }
  | { type: 'RESET_GAME' };

const gameReducer = (state: GameState, action: GameAction): GameState => {
  let newState: GameState;
  
  switch (action.type) {
    case 'SET_ROOM_CODE':
      newState = { ...state, roomCode: action.payload };
      break;
    case 'SET_PLAYERS':
      newState = { ...state, players: action.payload };
      break;
    case 'SET_CURRENT_PLAYER':
      newState = { ...state, currentPlayer: action.payload };
      break;
    case 'SET_GAME_STATE':
      newState = { ...state, gameState: action.payload };
      break;
    case 'SET_ROUND_INFO':
      newState = {
        ...state,
        currentRound: action.payload.round,
        maxRounds: action.payload.maxRounds,
        currentJudge: action.payload.judge,
        situationCard: action.payload.situationCard
      };
      break;
    case 'SET_CURRENT_ROUND':
      newState = { ...state, currentRound: action.payload };
      break;
    case 'SET_MAX_ROUNDS':
      newState = { ...state, maxRounds: action.payload };
      break;
    case 'SET_SITUATION_CARD':
      newState = { ...state, situationCard: action.payload };
      break;
    case 'SET_MEMES':
      newState = { ...state, memes: action.payload };
      break;
    case 'SET_SCORES':
      newState = { ...state, scores: action.payload };
      break;
    case 'SET_TIME_LEFT':
      newState = { ...state, timeLeft: action.payload };
      break;
    case 'SET_CHAT_HISTORY':
      newState = { ...state, chatHistory: action.payload };
      break;
    case 'ADD_CHAT_MESSAGE':
      newState = { 
        ...state, 
        chatHistory: [...state.chatHistory, action.payload].slice(-100) 
      };
      break;
    case 'SET_CONNECTION_STATUS':
      newState = { ...state, connectionStatus: action.payload };
      break;
    case 'SET_GAME_SETTINGS':
      newState = { ...state, gameSettings: action.payload };
      break;
    case 'SYNC_STATE':
      newState = { 
        ...state, 
        ...action.payload, 
        lastSync: new Date() 
      };
      break;
    case 'RESET_GAME':
      localStorage.removeItem('mimclash-game-state');
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('mimclash-chat-')) {
          localStorage.removeItem(key);
        }
      });
      newState = {
        ...initialState,
        connectionStatus: state.connectionStatus
      };
      break;
    default:
      return state;
  }
  
  // Her state değişikliğinde localStorage'a kaydet ve event emit et
  saveStateToStorage(newState);
  eventBus.emit('game-state-changed', { action: action.type, state: newState });
  
  return newState;
};

const GameContext = createContext<{
  state: GameState;
  dispatch: React.Dispatch<GameAction>;
  syncState: (data: Partial<GameState>) => void;
} | null>(null);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(gameReducer, initialState);

  // Real-time sync function
  const syncState = useCallback((data: Partial<GameState>) => {
    dispatch({ type: 'SYNC_STATE', payload: data });
  }, []);

  // Sayfa yüklendiğinde localStorage'dan state'i yükle
  useEffect(() => {
    const savedState = loadStateFromStorage();
    if (savedState && Object.keys(savedState).length > 0) {
      console.log('📦 localStorage\'dan state yükleniyor:', savedState);
      syncState(savedState);
    }
  }, [syncState]);

  // Event Bus listener'ları
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Connection status değişikliklerini dinle
    unsubscribers.push(
      eventBus.on('connection-status-changed', (status: 'connected' | 'disconnected' | 'reconnecting') => {
        dispatch({ type: 'SET_CONNECTION_STATUS', payload: status });
      })
    );

    // Server'dan gelen sync event'lerini dinle
    unsubscribers.push(
      eventBus.on('server-sync', (data: Partial<GameState>) => {
        syncState(data);
      })
    );

    // Game settings güncellemelerini dinle
    unsubscribers.push(
      eventBus.on('game-settings-updated', (gameSettings: GameSettings) => {
        console.log('⚙️ GameContext: Oyun ayarları güncellendi:', gameSettings);
        console.log('🔧 DEBUG: GameContext - Gelen votingTime:', gameSettings.votingTime);
        dispatch({ type: 'SET_GAME_SETTINGS', payload: gameSettings });
      })
    );

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [syncState]);

  return (
    <GameContext.Provider value={{ state, dispatch, syncState }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
};