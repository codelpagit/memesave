import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import useSocket from '../hooks/useSocket';
import { useGame } from '../context/GameContext';
import { eventBus } from '../utils/EventBus';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ChatMessage {
  id: string;
  playerName: string;
  message: string;
  timestamp: Date;
}

const GameLobby: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const { state, dispatch, syncState } = useGame();
  const [isHost, setIsHost] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const lastSyncRef = useRef<Date>(new Date());

  // Auto-scroll chat to bottom
  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Real-time event listeners
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Chat message received
    unsubscribers.push(
      eventBus.on('chat-message-received', (message: ChatMessage) => {
        dispatch({ type: 'ADD_CHAT_MESSAGE', payload: message });
        scrollToBottom();
      })
    );

    // Player joined
    unsubscribers.push(
      eventBus.on('player-joined', (player: any) => {
        if (state.currentPlayer && player.id !== state.currentPlayer.id) {
          toast.success(`${player.name} odaya katıldı! 🎉`);
        }
      })
    );

    // Player left
    unsubscribers.push(
      eventBus.on('player-left', (data: any) => {
        toast(`${data.playerName} odadan ayrıldı`, {
          icon: 'ℹ️',
          style: {
            background: '#3b82f6',
            color: '#fff',
          },
        });
      })
    );

    // Game started
    unsubscribers.push(
      eventBus.on('game-started', (data: any) => {
        navigate(`/game/${roomCode}`);
      })
    );

    // Round started - oyun gerçekten başladığında
    unsubscribers.push(
      eventBus.on('round-started', (data: any) => {
        console.log('🎯 Round başladı, Game sayfasına yönlendiriliyor:', data);
        navigate(`/game/${roomCode}`);
      })
    );

    // Socket errors
    unsubscribers.push(
      eventBus.on('socket-error', (error: any) => {
        toast.error(error.message || error);
        if (error.code === 'ROOM_NOT_FOUND') {
          navigate('/');
        }
      })
    );

    // Game settings updated
    unsubscribers.push(
      eventBus.on('game-settings-updated', (gameSettings: any) => {
        console.log('🎮 Oyun ayarları güncellendi:', gameSettings);
        dispatch({ type: 'SET_GAME_SETTINGS', payload: gameSettings });
      })
    );

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [dispatch, navigate, roomCode, state.currentPlayer, scrollToBottom]);

  // Initial room info request
  useEffect(() => {
    if (!socket || !roomCode || !isConnected) return;

    console.log('🔗 Room bilgileri isteniyor...');
    const playerInfo = state.currentPlayer ? {
      id: state.currentPlayer.id,
      name: state.currentPlayer.name
    } : null;
    
    socket.emit('get-room-info', { roomCode, playerInfo });
  }, [socket, roomCode, isConnected, state.currentPlayer]);

  // Host kontrolü
  useEffect(() => {
    if (state.players.length > 0 && state.currentPlayer) {
      const newIsHost = state.players[0].id === state.currentPlayer.id;
      console.log('🔍 Host kontrolü:', {
        players: state.players,
        currentPlayer: state.currentPlayer,
        firstPlayerId: state.players[0]?.id,
        currentPlayerId: state.currentPlayer?.id,
        isHost: newIsHost
      });
      setIsHost(newIsHost);
    }
  }, [state.players, state.currentPlayer]);

  // Host kontrolü - NAME BASED
  useEffect(() => {
    if (state.players.length > 0 && state.currentPlayer) {
      // Sadece name ile kontrol et
      const newIsHost = state.players[0].name === state.currentPlayer.name;
      console.log('🔍 Name-based host kontrolü:', {
        firstPlayerName: state.players[0].name,
        currentPlayerName: state.currentPlayer.name,
        isHost: newIsHost
      });
      setIsHost(newIsHost);
    }
  }, [state.players, state.currentPlayer]);

  // Auto-scroll when chat updates
  useEffect(() => {
    scrollToBottom();
  }, [state.chatHistory, scrollToBottom]);

  // Periodic sync check
  useEffect(() => {
    if (!socket || !roomCode || !isConnected) return;

    const syncInterval = setInterval(() => {
      const now = new Date();
      const timeSinceLastSync = now.getTime() - lastSyncRef.current.getTime();
      
      // 30 saniyede bir sync kontrolü
      if (timeSinceLastSync > 30000) {
        console.log('🔄 Periodic sync check...');
        socket.emit('get-room-info', { 
          roomCode, 
          playerInfo: state.currentPlayer ? {
            id: state.currentPlayer.id,
            name: state.currentPlayer.name
          } : null 
        });
        lastSyncRef.current = now;
      }
    }, 30000);

    return () => clearInterval(syncInterval);
  }, [socket, roomCode, isConnected, state.currentPlayer]);

  const startGame = useCallback(() => {
    if (!socket || !roomCode) return;
    
    const minPlayers = state.gameSettings?.minPlayersEnabled ? state.gameSettings.minPlayers : 3;
    if (state.players.length < minPlayers) {
      toast.error(`Oyunu başlatmak için en az ${minPlayers} oyuncu gerekli!`);
      return;
    }

    socket.emit('start-game', { roomCode });
  }, [socket, roomCode, state.players.length, state.gameSettings]);

  const updateGameSetting = useCallback((setting: string, value: any) => {
    if (!isHost || !socket || !roomCode) return;
    
    console.log('🔧 DEBUG: updateGameSetting çağrıldı');
    console.log('🔧 DEBUG: setting:', setting, 'value:', value);
    console.log('🔧 DEBUG: Mevcut gameSettings:', state.gameSettings);
    
    // Yeni ayarları hesapla
    const newSettings = {
      ...state.gameSettings,
      [setting]: value
    };
    
    console.log('🎮 Yeni ayarlar gönderiliyor:', newSettings);
    console.log('🔧 DEBUG: votingTime değeri:', newSettings.votingTime);
    
    socket.emit('update-game-settings', {
      roomCode,
      settings: newSettings
    });
  }, [isHost, socket, roomCode, state.gameSettings]);

  const leaveRoom = useCallback(() => {
    if (socket && roomCode) {
      socket.emit('leave-room');
      dispatch({ type: 'RESET_GAME' });
      navigate('/');
    }
  }, [socket, roomCode, dispatch, navigate]);

  const sendMessage = useCallback(() => {
    if (!socket || !newMessage.trim() || !state.currentPlayer) return;
    
    socket.emit('send-lobby-message', {
      roomCode,
      message: newMessage.trim(),
      playerName: state.currentPlayer.name
    });
    setNewMessage('');
    setIsTyping(false);
  }, [socket, newMessage, state.currentPlayer, roomCode]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  }, [sendMessage]);

  const handleMessageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    setIsTyping(e.target.value.length > 0);
  }, []);

  // Connection status indicator
  const getConnectionStatusColor = () => {
    switch (state.connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'reconnecting': return 'bg-yellow-500';
      case 'disconnected': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getConnectionStatusText = () => {
    switch (state.connectionStatus) {
      case 'connected': return 'Bağlı';
      case 'reconnecting': return 'Yeniden bağlanıyor...';
      case 'disconnected': return 'Bağlantı kesildi';
      default: return 'Bilinmiyor';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-6xl">
        {/* Connection Status Bar */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${getConnectionStatusColor()}`}></div>
            <span className="text-sm text-gray-600">{getConnectionStatusText()}</span>
          </div>
          {state.lastSync && (
            <span className="text-xs text-gray-500">
              Son sync: {state.lastSync.toLocaleTimeString('tr-TR')}
            </span>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Sol Taraf - Lobby İçeriği */}
          <div>
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">Oyun Lobisi</h1>
              <div className="bg-gray-100 rounded-lg p-4 mb-4">
                <p className="text-sm text-gray-600 mb-1">Oda Kodu</p>
                <p className="text-2xl font-bold text-purple-600">{roomCode}</p>
              </div>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Oyuncular ({state.players.length})</h2>
              <div className="space-y-2">
                {state.players.map((player, index) => (
                  <div key={player.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{player.name}</span>
                      {index === 0 && (
                        <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded-full">
                          Host
                        </span>
                      )}
                      {state.currentPlayer && (
                        player.id === state.currentPlayer.id || player.name === state.currentPlayer.name
                      ) && (
                        <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
                          Sen
                        </span>
                      )}
                      {player.isOnline !== undefined && (
                        <div className={`w-2 h-2 rounded-full ${
                          player.isOnline ? 'bg-green-400' : 'bg-gray-400'
                        }`} title={player.isOnline ? 'Online' : 'Offline'}></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">Oyun Ayarları {isHost && <span className="text-xs bg-purple-100 text-purple-600 px-2 py-1 rounded">Host</span>}</h3>
              
              {isHost ? (
                <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                  {/* Maksimum Round */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Maksimum Round:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateGameSetting('maxRounds', Math.max(3, state.gameSettings?.maxRounds - 1))}
                        className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        disabled={(state.gameSettings?.maxRounds || 5) <= 3}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <span className="font-medium w-8 text-center">{state.gameSettings?.maxRounds || 5}</span>
                      <button
                        onClick={() => updateGameSetting('maxRounds', Math.min(10, (state.gameSettings?.maxRounds || 5) + 1))}
                        className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        disabled={(state.gameSettings?.maxRounds || 5) >= 10}
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Meme Oluşturma Süresi */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Meme Oluşturma Süresi:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateGameSetting('memeCreationTime', Math.max(1, (state.gameSettings?.memeCreationTime || 2) - 1))}
                        className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        disabled={(state.gameSettings?.memeCreationTime || 2) <= 1}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <span className="font-medium w-12 text-center">{state.gameSettings?.memeCreationTime || 2} dk</span>
                      <button
                        onClick={() => updateGameSetting('memeCreationTime', Math.min(5, (state.gameSettings?.memeCreationTime || 2) + 1))}
                        className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        disabled={(state.gameSettings?.memeCreationTime || 2) >= 5}
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Oylama Süresi */}
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Oylama Süresi:</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateGameSetting('votingTime', Math.max(30, (state.gameSettings?.votingTime || 60) - 15))}
                        className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        disabled={(state.gameSettings?.votingTime || 60) <= 30}
                      >
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <span className="font-medium w-12 text-center">{state.gameSettings?.votingTime || 60}s</span>
                      <button
                        onClick={() => updateGameSetting('votingTime', Math.min(180, (state.gameSettings?.votingTime || 60) + 15))}
                        className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        disabled={(state.gameSettings?.votingTime || 60) >= 180}
                      >
                        <ChevronUp className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  
                  {/* Minimum Oyuncu */}
                   <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2">
                       <span className="text-sm text-gray-600">Minimum Oyuncu:</span>
                       <button
                         onClick={() => updateGameSetting('minPlayersEnabled', !(state.gameSettings?.minPlayersEnabled ?? true))}
                         className={`w-8 h-4 rounded-full transition-colors relative ${
                           (state.gameSettings?.minPlayersEnabled ?? true) ? 'bg-purple-600' : 'bg-gray-300'
                         }`}
                       >
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${
                           (state.gameSettings?.minPlayersEnabled ?? true) ? 'translate-x-4' : 'translate-x-0.5'
                         }`} />
                       </button>
                     </div>
                     {(state.gameSettings?.minPlayersEnabled ?? true) && (
                       <div className="flex items-center gap-2">
                         <button
                           onClick={() => updateGameSetting('minPlayers', Math.max(2, (state.gameSettings?.minPlayers || 3) - 1))}
                           className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                           disabled={(state.gameSettings?.minPlayers || 3) <= 2}
                         >
                           <ChevronDown className="w-3 h-3" />
                         </button>
                         <span className="font-medium w-8 text-center">{state.gameSettings?.minPlayers || 3}</span>
                         <button
                           onClick={() => updateGameSetting('minPlayers', Math.min(6, (state.gameSettings?.minPlayers || 3) + 1))}
                           className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                           disabled={(state.gameSettings?.minPlayers || 3) >= 6}
                         >
                           <ChevronUp className="w-3 h-3" />
                         </button>
                       </div>
                     )}
                   </div>
                   
                   {/* Maksimum Oyuncu */}
                   <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2">
                       <span className="text-sm text-gray-600">Maksimum Oyuncu:</span>
                       <button
                         onClick={() => updateGameSetting('maxPlayersEnabled', !(state.gameSettings?.maxPlayersEnabled ?? true))}
                         className={`w-8 h-4 rounded-full transition-colors relative ${
                           (state.gameSettings?.maxPlayersEnabled ?? true) ? 'bg-purple-600' : 'bg-gray-300'
                         }`}
                       >
                         <div className={`w-3 h-3 bg-white rounded-full absolute top-0.5 transition-transform ${
                           (state.gameSettings?.maxPlayersEnabled ?? true) ? 'translate-x-4' : 'translate-x-0.5'
                         }`} />
                       </button>
                     </div>
                     {(state.gameSettings?.maxPlayersEnabled ?? true) && (
                       <div className="flex items-center gap-2">
                         <button
                           onClick={() => updateGameSetting('maxPlayers', Math.max(4, (state.gameSettings?.maxPlayers || 8) - 1))}
                           className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                           disabled={(state.gameSettings?.maxPlayers || 8) <= 4}
                         >
                           <ChevronDown className="w-3 h-3" />
                         </button>
                         <span className="font-medium w-8 text-center">{state.gameSettings?.maxPlayers || 8}</span>
                         <button
                           onClick={() => updateGameSetting('maxPlayers', Math.min(8, (state.gameSettings?.maxPlayers || 8) + 1))}
                           className="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                           disabled={(state.gameSettings?.maxPlayers || 8) >= 8}
                         >
                           <ChevronUp className="w-3 h-3" />
                         </button>
                       </div>
                     )}
                   </div>
                   
                   {/* Durum Kartı Kategorileri */}
                   <div className="border-t pt-4 mt-4">
                     <div className="mb-3">
                       <span className="text-sm text-gray-600 font-medium">Durum Kartı Kategorileri:</span>
                     </div>
                     <div className="grid grid-cols-2 gap-2">
                       {[
                         { id: 'work', name: 'İş', emoji: '💼' },
                         { id: 'traffic', name: 'Trafik', emoji: '🚗' },
                         { id: 'relationship', name: 'İlişki', emoji: '💕' },
                         { id: 'technology', name: 'Teknoloji', emoji: '💻' },
                         { id: 'entertainment', name: 'Eğlence', emoji: '🎮' },
                         { id: 'daily', name: 'Günlük', emoji: '🏠' }
                       ].map((category) => {
                         const isEnabled = (state.gameSettings?.enabledCategories || ['work', 'traffic', 'relationship', 'technology', 'entertainment', 'daily']).includes(category.id);
                         return (
                           <label key={category.id} className="flex items-center space-x-2 cursor-pointer">
                             <input
                               type="checkbox"
                               checked={isEnabled}
                               onChange={(e) => {
                                 const currentCategories = state.gameSettings?.enabledCategories || ['work', 'traffic', 'relationship', 'technology', 'entertainment', 'daily'];
                                 const newCategories = e.target.checked 
                                   ? [...currentCategories, category.id]
                                   : currentCategories.filter(c => c !== category.id);
                                 updateGameSetting('enabledCategories', newCategories);
                               }}
                               className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                             />
                             <span className="text-sm">{category.emoji} {category.name}</span>
                           </label>
                         );
                       })}
                     </div>
                   </div>
                </div>
              ) : (
                <div className="bg-gray-50 rounded-lg p-4">
                   <p className="text-sm text-gray-600">• Maksimum Round: {state.gameSettings?.maxRounds || 5}</p>
                   <p className="text-sm text-gray-600">• Meme Oluşturma Süresi: {state.gameSettings?.memeCreationTime || 2} dakika</p>
                   <p className="text-sm text-gray-600">• Oylama Süresi: {state.gameSettings?.votingTime || 60} saniye</p>
                   {(state.gameSettings?.minPlayersEnabled ?? true) && (
                     <p className="text-sm text-gray-600">• Minimum Oyuncu: {state.gameSettings?.minPlayers || 3}</p>
                   )}
                   {(state.gameSettings?.maxPlayersEnabled ?? true) && (
                     <p className="text-sm text-gray-600">• Maksimum Oyuncu: {state.gameSettings?.maxPlayers || 8}</p>
                   )}
                 </div>
              )}
            </div>

            <div className="flex space-x-4 mt-6">
              <button
                onClick={leaveRoom}
                className="flex-1 bg-red-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-red-600 transition-colors"
              >
                Odadan Ayrıl
              </button>
              
              {(() => {
                // Debug console.log'u burada çalıştır
                console.log('🎮 Buton render kontrolü:', {
                  isHost,
                  playersLength: state.players.length,
                  connectionStatus: state.connectionStatus,
                  shouldShowButton: isHost,
                  buttonDisabled: state.players.length < 3 || state.connectionStatus !== 'connected'
                });
                
                // isHost kontrolü
                return isHost ? (
                  <button
                    onClick={startGame}
                    disabled={state.players.length < 3 || state.connectionStatus !== 'connected'}
                    className="flex-1 bg-green-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    Oyunu Başlat
                  </button>
                ) : null;
              })()}
            </div>
          </div>

          {/* Sağ Taraf - Real-time Chat */}
          <div className="flex flex-col h-full">
            <h2 className="text-xl font-semibold mb-4">💬 Gerçek Zamanlı Sohbet</h2>
            
            {/* Chat Messages */}
            <div className="flex-1 bg-gray-50 rounded-lg p-4 mb-4 overflow-y-auto" style={{height: '400px', maxHeight: '400px'}}>
              {state.chatHistory.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <div className="text-4xl mb-2">💬</div>
                  <p>Henüz mesaj yok</p>
                  <p className="text-sm">İlk mesajı sen gönder!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {state.chatHistory.map((msg) => (
                    <div key={msg.id} className="bg-white rounded-lg p-3 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-purple-600">{msg.playerName}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(msg.timestamp).toLocaleTimeString('tr-TR', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <p className="text-gray-800">{msg.message}</p>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Chat Input */}
            <div className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={handleMessageChange}
                onKeyPress={handleKeyPress}
                placeholder="Mesajınızı yazın..."
                disabled={state.connectionStatus !== 'connected'}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                maxLength={200}
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim() || state.connectionStatus !== 'connected'}
                className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                📤
              </button>
            </div>
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-gray-500">
                {newMessage.length}/200 karakter
              </p>
              {isTyping && state.connectionStatus === 'connected' && (
                <p className="text-xs text-green-600">Yazıyor...</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GameLobby;
