const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:4000",  // ✅ Frontend'in yeni portu
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  // ✅ DÜZELTME: Buffer boyutunu artır (transport error'ı çözmek için)
  maxHttpBufferSize: 10 * 1024 * 1024, // 10MB (default 1MB'dan artır)
  pingTimeout: 20000,
  pingInterval: 10000,
  // ✅ DÜZELTME: Reconnection ayarları
  transports: ['websocket', 'polling']
});

// Middleware
app.use(cors({
  origin: "http://localhost:4000",  // ✅ Frontend'in yeni portu
  credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

// Oyun odaları ve oyuncular
const gameRooms = new Map();
const players = new Map();

// Durum kartları sistemi - Esnek ve ölçeklenebilir yapı
const statusCardsData = {
  categories: {
    work: {
      name: "İş Durumları",
      description: "İş hayatında karşılaşılan durumlar",
      cards: [
        "Pazartesi sabahı alarm çaldığında",
        "Maaş gününü beklerken",
        "Toplantı 5 dakika uzadığında",
        "Patron seni çağırdığında",
        "Deadline son gün yaklaştığında",
        "Kahve makinesi bozulduğunda",
        "İş arkadaşın tatile çıktığında",
        "Yıllık izin reddedildiğinde"
      ]
    },
    traffic: {
      name: "Trafik Durumları",
      description: "Yolda karşılaşılan durumlar",
      cards: [
        "Trafik ışığı kırmızıya döndüğünde",
        "Park yeri bulamadığında",
        "Benzin bittiğinde",
        "Yol kapalı olduğunda",
        "Otobüs kaçırdığında",
        "Taksi bulamadığında",
        "GPS yanlış yol gösterdiğinde",
        "Araç muayenesi yaklaştığında"
      ]
    },
    relationship: {
      name: "İlişki Durumları",
      description: "İnsan ilişkilerinde yaşanan durumlar",
      cards: [
        "Arkadaşın seni ghostladığında",
        "Sosyal medyada eski sevgilin görünce",
        "Annen seni aradığında",
        "Grup sohbetinde sessiz kaldığında",
        "Doğum günün unutulduğunda",
        "Randevuya geç kaldığında",
        "Mesajın görüldü olduğunda",
        "Aile toplantısında sorular sorulduğunda"
      ]
    },
    technology: {
      name: "Teknoloji Durumları",
      description: "Teknoloji ile ilgili durumlar",
      cards: [
        "WiFi şifresi değiştiğinde",
        "Telefon şarjı %1'e düştüğünde",
        "Uygulama çöktüğünde",
        "İnternet kesildiğinde",
        "Güncelleme geldiğinde",
        "Şifren yanlış olduğunda",
        "Bilgisayar donduğunda",
        "Yedek almayı unuttuğunda"
      ]
    },
    entertainment: {
      name: "Eğlence Durumları",
      description: "Eğlence ve boş zaman aktiviteleri",
      cards: [
        "Favori dizinin final bölümünde",
        "Yemek siparişi geç geldiğinde",
        "Sinema bileti tükendiğinde",
        "Oyun güncellemesi geldiğinde",
        "Playlist bittiğinde",
        "Kitap bittiğinde",
        "Spoiler yediğinde",
        "Konser bileti alamadığında"
      ]
    },
    daily: {
      name: "Günlük Durumlar",
      description: "Günlük hayatta karşılaşılan genel durumlar",
      cards: [
        "Sınav sonuçları açıklandığında",
        "Hava durumu değiştiğinde",
        "Alışveriş listesini unuttuğunda",
        "Anahtarını kaybettiğinde",
        "Asansör bozulduğunda",
        "Kargo gelmediğinde",
        "Bankamatik para vermediğinde",
        "Uyku saatin bozulduğunda"
      ]
    }
  },
  settings: {
    cardsPerGame: 3, // Her oyunda kaç kart seçilecek
    allowDuplicateCategories: false, // Aynı kategoriden birden fazla kart seçilebilir mi
    randomizeOrder: true // Kartlar rastgele sıralanacak mı
  }
};

// Geriye uyumluluk için eski format
const situationCards = [];

// Tüm kartları tek bir array'e topla (geriye uyumluluk için)
Object.values(statusCardsData.categories).forEach(category => {
  situationCards.push(...category.cards);
});

// Durum kartları seçme fonksiyonu
function selectStatusCards(gameSettings = {}, usedCards = []) {
  const {
    cardsPerGame = statusCardsData.settings.cardsPerGame,
    allowDuplicateCategories = statusCardsData.settings.allowDuplicateCategories,
    randomizeOrder = statusCardsData.settings.randomizeOrder,
    enabledCategories = ['work', 'traffic', 'relationship', 'technology', 'entertainment', 'daily']
  } = gameSettings;

  let allCards = [];
  
  // Sadece etkin kategorilerden kartları topla ve obje formatında hazırla
  Object.entries(statusCardsData.categories).forEach(([categoryKey, category]) => {
    if (enabledCategories.includes(categoryKey)) {
      category.cards.forEach((cardText, index) => {
        allCards.push({
          id: `${categoryKey}_${index}`,
          text: cardText,
          category: category.name,
          categoryKey: categoryKey
        });
      });
    }
  });

  // Kullanılmış kartları filtrele (text bazında karşılaştır)
  const availableCards = allCards.filter(card => !usedCards.includes(card.text));
  
  // Eğer yeterli kart yoksa, kullanılmış kartları sıfırla
  const cardsToUse = availableCards.length >= cardsPerGame ? availableCards : allCards;

  // Kartları karıştır
  if (randomizeOrder) {
    for (let i = cardsToUse.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cardsToUse[i], cardsToUse[j]] = [cardsToUse[j], cardsToUse[i]];
    }
  }

  // Belirtilen sayıda kart seç
  const selectedCards = cardsToUse.slice(0, cardsPerGame);
  
  console.log('DEBUG STATUS CARDS: selectStatusCards - selectedCards:', selectedCards);
  console.log('DEBUG STATUS CARDS: selectStatusCards - selectedCards length:', selectedCards.length);
  
  return selectedCards;
}

// Oda oluşturma fonksiyonu
function createRoom() {
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const room = {
    id: roomCode,
    players: [],
    gameState: 'waiting',
    currentRound: 0,
    maxRounds: 5,
    currentJudge: 0,
    currentCard: null,
    memes: [],
    scores: {},
    roundTimer: null,
    roundStartTime: null, // Round başlangıç zamanı
    // ✅ Chat history ekle
    chatHistory: [],
    // ✅ Game settings ekle
    gameSettings: {
      maxRounds: 5,
      memeCreationTime: 3, // dakika
      votingTime: 60, // saniye
      minPlayers: 3,
      maxPlayers: 8,
      minPlayersEnabled: true,
      maxPlayersEnabled: true,
      enabledCategories: ['work', 'traffic', 'relationship', 'technology', 'entertainment', 'daily']
    },
    usedCards: [], // Kullanılan durum kartlarını takip etmek için
    availableCards: [] // Mevcut oyun için kullanılabilir kartlar
  };
  gameRooms.set(roomCode, room);
  return room;
}

// Socket bağlantıları
io.on('connection', (socket) => {
  console.log('✅ Yeni oyuncu bağlandı:', socket.id);
  console.log('🔗 Toplam bağlantı sayısı:', io.engine.clientsCount);

  // Oda oluştur
  socket.on('create-room', (playerName) => {
    console.log('🏠 Oda oluşturma isteği:', playerName, 'Socket ID:', socket.id);
    const room = createRoom();
    console.log('✅ Oda oluşturuldu:', room.id, 'Toplam oda sayısı:', gameRooms.size);
    
    const player = {
      id: socket.id,
      name: playerName,
      roomId: room.id,
      score: 0
    };
    
    room.players.push(player);
    room.scores[socket.id] = 0;
    players.set(socket.id, player);
    
    socket.join(room.id);
    // ✅ players array'ini de gönder
    socket.emit('room-created', { 
      roomCode: room.id, 
      player,
      players: room.players 
    });
    io.to(room.id).emit('player-joined', { players: room.players, player });
  });

  // Odaya katıl
  // join-room event handler'ını güncelle (yaklaşık 95-150. satırlar)
socket.on('join-room', ({ roomCode, playerName }) => {
  console.log('🚪 Odaya katılma isteği:', { roomCode, playerName, socketId: socket.id });
  
  const room = gameRooms.get(roomCode);
  if (!room) {
    socket.emit('error', 'Oda bulunamadı!');
    return;
  }
  
  // Maksimum oyuncu kontrolü (ayarlara göre)
  const maxPlayers = room.gameSettings.maxPlayersEnabled ? room.gameSettings.maxPlayers : 8;
  if (room.players.length >= maxPlayers) {
    socket.emit('error', `Oda dolu! Maksimum ${maxPlayers} oyuncu olabilir.`);
    return;
  }
  
  // Oyun durumu kontrolü - finished durumunda da katılıma izin ver
  if (room.gameState !== 'waiting' && room.gameState !== 'finished') {
    socket.emit('error', 'Oyun başlamış!');
    return;
  }
  
  // Eğer oyun bitmiş durumda ise, oda durumunu waiting'e çevir
    if (room.gameState === 'finished') {
      console.log('🔄 Oyun bitmiş, oda durumu waiting olarak sıfırlanıyor...');
      room.gameState = 'waiting';
      room.currentRound = 0;
      room.roundResults = [];
      room.finalScores = null;
      room.usedCards = []; // Kullanılmış kartları sıfırla
      room.availableCards = []; // Mevcut kartları sıfırla
      
      // Mevcut oyuncuların skorlarını sıfırla
      room.players.forEach(player => {
        player.score = 0;
        room.scores[player.id] = 0;
      });
      
      // Odadaki tüm oyunculara durum güncellemesini bildir
      io.to(roomCode).emit('room-reset', {
        gameState: 'waiting',
        currentRound: 0,
        players: room.players,
        message: 'Oda yeni oyun için hazırlandı!'
      });
    }
  
  // ✅ YENİ: Aynı isimde oyuncu kontrolü
  const existingPlayerWithSameName = room.players.find(p => p.name === playerName);
  if (existingPlayerWithSameName) {
    socket.emit('error', {
      message: 'Bu isimde bir oyuncu zaten odada! Lütfen farklı bir isim seçin.',
      code: 'DUPLICATE_NAME'
    });
    return;
  }
  
  const player = {
    id: socket.id,
    name: playerName,
    roomId: roomCode,
    score: 0,
    isOnline: true,
    lastSeen: new Date(),
    // ✅ YENİ: Kalıcı oyuncu kimliği
    uniqueId: `${playerName}_${roomCode}`
  };
  
  room.players.push(player);
  room.scores[socket.id] = 0;
  players.set(socket.id, player);
  
  socket.join(roomCode);
  
    // ✅ Real-time sync: Yeni katılan oyuncuya tam bilgi gönder
    socket.emit('room-joined', { 
      roomCode, 
      player, 
      players: room.players,
      gameState: room.gameState,
      currentRound: room.currentRound,
      maxRounds: room.maxRounds,
      chatHistory: room.chatHistory || []
    });
    
    // ✅ Real-time sync: TÜM ODAYA güncel bilgileri gönder
    io.to(roomCode).emit('room-info-update', {
      players: room.players,
      gameState: room.gameState,
      currentRound: room.currentRound,
      maxRounds: room.maxRounds,
      chatHistory: room.chatHistory || [],
      newPlayer: player,
      timestamp: new Date()
    });
    
    console.log('✅ Real-time sync: Oyuncu katıldı ve tüm odaya bildirildi');
  });

  // Enhanced lobby message with real-time sync
  socket.on('send-lobby-message', ({ roomCode, playerName, message }) => {
    const room = gameRooms.get(roomCode);
    if (!room) {
      socket.emit('error', 'Oda bulunamadı!');
      return;
    }
    
    const chatMessage = {
      id: require('uuid').v4(),
      playerName,
      message,
      timestamp: new Date()
    };
    
    // ✅ Server'da chat history'yi sakla
    if (!room.chatHistory) {
      room.chatHistory = [];
    }
    room.chatHistory.push(chatMessage);
    if (room.chatHistory.length > 100) {
      room.chatHistory = room.chatHistory.slice(-100);
    }
    
    // ✅ Tüm odadaki oyunculara mesajı gönder
    io.to(roomCode).emit('lobby-message', chatMessage);
    
    // ✅ Real-time sync events
    io.to(roomCode).emit('chat-history-updated', {
      chatHistory: room.chatHistory,
      lastMessage: chatMessage
    });
    
    console.log('✅ Real-time sync: Chat mesajı gönderildi ve tüm odaya bildirildi');
  });

  // Enhanced disconnect with real-time sync
  socket.on('disconnect', (reason) => {
    console.log('❌ Socket disconnect:', socket.id, 'Sebep:', reason);
    
    const player = players.get(socket.id);
    if (player) {
      const room = gameRooms.get(player.roomId);
      if (room) {
        // ✅ DÜZELTME: Transport error durumunda özel işlem
        if (reason === 'transport error') {
          console.log('🔧 Transport error tespit edildi, oyuncuya 60 saniye süre tanınıyor...');
          
          // Oyuncuyu geçici olarak offline işaretle
          const playerInRoom = room.players.find(p => p.id === socket.id);
          if (playerInRoom) {
            playerInRoom.isOnline = false;
            playerInRoom.lastSeen = new Date();
            playerInRoom.disconnectReason = 'transport_error';
          }
          
          // ✅ DÜZELTME: Transport error için daha uzun süre bekle (60 saniye)
          setTimeout(() => {
            const currentRoom = gameRooms.get(player.roomId);
            if (currentRoom) {
              const stillOffline = currentRoom.players.find(p => 
                p.id === socket.id && 
                !p.isOnline && 
                p.disconnectReason === 'transport_error'
              );
              if (stillOffline) {
                console.log('⏰ Transport error timeout: Oyuncu çıkarılıyor:', player.name);
                currentRoom.players = currentRoom.players.filter(p => p.id !== socket.id);
                delete currentRoom.scores[socket.id];
                
                io.to(player.roomId).emit('player-left', { 
                  players: currentRoom.players,
                  playerName: player.name,
                  reason: 'transport_timeout',
                  timestamp: new Date()
                });
              }
            }
          }, 60000); // 60 saniye bekle
        } else {
          // Normal disconnect (30 saniye)
          const playerInRoom = room.players.find(p => p.id === socket.id);
          if (playerInRoom) {
            playerInRoom.isOnline = false;
            playerInRoom.lastSeen = new Date();
          }
          
          setTimeout(() => {
            const currentRoom = gameRooms.get(player.roomId);
            if (currentRoom) {
              const stillOffline = currentRoom.players.find(p => p.id === socket.id && !p.isOnline);
              if (stillOffline) {
                currentRoom.players = currentRoom.players.filter(p => p.id !== socket.id);
                delete currentRoom.scores[socket.id];
                
                io.to(player.roomId).emit('player-left', { 
                  players: currentRoom.players,
                  playerName: player.name,
                  timestamp: new Date()
                });
              }
            }
          }, 30000);
        }
        
        // ✅ DÜZELTME: Real-time sync
        io.to(player.roomId).emit('player-status-updated', {
          playerId: socket.id,
          isOnline: false,
          lastSeen: new Date(),
          disconnectReason: reason,
          players: room.players
        });
      }
    }
  });

  // ✅ Real-time heartbeat system
  setInterval(() => {
    gameRooms.forEach((room, roomCode) => {
      if (room.players.length > 0) {
        io.to(roomCode).emit('heartbeat', {
          timestamp: new Date(),
          playersOnline: room.players.filter(p => p.isOnline).length,
          totalPlayers: room.players.length
        });
      }
    });
  }, 30000); // Her 30 saniyede bir heartbeat

  // Oyun ayarlarını güncelle
  socket.on('update-game-settings', (data) => {
    const player = players.get(socket.id);
    if (!player) {
      socket.emit('error', 'Oyuncu bulunamadı!');
      return;
    }
    
    const room = gameRooms.get(player.roomId);
    if (!room) {
      socket.emit('error', 'Oda bulunamadı!');
      return;
    }
    
    // Sadece host ayarları değiştirebilir
    const isHost = room.players[0]?.id === socket.id;
    if (!isHost) {
      socket.emit('error', 'Sadece host ayarları değiştirebilir!');
      return;
    }
    
    const settings = data.settings;
    console.log('📥 Gelen ayarlar:', settings);
    console.log('🔧 DEBUG: Mevcut room.gameSettings:', room.gameSettings);
    console.log('🔧 DEBUG: Gelen votingTime:', settings.votingTime);
    
    // Ayarları doğrula ve güncelle
    if (settings.maxRounds && settings.maxRounds >= 3 && settings.maxRounds <= 10) {
      room.gameSettings.maxRounds = settings.maxRounds;
      room.maxRounds = settings.maxRounds;
    }
    
    if (settings.memeCreationTime && settings.memeCreationTime >= 1 && settings.memeCreationTime <= 5) {
      room.gameSettings.memeCreationTime = settings.memeCreationTime;
    }
    
    if (settings.votingTime && settings.votingTime >= 30 && settings.votingTime <= 180) {
      room.gameSettings.votingTime = settings.votingTime;
    }
    
    if (settings.minPlayers !== undefined) {
      if (settings.minPlayers >= 2 && settings.minPlayers <= 6) {
        room.gameSettings.minPlayers = settings.minPlayers;
      }
    }
    
    if (settings.maxPlayers !== undefined) {
      if (settings.maxPlayers >= 4 && settings.maxPlayers <= 8) {
        room.gameSettings.maxPlayers = settings.maxPlayers;
      }
    }
    
    if (settings.minPlayersEnabled !== undefined) {
      room.gameSettings.minPlayersEnabled = settings.minPlayersEnabled;
    }
    
    if (settings.maxPlayersEnabled !== undefined) {
      room.gameSettings.maxPlayersEnabled = settings.maxPlayersEnabled;
    }
    
    // Durum kartı kategorilerini güncelle
    if (settings.enabledCategories && Array.isArray(settings.enabledCategories)) {
      // Geçerli İngilizce kategori isimlerini kontrol et
      const validCategories = ['work', 'traffic', 'relationship', 'technology', 'entertainment', 'daily'];
      const filteredCategories = settings.enabledCategories.filter(category => 
        validCategories.includes(category)
      );
      
      if (filteredCategories.length > 0) {
        room.gameSettings.enabledCategories = filteredCategories;
        console.log('🎯 Aktif kategoriler güncellendi:', filteredCategories);
      } else {
        console.log('⚠️ Geçersiz kategoriler gönderildi, varsayılan kategoriler kullanılıyor');
        room.gameSettings.enabledCategories = validCategories;
      }
    }
    
    // Güncellenmiş ayarları tüm oyunculara gönder
    io.to(player.roomId).emit('game-settings-updated', room.gameSettings);
    
    console.log('🎮 Oyun ayarları güncellendi:', room.gameSettings);
  });
  
  // Lobiye dönme seçimi
  socket.on('return-to-lobby', () => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const room = gameRooms.get(player.roomId);
    if (!room) return;
    
    // Oyuncuyu lobiye dönenler listesine ekle
     if (!room.playersReturningToLobby) {
       room.playersReturningToLobby = [];
     }
     
     if (!room.playersReturningToLobby.includes(socket.id)) {
       room.playersReturningToLobby.push(socket.id);
       console.log(`🔄 ${player.name} lobiye dönmeyi seçti`);
       
       // Tüm oyunculara güncellenmiş listeyi gönder
       io.to(room.id).emit('player-returning-to-lobby', {
         playerId: socket.id,
         playerName: player.name,
         totalReturning: room.playersReturningToLobby.length
       });
       
       // Eğer tüm oyuncular lobiye dönmeyi seçtiyse, timer'ı iptal et ve lobiye dön
       if (room.playersReturningToLobby.length === room.players.length) {
         console.log('✅ Tüm oyuncular lobiye dönmeyi seçti, timer iptal ediliyor');
         if (room.hostTransferTimer) {
           clearTimeout(room.hostTransferTimer);
           room.hostTransferTimer = null;
         }
         
         // Oyun state'ini lobby'ye çevir
         room.gameState = 'waiting';
         room.currentRound = 0;
         room.scores = {};
         room.playersReturningToLobby = [];
         
         // Tüm oyunculara lobiye dönüldüğünü bildir
         io.to(room.id).emit('returned-to-lobby', {
           message: 'Tüm oyuncular lobiye döndü'
         });
       }
     }
  });
  
  // Ana sayfaya dönme seçimi
  socket.on('return-to-home', () => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const room = gameRooms.get(player.roomId);
    if (!room) return;
    
    console.log(`🏠 ${player.name} ana sayfaya dönmeyi seçti`);
    
    // Oyuncuyu odadan çıkar
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(room.id);
    
    // Diğer oyunculara bildir
    io.to(room.id).emit('player-left', {
      playerId: socket.id,
      playerName: player.name,
      reason: 'returned-to-home'
    });
    
    // Eğer oda boşaldıysa sil
    if (room.players.length === 0) {
      gameRooms.delete(room.id);
      console.log(`🗑️ Oda silindi: ${room.id}`);
    }
  });

  // Oyunu başlat
  socket.on('start-game', () => {
    const player = players.get(socket.id);
    if (!player) return;
    
    const room = gameRooms.get(player.roomId);
    if (!room) {
      socket.emit('error', 'Oda bulunamadı!');
      return;
    }
    
    // Minimum oyuncu kontrolü (ayarlara göre)
    const minPlayers = room.gameSettings.minPlayersEnabled ? room.gameSettings.minPlayers : 3;
    if (room.players.length < minPlayers) {
      socket.emit('error', `En az ${minPlayers} oyuncu gerekli!`);
      return;
    }
    
    // Maksimum oyuncu kontrolü (ayarlara göre)
    const maxPlayers = room.gameSettings.maxPlayersEnabled ? room.gameSettings.maxPlayers : 8;
    if (room.players.length > maxPlayers) {
      socket.emit('error', `En fazla ${maxPlayers} oyuncu olabilir!`);
      return;
    }
    
    startNewRound(room);
  });

  // Durum kartları listesi isteme event'i
  socket.on('get-status-cards', (data) => {
    const { roomCode } = data;
    const room = gameRooms.get(roomCode);
    
    if (!room) {
      socket.emit('error', { message: 'Oda bulunamadı' });
      return;
    }
    
    // Mevcut kartları gönder
    socket.emit('status-cards-list', {
      availableCards: room.availableCards,
      usedCards: room.usedCards,
      currentCard: room.situationCard || null
    });
  });
  
  // Durum kartları kategorilerini isteme event'i
  socket.on('get-status-categories', () => {
    socket.emit('status-categories', {
      categories: statusCardsData.categories,
      settings: statusCardsData.settings
    });
  });

  // Meme gönder handler'ını güncelle (satır 280 civarı)
  socket.on('submit-meme', (data) => {
    console.log('📝 Submit-meme event alındı:', Object.keys(data));
    
    // ✅ DÜZELTME: Yeni format kontrolü (imageData) ve eski format (topText, bottomText, template) desteği
    let memeData;
    
    if (data.imageData) {
      // ✅ YENİ FORMAT: Canvas'tan export edilen image
      memeData = {
        roomCode: data.roomCode,
        imageData: data.imageData,
        playerId: data.playerId,
        isImageMeme: true
      };
    } else if (data.topText !== undefined && data.bottomText !== undefined && data.template !== undefined) {
      // ✅ ESKİ FORMAT: Text-based meme (backward compatibility)
      memeData = {
        topText: data.topText,
        bottomText: data.bottomText,
        template: data.template,
        isImageMeme: false
      };
    } else {
      console.log('❌ Geçersiz meme formatı:', data);
      socket.emit('error', { code: 'INVALID_MEME_FORMAT', message: 'Meme formatı geçersiz.' });
      return;
    }
    
    let player = players.get(socket.id);
    
    // ✅ FALLBACK: Player bulunamazsa, tüm odalarda uniqueId ile ara
    if (!player) {
      console.log('⚠️ Player bulunamadı, fallback arama başlatılıyor:', socket.id);
      
      for (const [roomId, room] of gameRooms) {
        for (const roomPlayer of room.players) {
          // uniqueId ile eşleşen oyuncuya bak
          if (roomPlayer.name && roomPlayer.name === socket.handshake.query.playerName) {
            console.log('🔧 Fallback: Player bulundu ve güncelleniyor:', roomPlayer.name);
            
            // ✅ DÜZELTME: Eski socket ID'yi temizle
            const oldSocketId = roomPlayer.id;
            if (players.has(oldSocketId)) {
              players.delete(oldSocketId);
            }
            
            // ✅ DÜZELTME: Yeni socket ID ile güncelle
            roomPlayer.id = socket.id;
            players.set(socket.id, roomPlayer);
            
            // ✅ DÜZELTME: Score mapping'i güncelle
            if (room.scores[oldSocketId] !== undefined) {
              room.scores[socket.id] = room.scores[oldSocketId];
              delete room.scores[oldSocketId];
            } else {
              room.scores[socket.id] = 0;
            }
            
            player = roomPlayer;
            console.log(`✅ Fallback başarılı: ${player.name} (${oldSocketId} → ${socket.id})`);
            break;
          }
        }
        if (player) break;
      }
    }
    
    if (!player) {
      console.log('❌ Player hala bulunamadı:', socket.id);
      console.log('📊 Mevcut players:', Array.from(players.keys()));
      console.log('📊 Handshake query:', socket.handshake.query);
      socket.emit('error', { code: 'PLAYER_NOT_FOUND', message: 'Oyuncu bulunamadı. Lütfen sayfayı yenileyin.' });
      return;
    }
    
    const room = gameRooms.get(player.roomId);
    if (!room) {
      console.log('❌ Room bulunamadı:', player.roomId);
      socket.emit('error', { code: 'ROOM_NOT_FOUND', message: 'Oda bulunamadı.' });
      return;
    }
    
    if (room.gameState !== 'playing') {
      console.log('❌ Game state yanlış:', room.gameState, 'Expected: playing');
      socket.emit('error', { code: 'INVALID_GAME_STATE', message: 'Oyun durumu uygun değil.' });
      return;
    }
    
    // ✅ DÜZELTME: Score mapping'i kontrol et ve yoksa oluştur
    if (!(socket.id in room.scores)) {
      room.scores[socket.id] = 0;
      console.log('⚠️ Score mapping eksikti, oluşturuldu:', socket.id);
    }
    
    // ✅ DÜZELTME: Oyuncu zaten meme göndermiş mi kontrol et (player.id ile)
    const existingMeme = room.memes.find(m => m.playerId === player.id);
    if (existingMeme) {
      console.log('❌ Oyuncu zaten mim göndermiş:', player.name);
      socket.emit('error', { code: 'ALREADY_SUBMITTED', message: 'Zaten meme gönderdiniz.' });
      return;
    }
    
    // ✅ DÜZELTME: Meme objesi oluştur (format'a göre)
    const meme = {
      id: uuidv4(),
      playerId: player.id,
      playerName: player.name,
      votes: 0,
      // ✅ Format'a göre data ekle
      ...(memeData.isImageMeme ? {
        imageData: memeData.imageData,
        isImageMeme: true
      } : {
        topText: memeData.topText,
        bottomText: memeData.bottomText,
        template: memeData.template,
        isImageMeme: false
      })
    };
    
    room.memes.push(meme);
    
    console.log(`📝 Meme gönderildi: ${room.memes.length}/${room.players.length} (${player.name})`);
    console.log(`📋 Mevcut mimler: ${room.memes.map(m => m.playerName).join(', ')}`);
    
    // ✅ DÜZELTME: Client'a başarılı response gönder
    socket.emit('meme-submitted', { 
      success: true, 
      message: 'Meme başarıyla gönderildi!',
      memeCount: room.memes.length,
      totalPlayers: room.players.length
    });
    
    // ✅ DÜZELTME: Tüm mimler toplandığında ANINDA oylama başlat
    if (room.memes.length === room.players.length) {
      console.log('🚀 TÜM MİMLER TOPLANDI! Oylama HEMEN başlatılıyor...');
      clearTimeout(room.roundTimer);
      
      // ✅ DÜZELTME: Kısa gecikme ekle ki tüm clientlara meme bilgisi gitsin
      setTimeout(() => {
        startVoting(room);
      }, 500);
    }
  });

  // Oy ver handler'ında (vote bölümü)
  socket.on('vote', ({ memeId }) => {
    const player = players.get(socket.id);
    if (!player) {
      console.log('❌ Vote: Player bulunamadı:', socket.id);
      return;
    }
    
    const room = gameRooms.get(player.roomId);
    if (!room || room.gameState !== 'voting') {
      console.log('❌ Vote: Room bulunamadı veya game state yanlış:', room?.gameState);
      return;
    }
    
    const meme = room.memes.find(m => m.id === memeId);
    if (!meme || meme.playerId === socket.id) {
      console.log('❌ Vote: Meme bulunamadı veya kendi mimi:', memeId, socket.id);
      return;
    }
    
    if (!room.votedPlayers) room.votedPlayers = new Set();
    if (room.votedPlayers.has(socket.id)) {
      console.log('❌ Vote: Oyuncu zaten oy vermiş:', player.name);
      return;
    }
    
    meme.votes++;
    room.votedPlayers.add(socket.id);
    
    const expectedVotes = room.players.length;
    
    console.log(`🗳️ Oy verildi: ${room.votedPlayers.size}/${expectedVotes} (${player.name} -> ${meme.playerName})`);
    
    // ✅ Tüm oyuncular oy verdiğinde hemen sonuçları hesapla
    if (room.votedPlayers.size === expectedVotes) {
      console.log('📊 Tüm oylar verildi, timer temizleniyor...');
      
      // ✅ Timer'ı hemen temizle
      if (room.roundTimer) {
        clearTimeout(room.roundTimer);
        room.roundTimer = null;
      }
      
      // ✅ Tüm oyunculara erken bittiğini bildir
      io.to(room.id).emit('voting-ended-early', { 
        message: 'Tüm oylar verildi! Sonuçlar hesaplanıyor...' 
      });
      
      // ✅ Kısa gecikme sonrası hesaplama yap
      setTimeout(() => {
        calculateScores(room);
      }, 1000);
    }
  });

  // Bağlantı koptu
  // Bağlantı koptu
  socket.on('disconnect', (reason) => {
    console.log('❌ Socket disconnect:', socket.id, 'Sebep:', reason);
    // Oyuncuyu hemen çıkarma, sadece log tut
  });
  
  // Manuel ayrılma eventi ekle
  socket.on('leave-room', () => {
    const player = players.get(socket.id);
    if (player) {
      // disconnect event handler'ında (satır 224 civarı):
      const room = gameRooms.get(player.roomId);
      if (room) {
        room.players = room.players.filter(p => p.id !== socket.id);
        delete room.scores[socket.id];
        
        // ✅ playerName'i de gönder
        io.to(player.roomId).emit('player-left', { 
          players: room.players,
          playerName: player.name  // ✅ Bu satırı ekle
        });
        
        // Odayı sadece 5 dakika sonra sil (reconnection için zaman tanı)
        if (room.players.length === 0) {
          console.log('⏰ Oda boş, 5 dakika sonra silinecek:', player.roomId);
          setTimeout(() => {
            const currentRoom = gameRooms.get(player.roomId);
            if (currentRoom && currentRoom.players.length === 0) {
              console.log('🗑️ Boş oda siliniyor:', player.roomId);
              gameRooms.delete(player.roomId);
            }
          }, 5 * 60 * 1000); // 5 dakika
        }
      }
      players.delete(socket.id);
    }
  });
  
  // Lobby chat mesajı gönder - ✅ io.on('connection') bloğunun içinde
  // Bu bloğu tamamen sil (358-383 satırları):
  // 358-383 satırları arasındaki bu kodu tamamen silin:
//  socket.on('send-lobby-message', (data) => {
 //   const { roomCode, message, playerName } = data;
 //   const room = gameRooms.get(roomCode);
    
 //  if (!room) {
  //    socket.emit('error', { message: 'Oda bulunamadı' });
  //    return;
  //  }
    
 //   const chatMessage = {
 //     id: uuidv4(),
 //     playerName,
 //     message,
 //     timestamp: new Date()
 //   };
    
 //   if (!room.chatHistory) {
 //     room.chatHistory = [];
 //   }
 //   room.chatHistory.push(chatMessage);
    // Son 100 mesajı tut
 //   if (room.chatHistory.length > 100) {
  //    room.chatHistory = room.chatHistory.slice(-100);
  //  }
    
  //  io.to(roomCode).emit('lobby-message', chatMessage);
  //  console.log('✅ Real-time sync: Chat mesajı gönderildi');
  //});

  // Room bilgilerini getir - ✅ io.on('connection') bloğunun içinde
  // get-room-info event handler'ını güncelle (yaklaşık 430-500. satırlar)
socket.on('get-room-info', ({ roomCode, playerInfo }) => {
  console.log('📋 Room bilgisi istendi:', roomCode, 'Player:', playerInfo);
  
  const room = gameRooms.get(roomCode);
  if (!room) {
    socket.emit('error', { message: 'Oda bulunamadı!', code: 'ROOM_NOT_FOUND' });
    return;
  }
  
  // Eğer playerInfo varsa (localStorage'dan geliyorsa), kullanıcıyı tekrar odaya katıl
  if (playerInfo && playerInfo.name) {
    const existingPlayer = room.players.find(p => p.name === playerInfo.name);
    
    if (!existingPlayer) {
      const player = {
        id: socket.id,
        name: playerInfo.name,
        roomId: roomCode,
        score: room.scores[playerInfo.id] || 0
      };
      
      room.players.push(player);
      room.scores[socket.id] = room.scores[playerInfo.id] || 0;
      players.set(socket.id, player); // ✅ Bu zaten doğru
      
      socket.join(roomCode);
      console.log('🔄 Kullanıcı odaya tekrar katıldı:', playerInfo.name);
      
      socket.emit('room-info', {
        players: room.players,
        gameState: room.gameState,
        currentRound: room.currentRound,
        maxRounds: room.maxRounds,
        chatHistory: room.chatHistory || [],
        gameSettings: room.gameSettings,
        statusCards: room.availableCards || [],
        situationCard: room.situationCard
      });
      
      setTimeout(() => {
        socket.to(roomCode).emit('player-joined', { 
          players: room.players, 
          player 
        });
      }, 150);
      
      return;
    } else {
      // ✅ CRITICAL FIX: Mevcut oyuncunun socket ID'sini güncelle
      const oldSocketId = existingPlayer.id;
      const oldScore = room.scores[oldSocketId] || existingPlayer.score || 0;
      
      // ✅ FIX 1: Eski socket ID'yi players Map'inden temizle
      if (oldSocketId !== socket.id) {
        players.delete(oldSocketId);
        delete room.scores[oldSocketId];
      }
      
      // ✅ FIX 2: Yeni socket ID ile güncelle
      existingPlayer.id = socket.id;
      room.scores[socket.id] = oldScore;
      
      // ✅ FIX 3: YENİ SOCKET ID ile players Map'ini güncelle
      players.set(socket.id, existingPlayer);
      
      socket.join(roomCode);
      
      console.log(`🔄 Socket ID güncellendi: ${playerInfo.name} (${oldSocketId} → ${socket.id}) Score: ${oldScore}`);
    }
  }
  
  socket.emit('room-info', {
    players: room.players,
    gameState: room.gameState,
    currentRound: room.currentRound,
    maxRounds: room.maxRounds,
    chatHistory: room.chatHistory || [],
    gameSettings: room.gameSettings,
    roundStartTime: room.roundStartTime,
    statusCards: room.availableCards || [],
    situationCard: room.situationCard
  });
});

  // Diğer tüm socket event handler'ları da burada olmalı...
  // start-game, leave-room, disconnect, vs.
  
});

