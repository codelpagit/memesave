import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useGame } from '../context/GameContext';
import useSocket from '../hooks/useSocket';

const GameResults: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { state } = useGame();

  const finalScores = state.finalScores || [];
  const currentPlayer = state.currentPlayer;
  const isHost = state.players.length > 0 && state.players[0].id === currentPlayer?.id;

  // State for countdown and user choices
  const [countdown, setCountdown] = useState(30);
  const [userChoice, setUserChoice] = useState<'lobby' | 'home' | null>(null);
  const [playersReturningToLobby, setPlayersReturningToLobby] = useState<string[]>([]);
  const [hostTransferred, setHostTransferred] = useState(false);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0 && !userChoice) {
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (countdown === 0 && !userChoice) {
      // Time's up, automatically go to home
      handleReturnToHome();
    }
  }, [countdown, userChoice]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handlePlayerReturnToLobby = (data: any) => {
      console.log('🔄 Player returning to lobby:', data);
      setPlayersReturningToLobby(prev => {
        if (!prev.includes(data.playerId)) {
          return [...prev, data.playerId];
        }
        return prev;
      });
    };

    const handleHostTransferred = (data: any) => {
      console.log('👑 Host transferred:', data);
      setHostTransferred(true);
      toast.success(`${data.newHost.name} yeni host oldu!`);
    };

    const handlePlayerLeft = (data: any) => {
      if (data.reason === 'returned-to-home') {
        setPlayersReturningToLobby(prev => 
          prev.filter(playerId => playerId !== data.playerId)
        );
      }
    };

    socket.on('player-returning-to-lobby', handlePlayerReturnToLobby);
    socket.on('host-transferred', handleHostTransferred);
    socket.on('player-left', handlePlayerLeft);

    return () => {
      socket.off('player-returning-to-lobby', handlePlayerReturnToLobby);
      socket.off('host-transferred', handleHostTransferred);
      socket.off('player-left', handlePlayerLeft);
    };
  }, [socket]);

  // Handle user choices
  const handleReturnToLobby = () => {
    if (!socket || !roomCode || !currentPlayer) return;
    
    setUserChoice('lobby');
    socket.emit('return-to-lobby');
    
    toast.success('Lobiye dönülüyor...');
    setTimeout(() => {
      navigate(`/lobby/${roomCode}`);
    }, 1500);
  };

  const handleReturnToHome = () => {
    if (!socket) return;
    
    setUserChoice('home');
    socket.emit('return-to-home');
    
    toast.success('Ana sayfaya dönülüyor...');
    setTimeout(() => {
      navigate('/');
    }, 1500);
  };

  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-purple-400 to-pink-400">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-4xl font-bold text-center mb-4 text-gray-800">
            🏆 Oyun Tamamlandı!
          </h1>
          
          {/* Countdown Timer */}
          {!userChoice && (
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-2">
                <span className="text-2xl font-bold text-red-600">{countdown}</span>
              </div>
              <p className="text-gray-600">
                Seçiminizi yapın! Süre dolduğunda otomatik olarak ana sayfaya yönlendirileceksiniz.
              </p>
            </div>
          )}

          {/* User Choice Status */}
          {userChoice && (
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-2">
                <span className="text-2xl">✅</span>
              </div>
              <p className="text-green-600 font-semibold">
                {userChoice === 'lobby' ? 'Lobiye dönülüyor...' : 'Ana sayfaya dönülüyor...'}
              </p>
            </div>
          )}
          
          <h2 className="text-2xl font-bold text-center mb-6 text-gray-700">
            📊 Genel Skor Tablosu
          </h2>
          
          <div className="space-y-4 mb-8">
            {finalScores.map((item, index) => (
              <div
                key={item.player.id}
                className={`flex items-center justify-between p-4 rounded-lg ${
                  index === 0
                    ? 'bg-yellow-100 border-2 border-yellow-400'
                    : index === 1
                    ? 'bg-gray-100 border-2 border-gray-400'
                    : index === 2
                    ? 'bg-orange-100 border-2 border-orange-400'
                    : 'bg-blue-50 border border-blue-200'
                }`}
              >
                <div className="flex items-center space-x-4">
                  <span className="text-2xl font-bold">
                    {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                  </span>
                  <span className="text-xl font-semibold">{item.player.name}</span>
                  {item.player.id === currentPlayer?.id && (
                    <span className="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      (Sen)
                    </span>
                  )}
                </div>
                <span className="text-2xl font-bold text-purple-600">
                  {item.score} puan
                </span>
              </div>
            ))}
          </div>
          
          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleReturnToHome}
              disabled={!!userChoice}
              className={`px-8 py-3 rounded-lg font-semibold transition-colors ${
                userChoice
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              🏠 Ana Ekrana Dön
            </button>
            <button
              onClick={handleReturnToLobby}
              disabled={!!userChoice}
              className={`px-8 py-3 rounded-lg font-semibold transition-colors ${
                userChoice
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              🚪 Lobiye Dön
            </button>
          </div>

          {/* Players returning to lobby info */}
          {playersReturningToLobby.length > 0 && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <span className="font-semibold">{playersReturningToLobby.length}</span> oyuncu lobiye dönüyor...
              </p>
            </div>
          )}

          {/* Host transfer notification */}
          {hostTransferred && (
            <div className="mt-4 p-4 bg-yellow-50 rounded-lg">
              <p className="text-sm text-yellow-700">
                👑 Host yetkisi transfer edildi!
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameResults;