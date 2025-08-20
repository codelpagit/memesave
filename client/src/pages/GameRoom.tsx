import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import useSocket from '../hooks/useSocket';
import { useGame } from '../context/GameContext';
import { eventBus } from '../utils/EventBus';
import MemeEditor from '../components/MemeEditor';

const GameRoom: React.FC = () => {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const { state, dispatch } = useGame();
  
  const [topText, setTopText] = useState('');
  const [bottomText, setBottomText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(0); // Başlangıçta 0, sunucudan gelecek
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  // statusCards ve currentStatusCard artık kullanılmıyor - situationCard kullanılıyor
  
  // ✅ Overlay ve geri sayım durumları
  const [showMemeEditor, setShowMemeEditor] = useState(false); // geri sayım için varsayılanı false yap
  const [memeImageData, setMemeImageData] = useState<string | null>(null);
  
  // ✅ Overlay state'leri ve yardımcılar
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayMode, setOverlayMode] = useState<'countdown' | 'transition'>('transition');
  const [overlayMessage, setOverlayMessage] = useState('');
  const [countdown, setCountdown] = useState(3);

  // Zamanlayıcı yönetimi için ref'ler
  const openEditorTimeoutRef = useRef<number | null>(null);
  const isOpeningEditorRef = useRef(false);

  const triggerTransition = (message: string, durationMs = 1500) => {
    setOverlayMode('transition');
    setOverlayMessage(message);
    setShowOverlay(true);
    const id = window.setTimeout(() => {
      setShowOverlay(false);
    }, durationMs);
    // Çakışma olmasın diye aynı ref'i kullanmıyoruz; sadece geçiş için tek seferlik.
  };

  const triggerCountdown = (message = '', seconds = 3) => {
    setOverlayMode('countdown');
    setOverlayMessage(message);
    setShowOverlay(true);
    setCountdown(seconds);

    let current = seconds;
    const id = window.setInterval(() => {
      current -= 1;
      setCountdown(current);
      if (current <= 0) {
        window.clearInterval(id);
        setShowOverlay(false);
      }
    }, 1000);
  };

  // ✅ Editörü geri sayım sonrası açan yardımcı
  const openEditorWithCountdown = (message = 'Meme editörü açılıyor', seconds = 3) => {
    if (isOpeningEditorRef.current) return;
    isOpeningEditorRef.current = true;

    triggerCountdown(message, seconds);
    openEditorTimeoutRef.current = window.setTimeout(() => {
      setShowMemeEditor(true);

      // ✅ Editör açıldığında start.wav çal
      try {
        const audio = new Audio('http://localhost:8080/sounds/start.wav');
        audio.volume = 0.7;
        audio.play().catch((err) => console.warn('Ses çalma engellendi:', err));
      } catch (err) {
        console.warn('Ses başlatılamadı:', err);
      }

      isOpeningEditorRef.current = false;
    }, seconds * 1000);
  };

  // Bileşen unmount olursa timeout'u temizle
  useEffect(() => {
    return () => {
      if (openEditorTimeoutRef.current) {
        window.clearTimeout(openEditorTimeoutRef.current);
      }
    };
  }, []);
  const lastSyncRef = useRef<Date>(new Date());

  // Game state'den değerleri al
  const currentRound = state.currentRound || 1;
  const maxRounds = state.maxRounds || 3;
  const situationCard = state.situationCard || 'Durum kartı yükleniyor...';
  const gameState = state.gameState;
  const memes = state.memes || [];
  const scores = state.scores || {};
  const currentPlayer = state.currentPlayer;
  
  const isJudge = state.currentJudge?.id === currentPlayer?.id;

  useEffect(() => {
    // Timer - sadece bir kez başlat, gameState değişikliklerinde yeniden başlatma
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []); // Dependency array'i boş - sadece mount'ta çalışır

  useEffect(() => {
    if (gameState === 'playing' && !hasSubmitted && !showMemeEditor) {
      openEditorWithCountdown('Meme editörü açılıyor', 3);
    }
  }, [gameState, hasSubmitted, showMemeEditor]);

  // ✅ EventBus aboneliklerini tek useEffect içine al
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Round started - timer reset
    unsubscribers.push(
      eventBus.on('round-started', (data: any) => {
        console.log('🎯 Round başladı:', data);
        
        // ✅ FIX: GameState'i playing olarak güncelle
        dispatch({ type: 'SET_GAME_STATE', payload: 'playing' });
        
        // Situation card'ı güncelle
        if (data.situationCard) {
          dispatch({ type: 'SET_SITUATION_CARD', payload: data.situationCard });
        }
        
        // Sunucudan gelen meme oluşturma süresini kullan (dakika cinsinden, saniyeye çevir)
        const memeCreationTimeSeconds = (data.memeCreationTime || 2) * 60;
        
        // Eğer roundStartTime varsa, kalan süreyi hesapla
        let actualTimeLeft = memeCreationTimeSeconds;
        if (data.roundStartTime) {
          const now = Date.now();
          const elapsed = Math.floor((now - data.roundStartTime) / 1000); // geçen süre (saniye)
          actualTimeLeft = Math.max(0, memeCreationTimeSeconds - elapsed);
          console.log(`⏰ Round başlangıcından ${elapsed} saniye geçti, kalan süre: ${actualTimeLeft} saniye`);
        }
        
        console.log(`⏰ Meme oluşturma süresi: ${data.memeCreationTime || 2} dakika (${actualTimeLeft} saniye)`);
        setTimeLeft(actualTimeLeft);
        setHasSubmitted(false);
        setHasVoted(false);
        setTopText('');
        setBottomText('');
        setSelectedTemplate(null);
        
        // Durum kartı artık kullanılmıyor - situationCard kullanılıyor
        
        // Sadece yeterli süre varsa editörü aç
        if (actualTimeLeft > 5) {
          openEditorWithCountdown('Meme editörü açılıyor', 3);
        }
      })
    );

    // Voting started
    unsubscribers.push(
      eventBus.on('voting-started', (data: any) => {
        console.log('🗳️ Oylama başladı:', data);
        console.log('🔧 DEBUG: GameRoom - Gelen votingTime:', data.votingTime);
        console.log('📊 Alınan meme sayısı:', data.memes?.length);
        console.log('📋 Alınan mimler:', data.memes?.map((m: any) => m.playerName));

        triggerTransition('Oylama Başlıyor', 2000);
        // Sunucudan gelen oylama süresini kullan (saniye cinsinden)
        const votingTimeSeconds = data.votingTime || 60;
        console.log('🔧 DEBUG: GameRoom - Kullanılacak votingTime:', votingTimeSeconds);
        console.log(`⏰ Oylama süresi: ${votingTimeSeconds} saniye`);
        setTimeLeft(votingTimeSeconds);
        setHasVoted(false);

        dispatch({ type: 'SET_GAME_STATE', payload: 'voting' });

        if (data.memes && data.memes.length > 0) {
          dispatch({ type: 'SET_MEMES', payload: data.memes });
          toast.success(`Oylama başladı! ${data.memes.length} meme arasından seç!`);
        } else {
          console.error('❌ Hiç meme alınamadı!');
          toast.error('Mimler yüklenemedi, lütfen sayfayı yenileyin.');
        }
      })
    );

    // Voting ended early
    unsubscribers.push(
      eventBus.on('voting-ended-early', (data: any) => {
        console.log('⚡ Oylama erken bitti:', data);
        toast.success(data.message || 'Tüm oylar verildi!');
        setTimeLeft(3);
      })
    );

    // Round results
    unsubscribers.push(
      eventBus.on('round-results', (data: any) => {
        console.log('🏆 Tur sonuçları:', data);

        // ✅ Sonuç ekranı açılırken alkış sesi çal
        try {
          const audio = new Audio('http://localhost:8080/sounds/clap.wav');
          audio.volume = 0.7;
          // iOS/Safari vb. kısıtlar için catch ekliyoruz
          audio.play().catch((err) => console.warn('Ses çalma engellendi:', err));
        } catch (err) {
          console.warn('Ses başlatılamadı:', err);
        }

        setTimeLeft(10);
        setHasSubmitted(false);
        setHasVoted(false);
        setTopText('');
        setBottomText('');
        setSelectedTemplate(null);
      })
    );

    // Game finished - navigate to results page
    unsubscribers.push(
      eventBus.on('game-finished', (data: any) => {
        console.log('🎉 Oyun bitti, sonuç sayfasına yönlendiriliyor:', data);
        
        // ✅ Oyun bitişinde zafer sesi çal
        try {
          const audio = new Audio('http://localhost:8080/sounds/clap.wav');
          audio.volume = 0.8;
          audio.play().catch((err) => console.warn('Ses çalma engellendi:', err));
        } catch (err) {
          console.warn('Ses başlatılamadı:', err);
        }

        // GameResults sayfasına direkt yönlendir
        navigate(`/results/${roomCode}`);
      })
    );

    // Timer ayarlama event'i
    unsubscribers.push(
      eventBus.on('set-timer', (seconds: number) => {
        console.log('⏰ Timer ayarlanıyor:', seconds, 'saniye');
        setTimeLeft(seconds);
      })
    );

    // ✅ YENİ: Server sync event handler - statusCards'ı senkronize et
    unsubscribers.push(
      eventBus.on('server-sync', (data: any) => {
        console.log('🔄 Server sync event alındı:', data);
        
        // StatusCards artık kullanılmıyor - situationCard kullanılıyor
        
        // Diğer sync verileri
        if (data.gameState) {
          dispatch({ type: 'SET_GAME_STATE', payload: data.gameState });
        }
        if (data.currentRound !== undefined) {
          dispatch({ type: 'SET_CURRENT_ROUND', payload: data.currentRound });
        }
        if (data.maxRounds !== undefined) {
          dispatch({ type: 'SET_MAX_ROUNDS', payload: data.maxRounds });
        }
        if (data.situationCard) {
          dispatch({ type: 'SET_SITUATION_CARD', payload: data.situationCard });
        }
        if (data.memes) {
          dispatch({ type: 'SET_MEMES', payload: data.memes });
        }
        if (data.timeLeft !== undefined) {
          setTimeLeft(data.timeLeft);
        }
      })
    );

    return () => {
      // ✅ Cleanup
      unsubscribers.forEach((unsub: () => void) => unsub());
    };
  }, [roomCode, navigate]);

  // ✅ YENİ: Reconnection ve sync logic
  useEffect(() => {
    if (!socket || !roomCode || !isConnected) return;

    // İlk bağlantıda room info al
    if (state.currentPlayer) {
      console.log('🔄 GameRoom: get-room-info çağrılıyor...');
      socket.emit('get-room-info', { 
        roomCode, 
        playerInfo: {
          id: state.currentPlayer.id,
          name: state.currentPlayer.name
        }
      });
    }

    // Periodic sync check
    const syncInterval = setInterval(() => {
      const now = new Date();
      const timeSinceLastSync = now.getTime() - lastSyncRef.current.getTime();
      
      // 30 saniyede bir sync kontrolü
      if (timeSinceLastSync > 30000 && state.currentPlayer) {
        console.log('🔄 GameRoom: Periodic sync check...');
        socket.emit('get-room-info', { 
          roomCode, 
          playerInfo: {
            id: state.currentPlayer.id,
            name: state.currentPlayer.name
          }
        });
        lastSyncRef.current = now;
      }
    }, 30000);

    return () => clearInterval(syncInterval);
  }, [socket, roomCode, isConnected, state.currentPlayer]);

  // ✅ YENİ: Connection status değişikliklerini dinle
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];
    
    // Bağlantı yeniden kurulduğunda room info al
    unsubscribers.push(
      eventBus.on('connection-status-changed', (status: string) => {
        if (status === 'connected' && socket && roomCode && state.currentPlayer) {
          console.log('🔄 GameRoom: Reconnected, getting room info...');
          
          // ✅ FIX: currentPlayer'ı timeout öncesi kaydet
          const currentPlayerInfo = {
            id: state.currentPlayer.id,
            name: state.currentPlayer.name
          };
          
          setTimeout(() => {
            // ✅ FIX: Kaydedilen bilgiyi kullan, state'e tekrar erişme
            socket.emit('get-room-info', { 
              roomCode, 
              playerInfo: currentPlayerInfo
            });
          }, 1000); // 1 saniye bekle
        }
      })
    );
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [socket, roomCode, state.currentPlayer]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!socket) return;
    
    const unsubscribers: (() => void)[] = [];
    
    // ✅ YENİ: Meme submit success/error handlers
    unsubscribers.push(
      eventBus.on('meme-submitted', (data: any) => {
        console.log('✅ Meme submit başarılı:', data);
        toast.success(data.message || 'Meme gönderildi!');
        setHasSubmitted(true);
        setShowMemeEditor(false);
      })
    );
    
    unsubscribers.push(
      eventBus.on('socket-error', (error: any) => {
        console.error('❌ Socket error:', error);
        if (error.code === 'ALREADY_SUBMITTED') {
          toast.error('Zaten meme gönderdiniz!');
          setHasSubmitted(true);
        } else if (error.code === 'INVALID_MEME_FORMAT') {
          toast.error('Meme formatı geçersiz. Lütfen tekrar deneyin.');
          setHasSubmitted(false);
        } else if (error.code === 'PLAYER_NOT_FOUND') {
          toast.error('Bağlantı sorunu. Sayfa yenileniyor...');
          setTimeout(() => window.location.reload(), 2000);
        } else {
          toast.error(error.message || 'Bir hata oluştu!');
        }
      })
    );
    
    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, [socket]);

  // submitMeme fonksiyonu
  const submitMeme = (imageData: string) => {
    if (!socket || !imageData) {
      toast.error('Bağlantı sorunu! Lütfen sayfayı yenileyin.');
      return;
    }

    // ✅ DÜZELTME: Data boyutunu kontrol et
    const sizeInMB = (imageData.length * 0.75) / (1024 * 1024);
    console.log(`📊 Gönderilecek meme boyutu: ${sizeInMB.toFixed(2)}MB`);
    
    if (sizeInMB > 8) {
      toast.error('Meme çok büyük! Lütfen daha basit bir meme oluşturun.');
      return;
    }

    const memeData = {
      roomCode,
      imageData,
      playerId: currentPlayer?.id // ✅ DÜZELTME: player?.id → currentPlayer?.id
    };

    // ✅ DÜZELTME: Transport error için timeout ekle
    const timeoutId = setTimeout(() => {
      toast.error('Meme gönderimi zaman aşımına uğradı! Lütfen tekrar deneyin.');
      setHasSubmitted(false);
    }, 15000); // 15 saniye timeout

    try {
      socket.emit('submit-meme', memeData);
      console.log('📤 Submit-meme eventi gönderildi');
      setMemeImageData(imageData);
      setHasSubmitted(true);
      setShowMemeEditor(false);
      toast.success('Meme gönderildi!');

      // ✅ Meme gönderildiğinde memesent.mp3 çal
      try {
        const audio = new Audio('http://localhost:8080/sounds/memesent.mp3');
        audio.volume = 0.8;
        audio.play().catch((err) => console.warn('Ses çalma engellendi:', err));
      } catch (err) {
        console.warn('Ses başlatılamadı:', err);
      }
      clearTimeout(timeoutId);
    } catch (error) {
      console.error('🚨 Meme gönderim hatası:', error);
      toast.error('Meme gönderilemedi! Lütfen tekrar deneyin.');
      setHasSubmitted(false);
      clearTimeout(timeoutId);
    }
  };

  // ✅ DÜZELTME: Connection status monitor ekle
  useEffect(() => {
    const handleConnectionStatus = (status: string) => {
      if (status === 'disconnected') {
        toast.error('Bağlantı kesildi! Yeniden bağlanılıyor...');
      } else if (status === 'connected') {
        toast.success('Bağlantı yeniden kuruldu!');
      }
    };

    eventBus.on('connection-status-changed', handleConnectionStatus);

    return () => {
      eventBus.off('connection-status-changed', handleConnectionStatus);
    };
  }, []);

  const voteForMeme = (memeId: string) => {
    if (!socket || hasVoted || isJudge) return;

    socket.emit('vote', { memeId });
    setHasVoted(true);
    toast.success('Oyunuz kaydedildi! 🗳️');
  };

  // Durum kartları artık kullanılmıyor - situationCard kullanılıyor

  // Render functions
  const renderMemeCreation = () => {
    return (
      <div className="space-y-6">
        {/* Durum Kartı */}
        {state.situationCard && (
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl shadow-lg p-6 text-white">
            <div className="text-center">
              <h3 className="text-xl font-bold mb-2">🎯 Durum Kartı</h3>
              <div className="bg-white/20 backdrop-blur-sm rounded-xl p-4">
                <p className="text-lg font-semibold">{state.situationCard?.text || 'Durum kartı yükleniyor...'}</p>
              </div>
              <p className="text-sm mt-3 opacity-90">Bu duruma uygun bir meme oluştur! 🎨</p>
            </div>
          </div>
        )}
        
        {/* Meme Oluşturma */}
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h3 className="text-xl font-semibold mb-4">🎨 Meme Oluştur</h3>

          {hasSubmitted && memeImageData ? (
            <div className="text-center">
              <div className="mb-4">
                <img 
                  src={memeImageData} 
                  alt="Oluşturulan Meme" 
                  className="max-w-full h-auto rounded-lg mx-auto"
                  style={{ maxHeight: '400px' }}
                />
              </div>
              <div className="text-green-600 font-semibold">✅ Meme başarıyla gönderildi!</div>
            </div>
          ) : (
            <MemeEditor
              onMemeCreated={submitMeme}
              onCancel={() => {}}
              disabled={hasSubmitted}
            />
          )}
        </div>
      </div>
    );
  };

  const renderVoting = () => {
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h3 className="text-xl font-semibold mb-4">🗳️ Oylama Zamanı!</h3>

        {isJudge ? (
          <div className="text-center py-8">
            <div className="text-4xl mb-4">⚖️</div>
            <p className="text-gray-600">Diğer oyuncuların oylarını bekle...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {memes.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">⏳</div>
                <p className="text-gray-600">Mimler yükleniyor...</p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-4 bg-blue-500 text-white px-4 py-2 rounded"
                >
                  Sayfayı Yenile
                </button>
              </div>
            ) : (
              memes.map((meme) => (
                <div
                  key={meme.id}
                  onClick={() => voteForMeme(meme.id)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    hasVoted
                      ? 'border-gray-300 bg-gray-100 cursor-not-allowed'
                      : 'border-purple-300 bg-purple-50 hover:bg-purple-100'
                  }`}
                >
                  {meme.isImageMeme && meme.imageData ? (
                    <div className="text-center">
                      <img
                        src={meme.imageData}
                        alt="Meme"
                        className="max-w-full h-auto rounded-lg mx-auto"
                        style={{ maxHeight: '300px' }}
                      />
                    </div>
                  ) : (
                    <div className="text-center">
                      {meme.topText && (
                        <div className="font-bold text-lg">{meme.topText}</div>
                      )}
                      {meme.bottomText && (
                        <div className="mt-2 font-bold text-lg">{meme.bottomText}</div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}

            {hasVoted && (
              <div className="text-center mt-4">
                <span className="text-green-600 font-semibold">
                  ✅ Oyunuz kaydedildi! Sonuçlar bekleniyor...
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderResults = () => (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-semibold mb-4">🏆 Tur Sonuçları</h3>
      <div className="space-y-4">
        {memes
          .sort((a, b) => b.votes - a.votes)
          .map((meme, index) => (
            <div key={meme.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-4">
                <div className="text-2xl">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅'}
                </div>
                <div>
                  <div className="font-semibold">{meme.playerName}</div>
                </div>
              </div>
              <div className="text-lg font-bold text-purple-600">{meme.votes} oy</div>
            </div>
          ))}
      </div>
      
      {/* Skorlar */}
      <div className="mt-6 pt-6 border-t">
        <h4 className="text-lg font-semibold mb-3">📊 Genel Skorlar</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(scores)
            .map(([playerId, score]) => ({
              player: state.players.find(p => p.id === playerId),
              score
            }))
            .filter(item => item.player)
            .sort((a, b) => b.score - a.score)
            .map((item, index) => (
              <div key={item.player!.id} className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="font-semibold">{item.player!.name}</div>
                <div className="text-2xl font-bold text-purple-600">{item.score}</div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );

  const renderWaiting = () => (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <div className="text-center py-8">
        <div className="text-6xl mb-4">⏳</div>
        <h3 className="text-2xl font-semibold mb-4">Yeni Tur Hazırlanıyor...</h3>
        <p className="text-gray-600 mb-6">Lütfen bekleyin, oyun yakında başlayacak.</p>
        
        {/* Durum Kartı Önizlemesi */}
        {state.situationCard && (
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl shadow-lg p-4 text-white max-w-md mx-auto">
            <div className="text-center">
              <h4 className="text-lg font-bold mb-2">🎯 Durum Kartı</h4>
              <div className="bg-white/20 backdrop-blur-sm rounded-lg p-3">
                <p className="text-base font-semibold">{state.situationCard?.text || 'Durum kartı yükleniyor...'}</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="mt-6">
          <div className="animate-pulse flex justify-center space-x-1">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animation-delay-200"></div>
            <div className="w-2 h-2 bg-blue-500 rounded-full animation-delay-400"></div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderFallback = () => {
    
    return (
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <div className="text-center py-8">
          <div className="text-6xl mb-4">🤔</div>
          <h3 className="text-2xl font-semibold mb-4">Beklenmeyen Durum</h3>
          <p className="text-gray-600 mb-6">Oyun durumu: {gameState}</p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
        >
          Sayfayı Yenile
        </button>
      </div>
    </div>
    );
  };



  return (
    <div className="min-h-screen p-4 bg-gradient-to-br from-blue-400 to-purple-600">
      {/* ✅ Geçiş/Geri Sayım Overlay'i */}
      {showOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity">
          <div className="text-center text-white">
            {overlayMessage && (
              <div className="mb-4 text-2xl font-semibold drop-shadow-lg">{overlayMessage}</div>
            )}
            {overlayMode === 'countdown' ? (
              <div key={countdown} className="text-8xl font-extrabold drop-shadow-2xl animate-bounce">
                {countdown}
              </div>
            ) : (
              <div className="text-4xl font-bold drop-shadow-2xl animate-pulse">Hazır mısın?</div>
            )}
          </div>
        </div>
      )}
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-xl p-6 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-800">🎮 Oyun Odası</h1>
            <p className="text-gray-600">Oda: {roomCode} | Tur: {currentRound}/{maxRounds}</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-600">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div>
            <div className="text-sm text-gray-500">Kalan Süre</div>
          </div>
        </div>
      </div>

      {/* Game Content */}
      {gameState === 'waiting' && renderWaiting()}
      {gameState === 'playing' && renderMemeCreation()}
      {gameState === 'voting' && renderVoting()}
      {gameState === 'results' && renderResults()}
      {!['waiting', 'playing', 'voting', 'results'].includes(gameState) && renderFallback()}
    </div>
  );

};

export default GameRoom;