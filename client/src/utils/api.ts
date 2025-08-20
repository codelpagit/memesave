export const API_BASE_URL = 'http://localhost:8080';  // ✅ 5000 → 8080

export const uploadMeme = async (memeData: {
  topText: string;
  bottomText: string;
  template: string;
  roomCode: string;
  playerId: string;
}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/upload-meme`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(memeData),
    });
    
    if (!response.ok) {
      throw new Error('Meme yükleme başarısız');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Meme yükleme hatası:', error);
    throw error;
  }
};

export const getMemeTemplates = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/templates`);
    
    if (!response.ok) {
      throw new Error('Template listesi alınamadı');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Template listesi hatası:', error);
    throw error;
  }
};