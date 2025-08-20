import React, { useState, useRef, useEffect } from 'react';
import { Canvas, Image as FabricImage, IText, PencilBrush, Object as FabricObject } from 'fabric';

interface Template {
  id: string;
  name: string;
  path: string;
}

interface MemeEditorProps {
  onMemeCreated: (imageData: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

const templates: Template[] = [
  { id: 'mim1', name: 'Template 1', path: '/assets/images/mim1.jpg' },
  { id: 'mim2', name: 'Template 2', path: '/assets/images/mim2.jpg' },
  { id: 'mim3', name: 'Template 3', path: '/assets/images/mim3.jpg' },
  { id: 'mim4', name: 'Template 4', path: '/assets/images/mim4.jpg' }
];

type Tool = 'select' | 'text' | 'brush';

const MemeEditor: React.FC<MemeEditorProps> = ({ onMemeCreated, onCancel, disabled = false }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [isLoading, setIsLoading] = useState(false);

  // ✅ Hook'ları komponent içine taşı
  const [serverTemplates, setServerTemplates] = useState<Template[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // ✅ useEffect'i de komponent içine taşı
  useEffect(() => {
    const SERVER_URL = process.env.REACT_APP_SERVER_URL ?? 'http://localhost:8080';
    fetch(`${SERVER_URL}/templates`)
      .then((res) => {
        if (!res.ok) throw new Error('Templates fetch failed');
        return res.json();
      })
      .then((data: { templates: string[] }) => {
        const mapped: Template[] = data.templates.map((file) => ({
          id: file,
          name: file, // Dosya adını isim olarak kullan
          path: `${SERVER_URL}/templates/${file}`,
        }));
        setServerTemplates(mapped);
      })
      .catch((err) => {
        console.warn('Template listesi alınamadı, local templates kullanılacak:', err);
        setServerTemplates([]); // Local templates fallback için boş bırak
      });
  }, []);

  // ✅ Filtreleme mantığını da komponent içine taşı
  const displayTemplates: Template[] = serverTemplates.length > 0 ? serverTemplates : templates;
  const filteredTemplates: Template[] = displayTemplates.filter((t) =>
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const [brushSize, setBrushSize] = useState<number>(6);
  const [brushColor, setBrushColor] = useState<string>('#000000');
  const [textColor, setTextColor] = useState<string>('#000000'); // ✅ Siyah yapıldı
  const [fontSize, setFontSize] = useState<number>(32);

  // Canvas init: bir kere kur, unmount'ta dispose et
  useEffect(() => {
    if (!canvasRef.current) return;
    const c = new Canvas(canvasRef.current, {
      width: 600,
      height: 400,
      backgroundColor: '#f3f4f6',
      preserveObjectStacking: true,
    });
    setCanvas(c);
    return () => {
      c.dispose();
    };
  }, []);

  // Aktif araca göre modları güncelle (brush/select)
  useEffect(() => {
    if (!canvas) return;
    const isBrush = activeTool === 'brush';
    const isSelect = activeTool === 'select';
  
    // Yalnızca brush modunu ve selection'ı değiştir
    canvas.isDrawingMode = isBrush;
    canvas.selection = isSelect;
  
    // Objelerin seçilebilirliğini SADECE select moduna geçerken topluca aç
    if (isSelect) {
      canvas.getObjects().forEach((obj: FabricObject) => {
        obj.selectable = true;
        obj.evented = true;
      });
    }
  
    if (isBrush) {
      if (!canvas.freeDrawingBrush) {
        canvas.freeDrawingBrush = new PencilBrush(canvas);
      }
      canvas.freeDrawingBrush.width = brushSize;
      canvas.freeDrawingBrush.color = brushColor;
    }
    canvas.requestRenderAll();
  }, [canvas, activeTool, brushSize, brushColor]);

  // Brush çizgisi eklendiğinde nesneyi öne getir ve görünürlüğünü garanti et
  useEffect(() => {
    if (!canvas) return;
    const onPathCreated = (e: any) => {
      const p = e?.path ?? e?.target;
      if (!p) return;
      p.visible = true;
      p.selectable = false; // brush modunda seçilmesin
      p.evented = false;
      canvas.bringObjectToFront(p); // çizgi her zaman en üstte olsun
      canvas.requestRenderAll();
    };
    canvas.on('path:created', onPathCreated);
    return () => {
      canvas.off('path:created', onPathCreated);
    };
  }, [canvas]);

  // Text aracı: tıklama ile metin ekle
  useEffect(() => {
    if (!canvas) return;
    const handleMouseDown = (e: any) => {
      if (activeTool !== 'text') return;
      const p = canvas.getPointer(e.e);
      const t = new IText('Metin Yaz', { // ✅ Daha açık placeholder
        left: p.x,
        top: p.y,
        fontSize: fontSize,
        fill: textColor,
        stroke: '#FFFFFF', // ✅ Beyaz kontur eklendi
        strokeWidth: 1,
        fontFamily: 'Impact, Arial Black, sans-serif',
        fontWeight: 'bold', // ✅ Kalın yazı
        editable: true,
      });
      // Metni görünür, seçilebilir yap ve en öne al
      t.visible = true;
      t.selectable = true;
      t.evented = true;
      canvas.add(t);
      canvas.setActiveObject(t);
      canvas.bringObjectToFront(t); // metni en üste taşı
      canvas.requestRenderAll();
      t.enterEditing();
      t.selectAll();
    };
    canvas.on('mouse:down', handleMouseDown);
    return () => { 
      canvas.off('mouse:down', handleMouseDown); 
    };
  }, [canvas, activeTool, fontSize, textColor]);

  // Template yükleme: canvas.set ile backgroundImage ayarlama
  const addTemplate = async (template: Template): Promise<void> => {
    if (!canvas) return;
    
    try {
      console.log('Template yükleniyor:', template.path);
      
      const img = await FabricImage.fromURL(template.path, {
        crossOrigin: 'anonymous',
      });
      
      canvas.clear();
      canvas.backgroundColor = '#f3f4f6';
      
      const imgWidth = img.width || 600;
      const imgHeight = img.height || 400;
      const scaleX = 600 / imgWidth;
      const scaleY = 400 / imgHeight;
      const scale = Math.min(scaleX, scaleY);
      
      img.set({
        left: (600 - imgWidth * scale) / 2,
        top: (400 - imgHeight * scale) / 2,
        scaleX: scale,
        scaleY: scale,
        selectable: false,
        evented: false,
      });
      
      canvas.set('backgroundImage', img);
      canvas.requestRenderAll();
      setSelectedTemplate(template);
      
      console.log('Template başarıyla eklendi');
    } catch (error) {
      console.error('Template yükleme hatası:', error);
      alert('Template yüklenemedi. Lütfen tekrar deneyin.');
    }
  };

  // Temizleme: Tüm objeleri sil
  const clearCanvas = (): void => {
    if (!canvas) return;
    canvas.getObjects().forEach((obj: FabricObject) => canvas.remove(obj));
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  };

  // Export: yüksek netlik (retina)
  const exportMeme = (): void => {
    if (!canvas || !selectedTemplate) {
      alert('Lütfen bir template seçin!');
      return;
    }
    canvas.discardActiveObject();
    canvas.requestRenderAll();
    
    // ✅ DÜZELTME: Resim boyutunu optimize et (transport error'ı önlemek için)
    const dataURL = canvas.toDataURL({ 
      format: 'jpeg',  // PNG yerine JPEG (daha küçük boyut)
      multiplier: 1.5, // 2'den 1.5'e düşür
      quality: 0.8     // 0.9'dan 0.8'e düşür
    });
    
    // ✅ DÜZELTME: Data boyutunu kontrol et
    const sizeInMB = (dataURL.length * 0.75) / (1024 * 1024); // Base64 size estimation
    console.log(`📊 Meme boyutu: ${sizeInMB.toFixed(2)}MB`);
    
    if (sizeInMB > 5) {
      // Daha fazla optimize et
      const optimizedDataURL = canvas.toDataURL({ 
        format: 'jpeg',
        multiplier: 1,
        quality: 0.6
      });
      console.log(`🔧 Optimize edildi: ${((optimizedDataURL.length * 0.75) / (1024 * 1024)).toFixed(2)}MB`);
      onMemeCreated(optimizedDataURL);
    } else {
      onMemeCreated(dataURL);
    }
  };

  // ⏱️ Zamanlayıcı/cleanup örneği (varsa)
  useEffect(() => {
    return () => {
      // örn: editTimer.current && clearTimeout(editTimer.current)
    };
  }, []);

  const colors = ['#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF'];

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6">
      <h3 className="text-xl font-semibold mb-4">🎨 Gelişmiş Meme Editörü</h3>
      
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
        {/* Tools */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTool('select')}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === 'select' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-100'
            }`}
            title="Seç"
          >
            🖱️
          </button>
          <button
            onClick={() => setActiveTool('text')}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === 'text' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-100'
            }`}
            title="Metin"
          >
            📝
          </button>
          <button
            onClick={() => setActiveTool('brush')}
            className={`p-2 rounded-lg transition-colors ${
              activeTool === 'brush' ? 'bg-blue-500 text-white' : 'bg-white hover:bg-gray-100'
            }`}
            title="Fırça"
          >
            🖌️
          </button>
        </div>

        {/* Brush Settings */}
        {activeTool === 'brush' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Boyut:</label>
              <input
                type="range"
                min="1"
                max="20"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm w-6">{brushSize}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Renk:</label>
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="w-8 h-8 rounded border"
              />
            </div>
          </>
        )}

        {/* Text Settings */}
        {activeTool === 'text' && (
          <>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Boyut:</label>
              <input
                type="range"
                min="12"
                max="72"
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm w-8">{fontSize}</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Renk:</label>
              <input
                type="color"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
                className="w-8 h-8 rounded border"
              />
            </div>
          </>
        )}

        {/* Clear Button */}
        <button
          onClick={clearCanvas}
          className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          title="Temizle"
        >
          🗑️
        </button>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Template Selector */}
        <div className="lg:col-span-1">
          <h4 className="font-semibold mb-3">📁 Template Seç</h4>