// Yeni tur başlat
function startNewRound(room) {
  room.currentRound++;
  room.gameState = 'playing';
  room.memes = [];
  room.roundStartTime = Date.now(); // Round başlangıç zamanını kaydet
  room.votedPlayers = new Set();
  
  // ✅ FIX: Önceki timer'ları temizle
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }
  
  // İlk turda mevcut kartları seç
  if (room.currentRound === 1) {
    room.availableCards = selectStatusCards(room.gameSettings, room.usedCards);
  }
  
  // Eğer mevcut kartlar biterse, yenilerini seç
  if (room.availableCards.length === 0) {
    room.usedCards = []; // Kullanılmış kartları sıfırla
    room.availableCards = selectStatusCards(room.gameSettings, room.usedCards);
  }
  
  console.log('DEBUG STATUS CARDS: startNewRound - room.availableCards before selection:', room.availableCards);
  console.log('DEBUG STATUS CARDS: startNewRound - room.availableCards type:', typeof room.availableCards);
  console.log('DEBUG STATUS CARDS: startNewRound - room.availableCards length:', room.availableCards.length);
  
  // Rastgele bir kart seç ve kullanılmış kartlara ekle
  const randomIndex = Math.floor(Math.random() * room.availableCards.length);
  const selectedCard = room.availableCards[randomIndex];
  
  // Kartı kullanılmış kartlara ekle ve mevcut kartlardan çıkar
  room.usedCards.push(selectedCard);
  room.availableCards.splice(randomIndex, 1);
  
  room.situationCard = selectedCard;
  
  const emitData = {
    round: room.currentRound,
    maxRounds: room.maxRounds,
    situationCard: selectedCard,
    // statusCards kaldırıldı - her round'da sadece 1 durum kartı (situationCard) olmalı
    gameState: 'playing',
    timeLeft: room.gameSettings?.memeCreationTime || 2, // dakika cinsinden
    memeCreationTime: room.gameSettings?.memeCreationTime || 2,
    roundStartTime: room.roundStartTime, // Round başlangıç zamanı
    availableCards: room.availableCards.length,
    usedCards: room.usedCards.length
  };
  
  console.log('DEBUG STATUS CARDS: startNewRound - emitData.statusCards:', emitData.statusCards);
  console.log('DEBUG STATUS CARDS: startNewRound - about to emit round-started with data:', emitData);
  
  io.to(room.id).emit('round-started', emitData);
  
  console.log('DEBUG STATUS CARDS: startNewRound - round-started emitted successfully');
  
  // Oyun ayarlarından meme oluşturma süresini al (dakika cinsinden, milisaniyeye çevir)
  const memeCreationTimeMs = (room.gameSettings?.memeCreationTime || 2) * 60000;
  console.log(`⏰ Meme oluşturma süresi: ${room.gameSettings?.memeCreationTime || 2} dakika (${memeCreationTimeMs}ms)`);
  
  room.roundTimer = setTimeout(() => {
    // ✅ FIX: Sadece hala 'playing' state'indeyse oylama başlat
    if (room.gameState === 'playing' && room.memes.length > 0) {
      startVoting(room);
    }
  }, memeCreationTimeMs);
}

