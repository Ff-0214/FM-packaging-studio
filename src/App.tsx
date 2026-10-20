import { useState, useEffect, useRef } from 'react';
import Preview3D from './components/Preview3D';

export type FaceType = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | 'lidFront' | 'lidBack' | 'lidLeft' | 'lidRight';
export type MaterialType = 'white-card' | 'kraft' | 'black-card' | 'silver-card' | 'coated-paper' | 'grey-board';
export type BoxType = 'tuck-end' | 'rigid-lid';
export type CraftType = 'foil' | 'emboss' | 'uv';

export interface Layer {
  id: string;
  url: string;
  crafts: CraftType[];
  embossDepth: number;
  foilColor: string;
}

const DEFAULT_DIMS = { L: 120, W: 80, H: 150 };
const DEFAULT_LID_HEIGHT = 60;
const DEFAULT_MATERIAL: MaterialType = 'white-card';
const DEFAULT_BOX_TYPE: BoxType = 'tuck-end';
const DEFAULT_THICKNESS = 0.1;
const DEFAULT_BG_COLOR = '#2a2a2a';
const DEFAULT_LIGHT = {
  x: 15, y: 30, z: 15,
  targetX: 0, targetY: 5, targetZ: 0,
  intensity: 2.5, 
  penumbra: 0.5 
};
const DEFAULT_FACES: Record<FaceType, Layer[]> = {
  front: [], back: [], left: [], right: [], top: [], bottom: [],
  lidFront: [], lidBack: [], lidLeft: [], lidRight: []
};

const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.warn('读取本地数据失败，使用默认值', e);
  }
  return defaultValue;
};

