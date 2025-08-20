import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { eventBus } from '../utils/EventBus';

const SOCKET_URL = 'http://localhost:8080';
const RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 2000;

const useSocket = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    console.log('🔌 Socket bağlantısı kuruluyor...');
    
    // localStorage'dan player bilgisini al
    const savedState = localStorage.getItem('gameState');
    let playerName = null;
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        playerName = parsed.currentPlayer?.name;
      } catch (e) {
        console.warn('localStorage parse hatası:', e);
      }
    }
    
    // useEffect içindeki socket oluşturma kısmı
    const newSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      // maxReconnectionAttempts: 5, // ❌ KALDIR
      query: {
        playerName: playerName || 'unknown'
      }
    });
    
    // Connection events
    newSocket.on('connect', () => {
      console.log('✅ Socket bağlandı:', newSocket.id);
      setIsConnected(true);
      reconnectAttempts.current = 0;
      eventBus.emit('connection-status-changed', 'connected');
      
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
        reconnectTimer.current = null;
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('❌ Socket bağlantısı kesildi:', reason);
      setIsConnected(false);
      eventBus.emit('connection-status-changed', 'disconnected');
      
      // Auto-reconnect logic
      if (reason === 'io server disconnect') {
        // Server tarafından kapatıldı, manuel reconnect gerekli
        attemptReconnect(newSocket);
      }
    });

    newSocket.on('connect_error', (error) => {
      console.error('🔥 Socket bağlantı hatası:', error);
      eventBus.emit('connection-status-changed', 'disconnected');
      attemptReconnect(newSocket);
    });

    // Real-time sync events
    newSocket.on('room-info', (data) => {
      console.log('📋 Room info sync:', data);
      
      eventBus.emit('server-sync', {
        players: data.players,
        gameState: data.gameState,
        currentRound: data.currentRound,
        maxRounds: data.maxRounds,
        chatHistory: data.chatHistory || [],
        gameSettings: data.gameSettings,
        situationCard: data.situationCard
      });
      
      // Eğer oyun durumu playing ise ve gameSettings varsa, timer'ı senkronize et
      if (data.gameState === 'playing' && data.gameSettings?.memeCreationTime && data.roundStartTime) {
        const memeCreationTimeSeconds = data.gameSettings.memeCreationTime * 60;
        const now = Date.now();
        const elapsed = Math.floor((now - data.roundStartTime) / 1000);
        const actualTimeLeft = Math.max(0, memeCreationTimeSeconds - elapsed);
        console.log(`⏰ Room info sync: Round başlangıcından ${elapsed} saniye geçti, kalan süre: ${actualTimeLeft} saniye`);
        eventBus.emit('set-timer', actualTimeLeft);
      } else if (data.gameState === 'playing' && data.gameSettings?.memeCreationTime) {
        // roundStartTime yoksa varsayılan süreyi kullan
        const memeCreationTimeSeconds = data.gameSettings.memeCreationTime * 60;
        eventBus.emit('set-timer', memeCreationTimeSeconds);
      }
    });

    newSocket.on('room-info-update', (data) => {
      console.log('🔄 Room info update sync:', data);
      eventBus.emit('server-sync', {
        players: data.players,
        gameState: data.gameState,
        chatHistory: data.chatHistory || []
      });
      
      if (data.newPlayer) {
        eventBus.emit('player-joined', data.newPlayer);
      }
    });

    newSocket.on('player-joined', (data) => {
      console.log('👥 Player joined sync:', data);
      eventBus.emit('server-sync', {
        players: data.players
      });
      eventBus.emit('player-joined', data.player);
    });

    newSocket.on('player-left', (data) => {
      console.log('👋 Player left sync:', data);
      eventBus.emit('server-sync', {
        players: data.players
      });
      eventBus.emit('player-left', data);
    });

    newSocket.on('lobby-message', (data) => {
      console.log('💬 Chat message sync:', data);
      eventBus.emit('chat-message-received', data);
    });

    newSocket.on('game-started', (data) => {
      console.log('🎮 Game started sync:', data);
      eventBus.emit('server-sync', {
        gameState: 'playing',
        currentRound: data.round,
        maxRounds: data.maxRounds,
        currentJudge: data.judge,
        situationCard: data.situationCard
      });
      eventBus.emit('game-started', data);
    });

    // YENİ: Round started event
    newSocket.on('round-started', (data) => {
      console.log('Round started:', data);
      
      eventBus.emit('round-started', data);
      
      // Server sync için gerekli verileri gönder - statusCards kaldırıldı, sadece situationCard kullanılıyor
      const syncData = {
        gameState: 'meme-creation',
        currentRound: data.round,
        maxRounds: data.maxRounds,
        situationCard: data.situationCard,
        memeCreationTime: data.memeCreationTime,
        roundEndTime: data.roundEndTime,
        timeLeft: data.memeCreationTime / 1000,
        isTimerActive: true
      };
      
      eventBus.emit('server-sync', syncData);
    });

    // Voting started event'ini güçlendir
    newSocket.on('voting-started', (data) => {
      console.log('🗳️ Oylama başladı:', data);
      console.log('🔧 DEBUG: Gelen votingTime:', data.votingTime);
      const votingTime = data.votingTime || 60;
      console.log('🔧 DEBUG: Kullanılacak votingTime:', votingTime);
      
      eventBus.emit('server-sync', {
        timeLeft: votingTime,
        isActive: true
      });
      eventBus.emit('voting-started', {
        memes: data.memes,
        totalMemes: data.totalMemes,
        playersCount: data.playersCount,
        votingTime: votingTime
      });
    });

    // YENİ: Round results event
    newSocket.on('round-results', (data) => {
      console.log('🏆 Round results:', data);
      eventBus.emit('server-sync', {
        gameState: 'results',
        memes: data.memes,
        scores: data.scores
      });
      eventBus.emit('round-results', data);
    });

    // YENİ: Game finished event
    newSocket.on('game-finished', (data) => {
      console.log('🎉 Game finished:', data);
      eventBus.emit('server-sync', {
        gameState: 'finished',
        finalScores: data.finalScores
      });
      eventBus.emit('game-finished', data);
    });

    newSocket.on('meme-submitted', (data) => {
      console.log('✅ Meme submitted successfully:', data);
      eventBus.emit('meme-submitted', data);
    });

    newSocket.on('error', (error) => {
      console.error('🚨 Socket error:', error);
      eventBus.emit('socket-error', error);
    });

    newSocket.on('game-settings-updated', (gameSettings) => {
      console.log('⚙️ Game settings updated:', gameSettings);
      eventBus.emit('game-settings-updated', gameSettings);
    });

    setSocket(newSocket);

    return () => {
      console.log('🧹 Socket temizleniyor...');
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
      newSocket.disconnect();
    };
  }, []);

  const attemptReconnect = (socketInstance: Socket) => {
    if (reconnectAttempts.current >= RECONNECT_ATTEMPTS) {
      console.log('❌ Maksimum reconnect denemesi aşıldı');
      eventBus.emit('connection-status-changed', 'disconnected');
      return;
    }

    reconnectAttempts.current++;
    eventBus.emit('connection-status-changed', 'reconnecting');
    
    console.log(`🔄 Reconnect denemesi ${reconnectAttempts.current}/${RECONNECT_ATTEMPTS}`);
    
    reconnectTimer.current = setTimeout(() => {
      socketInstance.connect();
    }, RECONNECT_DELAY * reconnectAttempts.current);
  };

  return { socket, isConnected };
};

export default useSocket;