import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import useSocket from '../hooks/useSocket';
import { useGame } from '../context/GameContext';

const Home: React.FC = () => {
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket(); // ✅ Destructure correctly
  const { dispatch } = useGame();

  const createRoom = () => {
    if (!playerName.trim()) {
      toast.error('Lütfen isminizi girin!');
      return;
    }
    
    // ✅ Use isConnected instead of socket.connected
    if (!socket || !isConnected) {
      toast.error('Bağlantı kurulamadı! Lütfen sayfayı yenileyin.');
      return;
    }

    setIsCreating(true);
    console.log('🏠 Oda oluşturma isteği gönderiliyor:', playerName.trim());
    
    // ✅ Use socket directly (not socket.socket)
    socket.removeAllListeners('room-created');
    socket.removeAllListeners('error');
    
    // Timeout ekle
    const timeout = setTimeout(() => {
      setIsCreating(false);
      toast.error('Oda oluşturma zaman aşımına uğradı!');
    }, 10000);
    
    const handleRoomCreated = (data: any) => {
      clearTimeout(timeout);
      console.log('✅ Oda oluşturma başarılı:', data);
      dispatch({ type: 'SET_ROOM_CODE', payload: data.roomCode });
      dispatch({ type: 'SET_CURRENT_PLAYER', payload: data.player });
      if (data.players) {
        dispatch({ type: 'SET_PLAYERS', payload: data.players });
      }
      navigate(`/lobby/${data.roomCode}`);
      setIsCreating(false);
      // Event listener'ları temizle
      socket.off('room-created', handleRoomCreated);
      socket.off('error', handleError);
    };

    const handleError = (error: any) => {
      clearTimeout(timeout);
      console.error('❌ Oda oluşturma hatası:', error);
      toast.error(error.message || error);
      setIsCreating(false);
      // Event listener'ları temizle
      socket.off('room-created', handleRoomCreated);
      socket.off('error', handleError);
    };

    socket.on('room-created', handleRoomCreated);
    socket.on('error', handleError);
    socket.emit('create-room', playerName.trim());
  };

  const joinRoom = () => {
    if (!playerName.trim()) {
      toast.error('Lütfen isminizi girin!');
      return;
    }

    if (!roomCode.trim()) {
      toast.error('Lütfen oda kodunu girin!');
      return;
    }

    // ✅ Use isConnected instead of socket.connected
    if (!socket || !isConnected) {
      toast.error('Bağlantı kurulamadı! Lütfen sayfayı yenileyin.');
      return;
    }

    setIsJoining(true);
    console.log('🚪 Odaya katılma isteği gönderiliyor:', {
      roomCode: roomCode.trim().toUpperCase(),
      playerName: playerName.trim()
    });

    // Tüm eski listener'ları temizle
    socket.removeAllListeners('room-joined');
    socket.removeAllListeners('error');

    // Timeout ekle
    const timeout = setTimeout(() => {
      setIsJoining(false);
      toast.error('Odaya katılma zaman aşımına uğradı!');
    }, 10000);

    const handleRoomJoined = (data: any) => {
      clearTimeout(timeout);
      console.log('✅ Odaya katılma başarılı:', data);
      dispatch({ type: 'SET_ROOM_CODE', payload: data.roomCode });
      dispatch({ type: 'SET_CURRENT_PLAYER', payload: data.player });
      dispatch({ type: 'SET_PLAYERS', payload: data.players });
      navigate(`/lobby/${data.roomCode}`);
      setIsJoining(false);
      // Event listener'ları temizle
      socket.off('room-joined', handleRoomJoined);
      socket.off('error', handleError);
    };

    const handleError = (error: any) => {
      clearTimeout(timeout);
      console.error('❌ Odaya katılma hatası:', error);
      toast.error(error.message || error);
      setIsJoining(false);
      // Event listener'ları temizle
      socket.off('room-joined', handleRoomJoined);
      socket.off('error', handleError);
    };

    socket.on('room-joined', handleRoomJoined);
    socket.on('error', handleError);
    socket.emit('join-room', {
      roomCode: roomCode.trim().toUpperCase(),
      playerName: playerName.trim()
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">🎭 MimClash</h1>
          <p className="text-gray-600">Meme savaşlarına hazır mısın?</p>
          
          {/* Connection Status */}
          <div className="mt-4 flex items-center justify-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}></div>
            <span className="text-sm text-gray-600">
              {isConnected ? 'Bağlı' : 'Bağlantı kesildi'}
            </span>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Oyuncu Adı
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Adınızı girin"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              maxLength={20}
              disabled={!isConnected}
            />
          </div>

          <div className="space-y-4">
            <button
              onClick={createRoom}
              disabled={isCreating || !isConnected}
              className="w-full bg-purple-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {isCreating ? 'Oda Oluşturuluyor...' : '🏠 Yeni Oda Oluştur'}
            </button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">veya</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Oda Kodu
              </label>
              <input
                type="text"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Oda kodunu girin"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent mb-3"
                maxLength={6}
                disabled={!isConnected}
              />
              <button
                onClick={joinRoom}
                disabled={isJoining || !isConnected}
                className="w-full bg-green-500 text-white py-3 px-4 rounded-lg font-semibold hover:bg-green-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {isJoining ? 'Odaya Katılıyor...' : '🚪 Odaya Katıl'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>• En az 3 oyuncu gerekli</p>
          <p>• Maksimum 12 oyuncu</p>
        </div>
      </div>
    </div>
  );
};

export default Home;