// Oylama başlat
// Oylama başlat
function startVoting(room) {
  console.log('\n=== OYLAMA BAŞLIYOR DEBUG ===');
  console.log('🎮 Room ID:', room.id);
  console.log('📝 Memes Count:', room.memes.length);
  console.log('👥 Players:', room.players.map(p => p.name));
  console.log('🎯 Game State Before:', room.gameState);
  
  // ✅ DÜZELTME: Meme detayları debug
  console.log('📋 Meme detayları:');
  room.memes.forEach(meme => {
    console.log(`  - ${meme.playerName} (${meme.playerId}): "${meme.topText}" / "${meme.bottomText}"`);
  });
  
  room.gameState = 'voting';
  clearTimeout(room.roundTimer);
  
  // ✅ DÜZELTME: Her oyuncuya kendi mimi hariç diğer mimleri gönder
  room.players.forEach(player => {
    // ✅ DÜZELTME: Socket bulma mantığını düzelt
    const playerSocket = [...io.sockets.sockets.values()].find(s => s.id === player.id);
    
    if (playerSocket) {
      // ✅ DÜZELTME: Player ID ile filtreleme yap (socket ID değil)
      const memesForPlayer = room.memes
        .filter(meme => meme.playerId !== player.id) // player.id ile karşılaştır, socket.id değil
        .sort(() => Math.random() - 0.5); // Karıştır
      
      console.log(`📤 ${player.name} (${player.id}) için ${memesForPlayer.length} meme gönderiliyor...`);
      console.log(`   Filtrelenen mimler:`, memesForPlayer.map(m => `${m.playerName}(${m.playerId})`));
      console.log('🔧 DEBUG: room.gameSettings.votingTime:', room.gameSettings?.votingTime);
      const votingTimeToSend = room.gameSettings?.votingTime || 60;
      console.log('🔧 DEBUG: Gönderilecek votingTime:', votingTimeToSend);
      
      playerSocket.emit('voting-started', { 
        memes: memesForPlayer,
        totalMemes: room.memes.length,
        playersCount: room.players.length,
        votingTime: votingTimeToSend // saniye cinsinden
      });
    } else {
      console.log(`❌ Socket bulunamadı: ${player.name} (${player.id})`);
    }
  });
  
  console.log('🎯 Game State After:', room.gameState);
  console.log('========================\n');
  
  // Oyun ayarlarından oylama süresini al (saniye cinsinden, milisaniyeye çevir)
  const votingTimeMs = (room.gameSettings?.votingTime || 60) * 1000;
  console.log(`⏰ Oylama süresi: ${room.gameSettings?.votingTime || 60} saniye (${votingTimeMs}ms)`);
  
  room.roundTimer = setTimeout(() => {
    console.log('⏰ Oylama süresi doldu, sonuçlar hesaplanıyor...');
    calculateScores(room);
  }, votingTimeMs);
}

