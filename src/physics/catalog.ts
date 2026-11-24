import type { ArrowSpec, BowSpec } from './types';

// 六张弓：三张传统弓、三张反曲弓。参数为游戏标定值，风格参照对应实物。
export const BOWS: BowSpec[] = [
  {
    id: 'longbow-40',
    name: '英式长弓 40#',
    kind: 'longbow',
    drawWeightLb: 40,
    refDrawLengthIn: 28,
    minDrawIn: 25,
    maxDrawIn: 31,
    braceHeightIn: 7,
    efficiency: 0.72,
    plungerStiffness: 300, // 传统弓无真侧垫，等效软接触
    fingerSlipFactor: 0.003,
    gripOffsetM: 0,
  },
  {
    id: 'hornbow-45',
    name: '满洲角弓 45#',
    kind: 'hornbow',
    drawWeightLb: 45,
    refDrawLengthIn: 30,
    minDrawIn: 26,
    maxDrawIn: 32,
    braceHeightIn: 7.5,
    efficiency: 0.8,
    plungerStiffness: 350,
    fingerSlipFactor: 0.003,
    gripOffsetM: 0,
  },
  {
    id: 'mongol-50',
    name: '蒙古骑弓 50#',
    kind: 'hornbow',
    drawWeightLb: 50,
    refDrawLengthIn: 29,
    minDrawIn: 25,
    maxDrawIn: 32,
    braceHeightIn: 7.5,
    efficiency: 0.78,
    plungerStiffness: 350,
    fingerSlipFactor: 0.003,
    gripOffsetM: 0,
  },
  {
    id: 'recurve-32',
    name: '竞技反曲弓 32#',
    kind: 'recurve',
    drawWeightLb: 32,
    refDrawLengthIn: 28,
    minDrawIn: 25,
    maxDrawIn: 31,
    braceHeightIn: 8.5,
    efficiency: 0.85,
    plungerStiffness: 6000,
    fingerSlipFactor: 0.002,
    gripOffsetM: 0,
  },
  {
    id: 'recurve-40',
    name: '竞技反曲弓 40#',
    kind: 'recurve',
    drawWeightLb: 40,
    refDrawLengthIn: 28,
    minDrawIn: 25,
    maxDrawIn: 31,
    braceHeightIn: 8.5,
    efficiency: 0.85,
    plungerStiffness: 8000,
    fingerSlipFactor: 0.002,
    gripOffsetM: 0,
  },
  {
    id: 'recurve-48',
    name: '竞技反曲弓 48#',
    kind: 'recurve',
    drawWeightLb: 48,
    refDrawLengthIn: 28,
    minDrawIn: 26,
    maxDrawIn: 31,
    braceHeightIn: 8.5,
    efficiency: 0.84,
    plungerStiffness: 10000,
    fingerSlipFactor: 0.002,
    gripOffsetM: 0,
  },
];

// 箭以反曲/传统常见的碳箭、木箭为原型，同系列提供不同挠度、长度、箭头、羽毛组合
export const ARROWS: ArrowSpec[] = [
  arrow('carbon-400-s', '碳箭 400 偏硬', 'carbon', 400, 28, 7.3, 100, 7, 13, 35),
  arrow('carbon-500',   '碳箭 500 标准', 'carbon', 500, 28, 7.3, 100, 7, 13, 35),
  arrow('carbon-600-w', '碳箭 600 偏软', 'carbon', 600, 28, 7.3, 100, 7, 13, 35),
  arrow('carbon-700',   '碳箭 700 很软', 'carbon', 700, 28, 7.3, 100, 7, 13, 35),
  arrow('carbon-500-l', '碳箭 500 加长', 'carbon', 500, 30, 7.3, 100, 7, 13, 35),
  arrow('carbon-500-light', '碳箭 500 轻箭头', 'carbon', 500, 28, 7.3, 70, 7, 13, 35),
  arrow('carbon-500-heavy', '碳箭 500 重箭头', 'carbon', 500, 28, 7.3, 140, 7, 13, 35),
  arrow('fletch-small', '碳箭 500 小羽毛', 'carbon', 500, 28, 7.3, 100, 3, 7, 35),
  arrow('fletch-large', '碳箭 500 大羽毛', 'carbon', 500, 28, 7.3, 100, 10, 18, 35),
  arrow('wood-55',      '木箭 5/16" 传统', 'wood', 500, 30, 11, 125, 5, 16, 45),
];

function arrow(
  id: string,
  name: string,
  material: ArrowSpec['material'],
  spineLabel: number,
  lengthIn: number,
  gpi: number,
  pointGrains: number,
  fletchLengthIn: number,
  fletchHeightMm: number,
  nockGrains: number,
): ArrowSpec {
  const diameterM = material === 'wood' ? 0.0079 : 0.0066;
  return {
    id, name, material, spineLabel, lengthIn, gpi, pointGrains,
    diameterM, fletchLengthIn, fletchHeightMm, nockGrains,
  };
}


