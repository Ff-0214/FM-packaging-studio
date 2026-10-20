import { useMemo, useRef, Suspense, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, useTexture, ContactShadows, Environment, Lightformer, Line } from '@react-three/drei';
import * as THREE from 'three';
import type { FaceType, MaterialType, BoxType, Layer } from '../App';

interface Dims { L: number; W: number; H: number; }
interface PreviewProps {
  dims: Dims;
  lidHeight: number;
  faces: Record<FaceType, Layer[]>;
  material: MaterialType;
  boxType: BoxType;
  isOpen: boolean;
  thickness: number;
  bgColor: string;
  isExporting?: boolean; // 👈 新增：导出状态
  lightSettings: {
    x: number; y: number; z: number;
    targetX: number; targetY: number; targetZ: number;
    intensity: number;
    penumbra: number;
  };
}

function usePaperTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 20000; i++) {
      const x = Math.random() * 512; const y = Math.random() * 512;
      const b = Math.random() > 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${b}, ${b}, ${b}, 0.08)`;
      ctx.fillRect(x, y, 2, 2);
    }
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4);
    return t;
  }, []);
}

const getPaperProps = (type: MaterialType) => {
  switch (type) {
    case 'kraft': return { color: '#c19a6b', roughness: 0.95, metalness: 0.0, clearcoat: 0.0, clearcoatRoughness: 0.0 }; 
    case 'black-card': return { color: '#222222', roughness: 0.6, metalness: 0.1, clearcoat: 0.1, clearcoatRoughness: 0.2 }; 
    case 'silver-card': return { color: '#e0e0e0', roughness: 0.25, metalness: 0.9, clearcoat: 0.0, clearcoatRoughness: 0.0 };
    case 'coated-paper': return { color: '#ffffff', roughness: 0.3, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.1 };
    case 'grey-board': return { color: '#777777', roughness: 1.0, metalness: 0.0, clearcoat: 0.0, clearcoatRoughness: 0.0 };
    default: return { color: '#f8f8f8', roughness: 0.8, metalness: 0.0, clearcoat: 0.0, clearcoatRoughness: 0.0 }; 
  }
};

function EdgeMatWithLayer({ attach, layers, material }: { attach: string; layers: Layer[]; material: MaterialType }) {
  const props = getPaperProps(material);
  const firstLayer = layers[0];

  if (firstLayer) {
    const textureData = useTexture(firstLayer.url);
    const texture = (Array.isArray(textureData) ? textureData[0] : textureData) as unknown as THREE.Texture;
    texture.colorSpace = THREE.SRGBColorSpace;

    const isSilver = material === 'silver-card';
    
    return (
      <meshPhysicalMaterial 
        attach={attach} 
        map={texture}
        metalness={isSilver ? 0.7 : props.metalness}
        roughness={isSilver ? 0.3 : props.roughness}
        clearcoat={props.clearcoat}
        clearcoatRoughness={props.clearcoatRoughness}
        side={THREE.DoubleSide} 
      />
    );
  }

  return (
    <meshPhysicalMaterial 
      attach={attach} 
      color={props.color} 
      roughness={props.roughness} metalness={props.metalness} 
      clearcoat={props.clearcoat} clearcoatRoughness={props.clearcoatRoughness}
      side={THREE.DoubleSide} 
    />
  );
}

const InnerMat = ({ attach }: { attach: string }) => <meshStandardMaterial attach={attach} color="#a0a0a0" roughness={0.9} side={THREE.DoubleSide} />;

function useProcessedTexture(layer: Layer) {
  const textureData = useTexture(layer.url);
  const originalTexture = (Array.isArray(textureData) ? textureData[0] : textureData) as unknown as THREE.Texture;
  const [foilTexture, setFoilTexture] = useState<THREE.CanvasTexture | null>(null);

  const isFoil = layer.crafts.includes('foil');

  useMemo(() => {
    if (!isFoil || !originalTexture.image) return;
    const img = originalTexture.image as HTMLImageElement;
    
    const canvas = document.createElement('canvas');
    canvas.width = img.width || 1024;
    canvas.height = img.height || 1024;
    const ctx = canvas.getContext('2d')!;
    
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = layer.foilColor || '#FFD700'; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    setFoilTexture(tex);
  }, [originalTexture, isFoil, layer.foilColor]);

  return {
    displayTexture: isFoil ? foilTexture || originalTexture : originalTexture,
    isFoil,
    hasUV: layer.crafts.includes('uv'),
    hasEmboss: layer.crafts.includes('emboss')
  };
}

function getPhysicalProps(isFoil: boolean, hasUV: boolean, baseMaterial: MaterialType) {
  const isSilver = baseMaterial === 'silver-card';
  const isCoated = baseMaterial === 'coated-paper';

  let metalness = 0.0;
  let roughness = 0.8;
  let clearcoat = 0.0;
  let envMapIntensity = 1.0;

  if (isSilver) {
    metalness = 0.6;
    roughness = 0.3;
  } else if (isCoated) {
    clearcoat = 0.6;
    roughness = 0.4;
  }

  if (isFoil) {
    if (hasUV) {
      metalness = 0.8; roughness = 0.2; clearcoat = 1.0; envMapIntensity = 1.5;
    } else {
      metalness = 0.8; roughness = 0.45; clearcoat = 0.0; envMapIntensity = 1.0;
    }
  } else if (hasUV) {
    metalness = 0.0; roughness = 0.2; clearcoat = 1.0; envMapIntensity = 1.0;
  }

  return { metalness, roughness, clearcoat, envMapIntensity };
}

function NormalLayerMaterial({ layer, baseMaterial }: { layer: Layer; baseMaterial: MaterialType }) {
  const { displayTexture, isFoil, hasUV, hasEmboss } = useProcessedTexture(layer);
  if (!displayTexture) return null;
  displayTexture.anisotropy = 16;
  
  const props = getPhysicalProps(isFoil, hasUV, baseMaterial);

  return (
    <meshPhysicalMaterial 
      map={displayTexture} 
      transparent={true} 
      alphaTest={0.05}
      side={THREE.DoubleSide}
      metalness={props.metalness}
      roughness={props.roughness}
      clearcoat={props.clearcoat}
      clearcoatRoughness={0.1}
      envMapIntensity={props.envMapIntensity}
      emissive={isFoil ? layer.foilColor : '#000000'}
      emissiveIntensity={isFoil ? 0.1 : 0.0}
      bumpMap={hasEmboss ? displayTexture : null}
      bumpScale={hasEmboss ? 0.02 : 0.0}
    />
  );
}

function EmbossedLayerMaterial({ layer, width, height, baseMaterial }: { layer: Layer, width: number, height: number, baseMaterial: MaterialType }) {
  const { displayTexture, isFoil, hasUV } = useProcessedTexture(layer);
  const [displacementMap, setDisplacementMap] = useState<THREE.CanvasTexture | null>(null);

  useMemo(() => {
    if (!layer.url) return;
    const img = new Image();
    img.src = layer.url;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 2048; canvas.height = 2048;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.filter = 'blur(1.5px)';
      ctx.drawImage(img, 0, 0, 2048, 2048);
      
      const imgData = ctx.getImageData(0, 0, 2048, 2048);
      for (let i = 0; i < imgData.data.length; i += 4) {
        const alpha = imgData.data[i + 3]; 
        imgData.data[i] = alpha;
        imgData.data[i + 1] = alpha;
        imgData.data[i + 2] = alpha;
        imgData.data[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      
      const tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter; 
      tex.magFilter = THREE.LinearFilter;
      tex.generateMipmaps = false; 
      setDisplacementMap(tex);
    };
  }, [layer.url]);

  if (!displayTexture) return null;
  const props = getPhysicalProps(isFoil, hasUV, baseMaterial);

  return (
    <mesh receiveShadow>
      <planeGeometry args={[width, height, 1024, 1024]} />
      <meshPhysicalMaterial 
        map={displayTexture} 
        transparent={true} 
        alphaTest={0.05} 
        side={THREE.DoubleSide}
        displacementMap={displacementMap}
        displacementScale={layer.embossDepth}
        displacementBias={-layer.embossDepth / 2}
        metalness={props.metalness}
        roughness={props.roughness}
        clearcoat={props.clearcoat}
        clearcoatRoughness={0.1}
        envMapIntensity={props.envMapIntensity}
        emissive={isFoil ? layer.foilColor : '#000000'}
        emissiveIntensity={isFoil ? 0.1 : 0.0}
      />
    </mesh>
  );
}

function LayerGroup({ layers, width, height, baseMaterial }: { layers: Layer[], width: number, height: number, baseMaterial: MaterialType }) {
  return (
    <>
      {layers.map((layer, i) => {
        const zOffset = 0.005 * (i + 1);
        const hasEmboss = layer.crafts.includes('emboss');

        if (hasEmboss) {
          return (
            <group key={layer.id} position={[0, 0, zOffset]}>
              <Suspense fallback={null}>
                <EmbossedLayerMaterial layer={layer} width={width} height={height} baseMaterial={baseMaterial} />
              </Suspense>
            </group>
          );
        }

        return (
          <mesh key={layer.id} position={[0, 0, zOffset]}>
            <planeGeometry args={[width, height]} />
            <Suspense fallback={<meshBasicMaterial color="transparent" />}>
              <NormalLayerMaterial layer={layer} baseMaterial={baseMaterial} />
            </Suspense>
          </mesh>
        );
      })}
    </>
  );
}

// 👇 接收 isExporting，控制辅助元素的可见性
function LightController({ settings, isExporting }: { settings: PreviewProps['lightSettings']; isExporting?: boolean }) {
  const targetObject = useMemo(() => new THREE.Object3D(), []);
  const lightRef = useRef<THREE.SpotLight>(null!);

  useFrame(() => {
    targetObject.position.set(settings.targetX, settings.targetY, settings.targetZ);
    targetObject.updateMatrixWorld();
    if (lightRef.current) {
      lightRef.current.target = targetObject;
      lightRef.current.target.updateMatrixWorld();
    }
  });

  return (
    <>
      {/* 👇 可视化辅助元素，导出时隐藏 👇 */}
      <group visible={!isExporting}>
        <mesh position={[settings.x, settings.y, settings.z]}>
          <sphereGeometry args={[0.4, 16, 16]} />
          <meshBasicMaterial color="#ffdd00" />
        </mesh>
        
        <mesh position={[settings.targetX, settings.targetY, settings.targetZ]}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshBasicMaterial color="#ff0000" />
        </mesh>

        <Line
          points={[[settings.x, settings.y, settings.z], [settings.targetX, settings.targetY, settings.targetZ]]}
          color="#ffff00"
          lineWidth={1}
          dashed={true}
          dashScale={2}
        />
      </group>

      {/* 真实光源一直保留 */}
      <spotLight
        ref={lightRef}
        position={[settings.x, settings.y, settings.z]} 
        intensity={settings.intensity * 10}
        angle={Math.PI / 4}
        penumbra={settings.penumbra}
        distance={0}
        decay={0} 
        castShadow 
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.05}
      />
      <primitive object={targetObject} />
    </>
  );
}

function BoxMesh({ dims, lidHeight, faces, material, boxType, isOpen, thickness }: Omit<PreviewProps, 'bgColor' | 'lightSettings' | 'isExporting'>) {
  const L = dims.L / 10;
  const W = dims.W / 10;
  const H = dims.H / 10;
  const t = thickness; 
  const paperBump = usePaperTexture();
  const props = getPaperProps(material);

  const lidRef = useRef<THREE.Group>(null);
  const rigidLidRef = useRef<THREE.Group>(null);

  const getBaseMat = (attach: string) => (
    <meshPhysicalMaterial 
      attach={attach} color={props.color} bumpMap={paperBump} bumpScale={0.02} 
      roughness={props.roughness} metalness={props.metalness} 
      clearcoat={props.clearcoat} clearcoatRoughness={props.clearcoatRoughness}
      side={THREE.DoubleSide} 
    />
  );

  const gap = 0.05;
  const lidH = lidHeight / 10;
  const bodyH = H - lidH - gap;
  const baseLidY = bodyH + gap + lidH / 2;

  useFrame((_, delta) => {
    const damp = THREE.MathUtils.damp;
    if (boxType === 'tuck-end') {
      if (lidRef.current) {
        const targetRotX = isOpen ? -Math.PI : 0; 
        lidRef.current.rotation.x = damp(lidRef.current.rotation.x, targetRotX, 6, delta);
      }
    } else if (boxType === 'rigid-lid') {
      if (rigidLidRef.current) {
        const targetY = isOpen ? baseLidY + 4 : baseLidY;
        const targetRotX = isOpen ? 0.1 : 0;
        const targetRotZ = isOpen ? 0.05 : 0;

        rigidLidRef.current.position.y = damp(rigidLidRef.current.position.y, targetY, 6, delta);
        rigidLidRef.current.rotation.x = damp(rigidLidRef.current.rotation.x, targetRotX, 6, delta);
        rigidLidRef.current.rotation.z = damp(rigidLidRef.current.rotation.z, targetRotZ, 6, delta);
      }
    }
  });

  if (boxType === 'tuck-end') {
    return (
      <group position={[0, 0, 0]}>
        <group position={[0, t / 2, 0]}>
          <mesh scale={[L, t, W]} castShadow receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            <EdgeMatWithLayer attach="material-0" layers={faces.bottom} material={material} />
            <EdgeMatWithLayer attach="material-1" layers={faces.bottom} material={material} />
            <InnerMat attach="material-2" />
            {getBaseMat("material-3")}
            <EdgeMatWithLayer attach="material-4" layers={faces.bottom} material={material} />
            <EdgeMatWithLayer attach="material-5" layers={faces.bottom} material={material} />
          </mesh>
          <group position={[0, -t / 2 - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <LayerGroup layers={faces.bottom} width={L} height={W} baseMaterial={material} />
          </group>
        </group>

        <group position={[0, H / 2, W / 2 - t / 2]}>
          <mesh scale={[L, H, t]} castShadow receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            <EdgeMatWithLayer attach="material-0" layers={faces.front} material={material} />
            <EdgeMatWithLayer attach="material-1" layers={faces.front} material={material} />
            <EdgeMatWithLayer attach="material-2" layers={faces.front} material={material} />
            <EdgeMatWithLayer attach="material-3" layers={faces.front} material={material} />
            {getBaseMat("material-4")}
            <InnerMat attach="material-5" />
          </mesh>
          <group position={[0, 0, t / 2 + 0.01]}>
            <LayerGroup layers={faces.front} width={L} height={H} baseMaterial={material} />
          </group>
        </group>

        <group position={[0, H / 2, -W / 2 + t / 2]}>
          <mesh scale={[L, H, t]} castShadow receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            <EdgeMatWithLayer attach="material-0" layers={faces.back} material={material} />
            <EdgeMatWithLayer attach="material-1" layers={faces.back} material={material} />
            <EdgeMatWithLayer attach="material-2" layers={faces.back} material={material} />
            <EdgeMatWithLayer attach="material-3" layers={faces.back} material={material} />
            <InnerMat attach="material-4" />
            {getBaseMat("material-5")}
          </mesh>
          <group position={[0, 0, -t / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
            <LayerGroup layers={faces.back} width={L} height={H} baseMaterial={material} />
          </group>
        </group>

        <group position={[-L / 2 + t / 2, H / 2, 0]}>
          <mesh scale={[t, H, W - 2 * t]} castShadow receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            <InnerMat attach="material-0" />
            {getBaseMat("material-1")}
            <EdgeMatWithLayer attach="material-2" layers={faces.left} material={material} />
            <EdgeMatWithLayer attach="material-3" layers={faces.left} material={material} />
            <EdgeMatWithLayer attach="material-4" layers={faces.left} material={material} />
            <EdgeMatWithLayer attach="material-5" layers={faces.left} material={material} />
          </mesh>
          <group position={[-t / 2 - 0.01, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <LayerGroup layers={faces.left} width={W - 2 * t} height={H} baseMaterial={material} />
          </group>
        </group>

        <group position={[L / 2 - t / 2, H / 2, 0]}>
          <mesh scale={[t, H, W - 2 * t]} castShadow receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            {getBaseMat("material-0")}
            <InnerMat attach="material-1" />
            <EdgeMatWithLayer attach="material-2" layers={faces.right} material={material} />
            <EdgeMatWithLayer attach="material-3" layers={faces.right} material={material} />
            <EdgeMatWithLayer attach="material-4" layers={faces.right} material={material} />
            <EdgeMatWithLayer attach="material-5" layers={faces.right} material={material} />
          </mesh>
          <group position={[t / 2 + 0.01, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <LayerGroup layers={faces.right} width={W - 2 * t} height={H} baseMaterial={material} />
          </group>
        </group>

        <group position={[0, H, -W / 2]}>
          <group ref={lidRef}>
            <group position={[0, t / 2, W / 2]}>
              <mesh scale={[L, t, W]} castShadow receiveShadow>
                <boxGeometry args={[1, 1, 1]} />
                <EdgeMatWithLayer attach="material-0" layers={faces.top} material={material} />
                <EdgeMatWithLayer attach="material-1" layers={faces.top} material={material} />
                {getBaseMat("material-2")}
                <InnerMat attach="material-3" />
                <EdgeMatWithLayer attach="material-4" layers={faces.top} material={material} />
                <EdgeMatWithLayer attach="material-5" layers={faces.top} material={material} />
              </mesh>
              <group position={[0, t / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                 <LayerGroup layers={faces.top} width={L} height={W} baseMaterial={material} />
              </group>
            </group>
          </group>
        </group>
      </group>
    );
  }

  if (boxType === 'rigid-lid') {
    return (
      <group position={[0, 0, 0]}>
        <group position={[0, bodyH / 2, 0]}>
          <group position={[0, -bodyH / 2 + t / 2, 0]}>
             <mesh scale={[L, t, W]} castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <EdgeMatWithLayer attach="material-0" layers={faces.bottom} material={material} />
              <EdgeMatWithLayer attach="material-1" layers={faces.bottom} material={material} />
              <InnerMat attach="material-2" />
              {getBaseMat("material-3")}
              <EdgeMatWithLayer attach="material-4" layers={faces.bottom} material={material} />
              <EdgeMatWithLayer attach="material-5" layers={faces.bottom} material={material} />
            </mesh>
            <group position={[0, -t / 2 - 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <LayerGroup layers={faces.bottom} width={L} height={W} baseMaterial={material} />
            </group>
          </group>

          <group position={[0, 0, W / 2 - t / 2]}>
            <mesh scale={[L, bodyH - t, t]} castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <EdgeMatWithLayer attach="material-0" layers={faces.front} material={material} />
              <EdgeMatWithLayer attach="material-1" layers={faces.front} material={material} />
              <EdgeMatWithLayer attach="material-2" layers={faces.front} material={material} />
              <EdgeMatWithLayer attach="material-3" layers={faces.front} material={material} />
              {getBaseMat("material-4")}
              <InnerMat attach="material-5" />
            </mesh>
            <group position={[0, 0, t / 2 + 0.01]}>
              <LayerGroup layers={faces.front} width={L} height={bodyH - t} baseMaterial={material} />
            </group>
          </group>

          <group position={[0, 0, -W / 2 + t / 2]}>
            <mesh scale={[L, bodyH - t, t]} castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <EdgeMatWithLayer attach="material-0" layers={faces.back} material={material} />
              <EdgeMatWithLayer attach="material-1" layers={faces.back} material={material} />
              <EdgeMatWithLayer attach="material-2" layers={faces.back} material={material} />
              <EdgeMatWithLayer attach="material-3" layers={faces.back} material={material} />
              <InnerMat attach="material-4" />
              {getBaseMat("material-5")}
            </mesh>
            <group position={[0, 0, -t / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
              <LayerGroup layers={faces.back} width={L} height={bodyH - t} baseMaterial={material} />
            </group>
          </group>

          <group position={[-L / 2 + t / 2, 0, 0]}>
            <mesh scale={[t, bodyH - t, W - 2 * t]} castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              <InnerMat attach="material-0" />
              {getBaseMat("material-1")}
              <EdgeMatWithLayer attach="material-2" layers={faces.left} material={material} />
              <EdgeMatWithLayer attach="material-3" layers={faces.left} material={material} />
              <EdgeMatWithLayer attach="material-4" layers={faces.left} material={material} />
              <EdgeMatWithLayer attach="material-5" layers={faces.left} material={material} />
            </mesh>
            <group position={[-t / 2 - 0.01, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
              <LayerGroup layers={faces.left} width={W - 2 * t} height={bodyH - t} baseMaterial={material} />
            </group>
          </group>

          <group position={[L / 2 - t / 2, 0, 0]}>
            <mesh scale={[t, bodyH - t, W - 2 * t]} castShadow receiveShadow>
              <boxGeometry args={[1, 1, 1]} />
              {getBaseMat("material-0")}
              <InnerMat attach="material-1" />
              <EdgeMatWithLayer attach="material-2" layers={faces.right} material={material} />
              <EdgeMatWithLayer attach="material-3" layers={faces.right} material={material} />
              <EdgeMatWithLayer attach="material-4" layers={faces.right} material={material} />
              <EdgeMatWithLayer attach="material-5" layers={faces.right} material={material} />
            </mesh>
            <group position={[t / 2 + 0.01, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <LayerGroup layers={faces.right} width={W - 2 * t} height={bodyH - t} baseMaterial={material} />
            </group>
          </group>
        </group>

        <group ref={rigidLidRef} position={[0, baseLidY, 0]}>
          <mesh scale={[L, lidH, W]} castShadow receiveShadow>
            <boxGeometry args={[1, 1, 1]} />
            <EdgeMatWithLayer attach="material-0" layers={faces.lidRight} material={material} />
            <EdgeMatWithLayer attach="material-1" layers={faces.lidLeft} material={material} />
            <EdgeMatWithLayer attach="material-2" layers={faces.top} material={material} />
            <InnerMat attach="material-3" />
            <EdgeMatWithLayer attach="material-4" layers={faces.lidFront} material={material} />
            <EdgeMatWithLayer attach="material-5" layers={faces.lidBack} material={material} />
          </mesh>
          
          <group position={[0, 0, W / 2 + 0.01]}>
            <LayerGroup layers={faces.lidFront} width={L} height={lidH} baseMaterial={material} />
          </group>
          <group position={[0, 0, -W / 2 - 0.01]} rotation={[0, Math.PI, 0]}>
            <LayerGroup layers={faces.lidBack} width={L} height={lidH} baseMaterial={material} />
          </group>
          <group position={[-L / 2 - 0.01, 0, 0]} rotation={[0, -Math.PI/2, 0]}>
            <LayerGroup layers={faces.lidLeft} width={W} height={lidH} baseMaterial={material} />
          </group>
          <group position={[L / 2 + 0.01, 0, 0]} rotation={[0, Math.PI/2, 0]}>
            <LayerGroup layers={faces.lidRight} width={W} height={lidH} baseMaterial={material} />
          </group>
          <group position={[0, lidH / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <LayerGroup layers={faces.top} width={L} height={W} baseMaterial={material} />
          </group>
        </group>
      </group>
    );
  }

  return null;
}

export default function Preview3D(props: PreviewProps) {
  return (
    <Canvas 
      style={{ width: '100%', height: '100%', background: props.bgColor }} 
      camera={{ position: [25, 25, 25], fov: 45 }} 
      shadows 
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      dpr={[1, 2]}
    >
      <ambientLight intensity={0.2} />
      
      <LightController settings={props.lightSettings} isExporting={props.isExporting} />
      
      <Environment resolution={256}>
        <Lightformer intensity={2} position={[0, 5, -9]} scale={[10, 10, 1]} />
        <Lightformer intensity={2} position={[5, 0, 0]} scale={[10, 10, 1]} />
      </Environment>
      
      <BoxMesh {...props} />
      
      <OrbitControls makeDefault target={[0, (props.dims.H / 10) / 2, 0]} />
      
      <ContactShadows position={[0, 0, 0]} opacity={0.8} scale={40} blur={2.5} far={10} resolution={512} color="#000000" />
    </Canvas>
  );
}