// Puanları hesapla
function calculateScores(room) {
  // ✅ GUARD: Eğer zaten sonuçlar hesaplanıyorsa veya game state 'voting' değilse çık
  if (room.gameState !== 'voting') {
    console.log('❌ calculateScores: Game state voting değil:', room.gameState);
    return;
  }
  
  // ✅ Hemen state'i değiştir ki tekrar çağrılmasın
  room.gameState = 'results';
  
  // ✅ Timer'ı kesinlikle temizle
  if (room.roundTimer) {
    clearTimeout(room.roundTimer);
    room.roundTimer = null;
  }

  console.log('\n=== SKOR HESAPLANIYOR ===');
  console.log('🎯 Room:', room.id, 'Round:', room.currentRound);
  
  // ✅ Skor anahtarlarını hazırla
  room.players.forEach(p => {
    if (typeof room.scores[p.id] !== 'number') {
      room.scores[p.id] = 0;
    }
  });

  // ✅ Alınan oy kadar puan ver
  room.memes.forEach(m => {
    room.scores[m.playerId] += m.votes;
    console.log(`📊 ${m.playerName}: +${m.votes} puan (Toplam: ${room.scores[m.playerId]})`);
  });

  // Görselleme için memeleri oy sayısına göre sırala
  const sortedMemes = room.memes.sort((a, b) => b.votes - a.votes);

  io.to(room.id).emit('round-results', {
    memes: sortedMemes,
    scores: room.scores
  });

  // ✅ Temizlik
  room.votedPlayers = new Set();
  room.memes = [];

  console.log('🏁 Sonuçlar gönderildi, 10 saniye sonra yeni tur...');

  // ✅ Tur ilerlet
  if (room.currentRound >= room.maxRounds) {
    endGame(room);
  } else {
    setTimeout(() => {
      // ✅ Ek guard - eğer room silinmişse yeni tur başlatma
      if (gameRooms.has(room.id)) {
        startNewRound(room);
      }
    }, 10000);
  }
}