          {/* ✅ Yeni: Arama kutusu */}
          <div className="mb-2">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Template ara (dosya adına göre)..."
              className="w-full p-2 border border-gray-300 rounded-md"
              disabled={disabled}
            />
          </div>

          {/* ✅ Kaydırılabilir alan - sabit yükseklik */}
          <div className="h-96 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-gray-50">
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              {filteredTemplates.map((template: Template) => (
                <div
                  key={template.id}
                  onClick={() => !disabled && addTemplate(template)}
                  className={`relative aspect-square rounded-lg cursor-pointer border-2 transition-all overflow-hidden ${
                    selectedTemplate?.id === template.id
                      ? 'border-blue-500 ring-2 ring-blue-200'
                      : 'border-gray-300 hover:border-gray-400'
                  } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <img
                    src={template.path}
                    alt={template.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y3ZjdmNyIvPjx0ZXh0IHg9IjUwIiB5PSI1NSIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjE0IiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIj7wn5aW77iPPC90ZXh0Pjwvc3ZnPg==';
                    }}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-xs p-1 text-center">
                    {template.name.replace(/\.(jpe?g|png|gif|webp|bmp|svg)$/i, '')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Canvas Area */}
        <div className="lg:col-span-3">
          <div className="bg-gray-100 rounded-lg p-4 flex justify-center">
            <div className="border border-gray-300 rounded-lg bg-white inline-block">
              <canvas ref={canvasRef} className="block" />
            </div>
          </div>
          
          {/* Instructions */}
          <div className="mt-3 text-sm text-gray-600">
            {activeTool === 'select' && '🖱️ Nesneleri seçmek ve taşımak için tıklayın'}
            {activeTool === 'text' && '📝 Metin eklemek için canvas üzerine tıklayın'}
            {activeTool === 'brush' && '🖌️ Çizmek için mouse ile sürükleyin'}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 mt-6">
        <button
          onClick={onCancel}
          disabled={disabled}
          className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          ❌ İptal
        </button>
        <button
          onClick={exportMeme}
          disabled={!selectedTemplate || disabled}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          📤 Meme'i Gönder
        </button>
      </div>
    </div>
  );
};

export default MemeEditor;