function App() {
  const [dims, setDims] = useState(() => loadFromStorage('pack_dims', DEFAULT_DIMS));
  const [lidHeight, setLidHeight] = useState(() => loadFromStorage('pack_lidH', DEFAULT_LID_HEIGHT)); 
  const [activeFace, setActiveFace] = useState<FaceType>('front');
  const [material, setMaterial] = useState<MaterialType>(() => loadFromStorage('pack_material', DEFAULT_MATERIAL));
  const [boxType, setBoxType] = useState<BoxType>(() => loadFromStorage('pack_boxType', DEFAULT_BOX_TYPE));
  const [isOpen, setIsOpen] = useState(false);
  const [thickness, setThickness] = useState(() => loadFromStorage('pack_thickness', DEFAULT_THICKNESS));
  const [bgColor, setBgColor] = useState(() => loadFromStorage('pack_bgColor', DEFAULT_BG_COLOR));
  const [lightSettings, setLightSettings] = useState(() => loadFromStorage('pack_light', DEFAULT_LIGHT));
  const [faces, setFaces] = useState<Record<FaceType, Layer[]>>(() => loadFromStorage('pack_faces', DEFAULT_FACES));

  // 👇 新增：导出状态
  const [isExporting, setIsExporting] = useState(false);

  const previewContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('pack_dims', JSON.stringify(dims));
    localStorage.setItem('pack_lidH', JSON.stringify(lidHeight));
    localStorage.setItem('pack_material', JSON.stringify(material));
    localStorage.setItem('pack_boxType', JSON.stringify(boxType));
    localStorage.setItem('pack_thickness', JSON.stringify(thickness));
    localStorage.setItem('pack_bgColor', JSON.stringify(bgColor));
    localStorage.setItem('pack_light', JSON.stringify(lightSettings));
    try {
      localStorage.setItem('pack_faces', JSON.stringify(faces));
    } catch (e) {
      console.error('图片太大，本地存储空间不足！', e);
    }
  }, [dims, lidHeight, material, boxType, thickness, bgColor, lightSettings, faces]);

  const clearLocalData = () => {
    if (window.confirm('确定要清空所有本地保存的设计和图片吗？')) {
      localStorage.clear();
      window.location.reload();
    }
  };

  const handleExport = () => {
    // 1. 开启导出状态，让 3D 区域隐藏辅助线
    setIsExporting(true);

    // 2. 延迟 150ms，等待浏览器把隐藏辅助线的画面渲染出来
    setTimeout(() => {
      const container = previewContainerRef.current;
      if (container) {
        const canvas = container.querySelector('canvas');
        if (canvas) {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = canvas.width;
          tempCanvas.height = canvas.height;
          const ctx = tempCanvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
            ctx.drawImage(canvas, 0, 0);

            const dataUrl = tempCanvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `包装设计_${new Date().toLocaleTimeString().replace(/:/g, '-')}.png`;
            link.href = dataUrl;
            link.click();
          }
        }
      }
      // 3. 截图完成，恢复显示辅助线
      setIsExporting(false);
    }, 150);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const newLayer: Layer = {
        id: Math.random().toString(36).substring(2, 9),
        url: event.target?.result as string,
        crafts: [],
        embossDepth: 0.05,
        foilColor: '#FFD700'
      };
      setFaces((prev) => ({
        ...prev,
        [activeFace]: [...prev[activeFace], newLayer]
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const toggleLayerCraft = (layerId: string, craft: CraftType) => {
    setFaces((prev) => ({
      ...prev,
      [activeFace]: prev[activeFace].map((l) => {
        if (l.id === layerId) {
          const hasCraft = l.crafts.includes(craft);
          return {
            ...l,
            crafts: hasCraft ? l.crafts.filter(c => c !== craft) : [...l.crafts, craft]
          };
        }
        return l;
      })
    }));
  };

  const updateLayerEmboss = (layerId: string, depth: number) => {
    setFaces((prev) => ({
      ...prev,
      [activeFace]: prev[activeFace].map((l) => l.id === layerId ? { ...l, embossDepth: depth } : l)
    }));
  };

  const updateLayerFoilColor = (layerId: string, color: string) => {
    setFaces((prev) => ({
      ...prev,
      [activeFace]: prev[activeFace].map((l) => l.id === layerId ? { ...l, foilColor: color } : l)
    }));
  };

  const removeLayer = (layerId: string) => {
    setFaces((prev) => ({
      ...prev,
      [activeFace]: prev[activeFace].filter((l) => l.id !== layerId)
    }));
  };

  const faceLabels: Record<FaceType, string> = {
    front: '底盒-正面', back: '底盒-背面', left: '底盒-左侧', right: '底盒-右侧', bottom: '底盒-底面', 
    top: '盖子-顶面',
    lidFront: '盖子-正面', lidBack: '盖子-背面', lidLeft: '盖子-左侧', lidRight: '盖子-右侧'
  };

  const availableFaces: FaceType[] = boxType === 'tuck-end' 
    ? ['front', 'back', 'left', 'right', 'top', 'bottom']
    : ['front', 'back', 'left', 'right', 'bottom', 'lidFront', 'lidBack', 'lidLeft', 'lidRight', 'top'];

  const updateLight = (key: keyof typeof lightSettings, value: number) => {
    setLightSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{ padding: '1rem', fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>包装设计工作台 - 多图层工艺版</h1>
        
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleExport} style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            📥 导出高清图片
          </button>
          <button onClick={clearLocalData} style={{ padding: '6px 12px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            🗑️ 清空本地数据
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '15px', marginBottom: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '5px', background: '#f0f0f0', padding: '8px 12px', borderRadius: '4px' }}>
          <span style={{ fontWeight: 'bold' }}>尺寸(mm):</span>
          <label>长: <input type="number" name="L" value={dims.L} onChange={(e) => setDims({...dims, L: Number(e.target.value)})} style={{ width: '50px' }} /></label>
          <label>宽: <input type="number" name="W" value={dims.W} onChange={(e) => setDims({...dims, W: Number(e.target.value)})} style={{ width: '50px' }} /></label>
          <label>高: <input type="number" name="H" value={dims.H} onChange={(e) => setDims({...dims, H: Number(e.target.value)})} style={{ width: '50px' }} /></label>
        </div>
        
        <div style={{ display: 'flex', gap: '5px', background: '#f0f0f0', padding: '8px 12px', borderRadius: '4px' }}>
          <span style={{ fontWeight: 'bold' }}>厚度:</span>
          <input type="range" min="0.02" max="0.3" step="0.01" value={thickness} onChange={(e) => setThickness(Number(e.target.value))} style={{ width: '80px' }} />
        </div>

        <div style={{ display: 'flex', gap: '5px', background: '#f0f0f0', padding: '8px 12px', borderRadius: '4px' }}>
          <select value={boxType} onChange={(e) => {
            const newType = e.target.value as BoxType;
            setBoxType(newType);
            setActiveFace(newType === 'tuck-end' ? 'front' : 'front');
          }} style={{ padding: '4px' }}>
            <option value="tuck-end">管式折叠盒</option>
            <option value="rigid-lid">天地盖礼盒</option>
          </select>
          
          <select value={material} onChange={(e) => setMaterial(e.target.value as MaterialType)} style={{ padding: '4px' }}>
            <option value="white-card">白卡纸</option>
            <option value="kraft">牛皮纸</option>
            <option value="black-card">黑卡纸</option>
            <option value="silver-card">银卡纸</option>
            <option value="coated-paper">铜版纸</option>
            <option value="grey-board">灰板</option>
          </select>
        </div>

        {boxType === 'rigid-lid' && (
          <div style={{ display: 'flex', gap: '5px', background: '#eef2f5', padding: '8px 12px', borderRadius: '4px', border: '1px solid #dcdcdc', alignItems: 'center' }}>
            <span style={{ fontWeight: 'bold' }}>盖子高:</span>
            <input 
              type="range" 
              min="10" 
              max={dims.H - 10} 
              value={lidHeight} 
              onChange={(e) => setLidHeight(Number(e.target.value))} 
              style={{ width: '100px' }} 
            />
            <span style={{ fontSize: '13px', color: '#666', width: '35px' }}>{lidHeight}mm</span>
          </div>
        )}

        <button onClick={() => setIsOpen(!isOpen)} style={{ padding: '8px 16px', background: isOpen ? '#e74c3c' : '#f39c12', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
          {isOpen ? '关闭盒子' : '打开盒子'}
        </button>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#eef2f5', padding: '6px 12px', borderRadius: '4px', border: '1px solid #dcdcdc' }}>
          <span style={{ fontWeight: 'bold', fontSize: '13px' }}>场景背景:</span>
          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} style={{ width: '30px', height: '30px', cursor: 'pointer', border: 'none', background: 'transparent' }} />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2rem', flex: 1, overflow: 'hidden' }}>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f9f9f9', padding: '1rem', borderRadius: '8px', border: '1px solid #ddd', overflowY: 'auto' }}>
          
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
            {availableFaces.map((face) => (
              <button
                key={face}
                onClick={() => setActiveFace(face)}
                style={{ padding: '6px 12px', cursor: 'pointer', borderRadius: '4px', border: 'none', background: activeFace === face ? '#4a90d9' : '#e0e0e0', color: activeFace === face ? 'white' : '#333' }}
              >
                {faceLabels[face]} ({faces[face].length})
              </button>
            ))}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'inline-block', padding: '10px 20px', background: '#27ae60', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
              添加图层到【{faceLabels[activeFace]}】
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} />
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {faces[activeFace].slice().reverse().map((layer, index) => (
              <div key={layer.id} style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #eee' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img src={layer.url} alt="layer" style={{ width: '50px', height: '50px', objectFit: 'cover', border: '1px solid #ccc', borderRadius: '4px' }} />
                  <div style={{ flex: 1, fontSize: '13px', color: '#555' }}>图层 {faces[activeFace].length - index}</div>
                  <button onClick={() => removeLayer(layer.id)} style={{ padding: '6px 12px', background: '#ff4d4f', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>删除</button>
                </div>
                
                <div style={{ display: 'flex', gap: '15px', background: '#f5f7fa', padding: '8px', borderRadius: '4px' }}>
                  {(['foil', 'emboss', 'uv'] as CraftType[]).map(craft => (
                    <label key={craft} style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: layer.crafts.includes(craft) ? '#4a90d9' : '#333', fontWeight: layer.crafts.includes(craft) ? 'bold' : 'normal' }}>
                      <input type="checkbox" checked={layer.crafts.includes(craft)} onChange={() => toggleLayerCraft(layer.id, craft)} style={{ cursor: 'pointer' }} />
                      {craft === 'foil' ? '✨ 烫金' : craft === 'emboss' ? '📐 击凸' : '💧 局部UV'}
                    </label>
                  ))}
                </div>

                {layer.crafts.includes('foil') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fffdf0', padding: '8px', borderRadius: '4px', border: '1px solid #f9e79f' }}>
                    <span style={{ fontSize: '12px', color: '#b7950b', fontWeight: 'bold' }}>烫金色号:</span>
                    <input 
                      type="color" 
                      value={layer.foilColor} 
                      onChange={(e) => updateLayerFoilColor(layer.id, e.target.value)} 
                      style={{ width: '30px', height: '30px', cursor: 'pointer', border: 'none', background: 'transparent' }}
                    />
                    <span style={{ fontSize: '12px', color: '#666' }}>{layer.foilColor}</span>
                  </div>
                )}

                {layer.crafts.includes('emboss') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff8e1', padding: '8px', borderRadius: '4px', border: '1px solid #ffe0b2' }}>
                    <span style={{ fontSize: '12px', color: '#d84315', fontWeight: 'bold', whiteSpace: 'nowrap' }}>击凸厚度:</span>
                    <input 
                      type="range" min="0.01" max="0.4" step="0.01" 
                      value={layer.embossDepth} 
                      onChange={(e) => updateLayerEmboss(layer.id, Number(e.target.value))} 
                      style={{ flex: 1 }}
                    />
                    <span style={{ fontSize: '12px', color: '#d84315', width: '30px' }}>{layer.embossDepth}</span>
                  </div>
                )}
              </div>
            ))}
            {faces[activeFace].length === 0 && (
              <div style={{ textAlign: 'center', color: '#999', padding: '20px' }}>当前面暂无图层</div>
            )}
          </div>
        </div>

        <div ref={previewContainerRef} style={{ flex: 1.2, borderRadius: '8px', overflow: 'hidden', background: bgColor, position: 'relative' }}>
          
          <div style={{ position: 'absolute', top: 15, right: 15, zIndex: 10, background: 'rgba(20,20,20,0.85)', color: 'white', padding: '12px', borderRadius: '8px', fontSize: '12px', width: '220px', backdropFilter: 'blur(4px)' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', borderBottom: '1px solid #555', paddingBottom: '4px' }}>💡 主光源控制</div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>亮度:</span>
              <input type="range" min="0" max="5" step="0.1" value={lightSettings.intensity} onChange={(e) => updateLight('intensity', Number(e.target.value))} style={{ width: '120px' }} />
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span>边缘柔和度:</span>
              <input type="range" min="0" max="1" step="0.05" value={lightSettings.penumbra} onChange={(e) => updateLight('penumbra', Number(e.target.value))} style={{ width: '120px' }} />
            </div>

            <div style={{ marginTop: '8px', fontWeight: 'bold', fontSize: '11px', color: '#aaa' }}>光源位置 (XYZ)</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>X:</span>
              <input type="range" min="-50" max="50" value={lightSettings.x} onChange={(e) => updateLight('x', Number(e.target.value))} style={{ width: '120px' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Y:</span>
              <input type="range" min="-50" max="50" value={lightSettings.y} onChange={(e) => updateLight('y', Number(e.target.value))} style={{ width: '120px' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Z:</span>
              <input type="range" min="-50" max="50" value={lightSettings.z} onChange={(e) => updateLight('z', Number(e.target.value))} style={{ width: '120px' }} />
            </div>

            <div style={{ marginTop: '8px', fontWeight: 'bold', fontSize: '11px', color: '#aaa' }}>照射目标点 (XYZ)</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>X:</span>
              <input type="range" min="-30" max="30" value={lightSettings.targetX} onChange={(e) => updateLight('targetX', Number(e.target.value))} style={{ width: '120px' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Y:</span>
              <input type="range" min="-30" max="30" value={lightSettings.targetY} onChange={(e) => updateLight('targetY', Number(e.target.value))} style={{ width: '120px' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Z:</span>
              <input type="range" min="-30" max="30" value={lightSettings.targetZ} onChange={(e) => updateLight('targetZ', Number(e.target.value))} style={{ width: '120px' }} />
            </div>
          </div>

          <Preview3D dims={dims} lidHeight={lidHeight} faces={faces} material={material} boxType={boxType} isOpen={isOpen} thickness={thickness} bgColor={bgColor} isExporting={isExporting} lightSettings={lightSettings} />
        </div>
      </div>
    </div>
  );
}

export default App;