// Oyunu bitir
function endGame(room) {
  room.gameState = 'finished';
  
  const finalScores = Object.entries(room.scores)
    .map(([playerId, score]) => ({
      player: room.players.find(p => p.id === playerId),
      score
    }))
    .sort((a, b) => b.score - a.score);
  
  // Host transfer için 30 saniyelik timer başlat
  room.hostTransferTimer = setTimeout(() => {
    handleHostTransferTimeout(room);
  }, 30000);
  
  io.to(room.id).emit('game-finished', { finalScores });
}

// Host transfer timeout handler
function handleHostTransferTimeout(room) {
  console.log('⏰ Host transfer timeout for room:', room.id);
  
  // Lobiye dönen oyuncuları kontrol et
  const playersInLobby = room.playersReturningToLobby || [];
  const currentHost = room.players.find(p => p.isHost);
  
  // Eğer host lobiye dönmediyse ve başka oyuncular lobiye döndüyse
  if (currentHost && !playersInLobby.includes(currentHost.id) && playersInLobby.length > 0) {
    console.log('👑 Host lobiye dönmedi, yeni host atanıyor...');
    
    // Mevcut host'un yetkisini kaldır
    currentHost.isHost = false;
    
    // Lobiye dönen oyuncular arasından rastgele yeni host seç
    const randomIndex = Math.floor(Math.random() * playersInLobby.length);
    const newHostId = playersInLobby[randomIndex];
    const newHost = room.players.find(p => p.id === newHostId);
    
    if (newHost) {
      newHost.isHost = true;
      console.log(`✅ Yeni host atandı: ${newHost.name} (${newHost.id})`);
      
      // Tüm odaya host transfer bilgisini gönder
      io.to(room.id).emit('host-transferred', {
        newHost: {
          id: newHost.id,
          name: newHost.name
        },
        oldHost: {
          id: currentHost.id,
          name: currentHost.name
        },
        reason: 'timeout'
      });
    }
  }
  
  // Timer'ı temizle
  if (room.hostTransferTimer) {
    clearTimeout(room.hostTransferTimer);
    room.hostTransferTimer = null;
  }
}

