// src/lib/dieline.ts

export interface Panel {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function generateBoxDieline(length: number, width: number, height: number): Panel[] {
  // 这里我们暂时不计算复杂的纸厚，先用基础尺寸跑通逻辑
  const panels: Panel[] = [];
  let currentX = 0;

  // 1. 粘合边 (固定宽度 15mm)
  panels.push({
    id: 'glue',
    label: '粘合边',
    x: currentX,
    y: 0,
    width: 15,
    height: height,
  });
  currentX += 15;

  // 2. 侧面 (宽 x 高)
  panels.push({
    id: 'side-left',
    label: '左侧面',
    x: currentX,
    y: 0,
    width: width,
    height: height,
  });
  currentX += width;

  // 3. 正面 (长 x 高)
  panels.push({
    id: 'front',
    label: '正面',
    x: currentX,
    y: 0,
    width: length,
    height: height,
  });
  currentX += length;

  // 4. 侧面 (宽 x 高)
  panels.push({
    id: 'side-right',
    label: '右侧面',
    x: currentX,
    y: 0,
    width: width,
    height: height,
  });
  currentX += width;

  // 5. 背面 (长 x 高)
  panels.push({
    id: 'back',
    label: '背面',
    x: currentX,
    y: 0,
    width: length,
    height: height,
  });

  return panels;
}