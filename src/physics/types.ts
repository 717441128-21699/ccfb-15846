import { GRAIN_PER_KG, IN_TO_M, LB_TO_N } from './math';

export type BowKind = 'longbow' | 'hornbow' | 'recurve';

export interface BowSpec {
  id: string;
  name: string;
  kind: BowKind;
  /** 参考拉距下的拉力（英寸/磅） */
  drawWeightLb: number;
  refDrawLengthIn: number;
  minDrawIn: number;
  maxDrawIn: number;
  /** 弓把到弦的平衡高度（英寸），决定实际做功行程 */
  braceHeightIn: number;
  /** 储能转化为箭动能的效率 0..1 */
  efficiency: number;
  /** 箭侧垫（plunger）刚度 N/m，传统弓无侧垫时为硬接触（Infinity） */
  plungerStiffness: number;
  /** 撒放瞬间弦从手指滑出给箭尾的侧向冲量系数（占弦力比例） */
  fingerSlipFactor: number;
  /** 弓把中心线相对箭杆的侧向偏移（m），中心撒放弓把较小 */
  gripOffsetM: number;
}

export interface ArrowSpec {
  id: string;
  name: string;
  material: 'wood' | 'carbon' | 'aluminum';
  /** AMO 静挠度标号：28 英寸跨度挂 1.944 磅的挠度（千分之一英寸），数字越小越硬 */
  spineLabel: number;
  lengthIn: number;
  /** 杆体每英寸格令数（GPI） */
  gpi: number;
  pointGrains: number;
  /** 箭杆外径 m */
  diameterM: number;
  /** 单片羽毛长度（英寸）与高度（mm），共 3 片 */
  fletchLengthIn: number;
  fletchHeightMm: number;
  nockGrains: number;
}

export interface DerivedArrow {
  spec: ArrowSpec;
  lengthM: number;
  totalMassKg: number;
  /** 抗弯刚度 EI (N·m²)，由 AMO 静挠度反推 */
  EI: number;
  /** 线密度 kg/m */
  linearDensity: number;
  /** 质心到箭尾距离 m */
  cmFromNock: number;
  /** 绕质心横向转动惯量 kg·m² */
  inertiaY: number;
  /** 轴向阻力面积 Cd*A (m²) */
  dragArea: number;
  /** 法向气动面积（升力斜率用）m² */
  normalArea: number;
  /** 羽毛部分法向面积 m² */
  fletchArea: number;
  /** 气动压力中心到质心的距离 m（在质心之后） */
  cpBehindCm: number;
  /** 前端 FOC（front-of-center）比例 */
  foc: number;
}

export interface ShotParams {
  drawLengthIn: number;
  /** 瞄具方向（弧度），yaw 左右、pitch 高低，相对水平线 */
  aimYaw: number;
  aimPitch: number;
  /** 撒放扰动：撒放时机偏差（秒，正=撒放晚）与手抖角（弧度，1σ） */
  releaseTimingSigma: number;
  handTremorSigma: number;
  seed: number;
  wind: Vec3Wind;
  /** 距离 m */
  distance: number;
}

export interface Vec3Wind {
  /** 侧风 m/s，+ 表示从射手左侧吹向右侧（把箭往右带） */
  side: number;
  /** 逆风为正 m/s */
  head: number;
}

export interface ShotSample {
  t: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** 侧向弯曲模态坐标 m（箭尾处等效横向位移） */
  q: number;
  /** 垂直弯曲模态坐标 m */
  qv: number;
  speed: number;
}

export interface ImpactResult {
  /** 靶面上的落点（m），z 右为正，y 相对瞄准点高度 */
  z: number;
  y: number;
  flightTime: number;
  /** 插入靶面时的箭杆角（弧度） */
  yawAtImpact: number;
  pitchAtImpact: number;
  /** 离弦瞬间状态（慢放页用） */
  launch: LaunchExit;
  samples: ShotSample[];
  score: number;
}

export interface LaunchExit {
  speed: number;
  /** 质心整体侧向速度 m/s（z 向，弓箭手悖论的净冲量结果） */
  lateralV: number;
  verticalV: number;
  yaw: number;
  yawRate: number;
  pitch: number;
  pitchRate: number;
  q: number;
  qDot: number;
  qv: number;
  qvDot: number;
  strokeTime: number;
}