const PORT = process.env.PORT || 8080;  // ✅ 5000 → 8080
server.listen(PORT, () => {
  console.log(`🚀 MimClash Server ${PORT} portunda çalışıyor!`);
});


// Meme upload endpoint'i ekleyelim
const multer = require('multer');
const path = require('path');

// ✅ DÜZELTME: Templates klasörünü tek yerden yönet
const fs = require('fs');
const templatesDir = path.resolve(__dirname, '../assets/meme-templates');
if (!fs.existsSync(templatesDir)) {
  fs.mkdirSync(templatesDir, { recursive: true });
}
// ✅ Statik servis: http://localhost:8080/templates/<filename>
app.use('/templates', express.static(templatesDir));

// ✅ YENİ: sounds klasörünü servis et
const soundsDir = path.resolve(__dirname, '../assets/sounds');
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}
// http://localhost:8080/sounds/clap.wav
app.use('/sounds', express.static(soundsDir));

// Multer konfigürasyonu
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, templatesDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Sadece resim dosyaları yüklenebilir!'));
    }
  }
});

// Meme template upload endpoint
app.post('/upload-template', upload.single('template'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Dosya yüklenmedi!' });
  }
  
  res.json({ 
    success: true, 
    filename: req.file.filename,
    path: `/templates/${req.file.filename}`
  });
});

// Template'leri listele
app.get('/templates', (req, res) => {
  const fs = require('fs');
  // ✅ DÜZELTME: Tek kaynaktan templatesDir kullan
  fs.readdir(templatesDir, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Template\'ler okunamadı!' });
    }
    
    const imageFiles = files.filter(file => 
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file)
    );
    
    res.json({ templates: imageFiles });
  });
});