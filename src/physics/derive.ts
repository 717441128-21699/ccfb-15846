import { GRAIN_PER_KG, IN_TO_M, AIR_DENSITY } from './math';
import type { ArrowSpec, BowSpec, DerivedArrow } from './types';

/** 阻力面积标定增益（默认 0.34，使 70m 风偏与手册瞄点修正表一致） */
export let DRAG_GAIN = 0.34;
export function setDragGain(g: number): void { DRAG_GAIN = g; }

/**
 * 从 AMO 静挠度标号反推抗弯刚度 EI。
 * AMO 测试：26 英寸简支跨距（L=0.6604m），中点挂 1.944 lb，挠度 δ = spineLabel/1000 英寸。
 * 简支梁中点加载 δ = F L³ / (48 EI) => EI = F L³ / (48 δ)
 */
export function spineToEI(spineLabel: number): number {
  const F = 1.944 * 4.4482216;
  const L = 26 * IN_TO_M;
  const delta = (spineLabel / 1000) * IN_TO_M;
  return (F * L ** 3) / (48 * delta);
}

export function deriveArrow(spec: ArrowSpec): DerivedArrow {
  const lengthM = spec.lengthIn * IN_TO_M;
  const shaftGrains = spec.gpi * spec.lengthIn;
  const fletchGrains = spec.fletchLengthIn * 3 * 1.2; // 每英寸每片约 1.2 gr
  const totalGrains = shaftGrains + spec.pointGrains + spec.nockGrains + fletchGrains;
  const totalMassKg = totalGrains * GRAIN_PER_KG;
  const linearDensity = (shaftGrains * GRAIN_PER_KG) / lengthM;
  const EI = spineToEI(spec.spineLabel);

  // 质心（从箭尾起）：杆均布在 [0,L]，箭头在 x=L，箭尾在 x=0，羽毛均布在尾段 [0.05,0.25]L
  const mShaft = shaftGrains * GRAIN_PER_KG;
  const mPoint = spec.pointGrains * GRAIN_PER_KG;
  const mNock = spec.nockGrains * GRAIN_PER_KG;
  const mFletch = fletchGrains * GRAIN_PER_KG;
  const fletchCenter = 0.15 * lengthM;
  const cmFromNock =
    (mShaft * lengthM / 2 + mPoint * lengthM + mNock * 0.0 + mFletch * fletchCenter) / totalMassKg;
  const foc = (cmFromNock - lengthM / 2) / lengthM; // FOC 比例（十进制）

  // 转动惯量（绕质心横轴）：杆 1/12 mL² + 平行轴，箭头/箭尾点质量，羽毛均布
  const shaftI = (mShaft * lengthM ** 2) / 12 + mShaft * (cmFromNock - lengthM / 2) ** 2;
  const pointI = mPoint * (lengthM - cmFromNock) ** 2;
  const nockI = mNock * cmFromNock ** 2;
  const fletchSpan = 0.2 * lengthM;
  const fletchI =
    (mFletch * fletchSpan ** 2) / 12 + mFletch * (cmFromNock - fletchCenter) ** 2;
  const inertiaY = shaftI + pointI + nockI + fletchI;

  const shaftArea = spec.diameterM * lengthM; // 杆身侧向参考面积 d·L
  const oneVaneM2 = spec.fletchLengthIn * IN_TO_M * (spec.fletchHeightMm / 1000);
  const fletchArea = 3 * oneVaneM2;
  // 轴向阻力：流线型细碳箭 Cd 很低；DRAG_GAIN 为弹道系数标定项
  const dragArea = DRAG_GAIN * ((Math.PI * spec.diameterM ** 2) / 4 * 0.15 + fletchArea * 0.02);
  // 法向力等效 Cn·A：细长杆身 π/2 斜率（取 0.5 折减）+ 羽毛平板
  const shaftNormalArea = shaftArea * (Math.PI / 2) * 0.5;
  const fletchNormalArea = fletchArea * 1.6;
  const normalArea = shaftNormalArea + fletchNormalArea;

  // 法向气动力的压力中心：杆的压心在中点，羽毛压心在 15%L 处
  const cpFromNock =
    (shaftNormalArea * lengthM / 2 + fletchNormalArea * fletchCenter) / normalArea;
  const cpBehindCm = cmFromNock - cpFromNock;

  return {
    spec,
    lengthM,
    totalMassKg,
    EI,
    linearDensity,
    cmFromNock,
    inertiaY,
    dragArea,
    normalArea,
    fletchArea,
    cpBehindCm,
    foc,
  };
}

/**
 * 动态匹配指数：1.0 = 完全匹配，>1 = 箭偏软，<1 = 箭偏硬。
 * 参照 Easton 选箭表思路：等效挠度 = 静挠度 × 长度修正 × 箭头重量修正，
 * 再与该弓在实际拉距下的推荐挠度（由磅数推算）比较。
 */
export function dynamicSpineIndex(bow: BowSpec, arrow: ArrowSpec, drawIn: number): number {
  const weightAtDraw = drawWeightLb(bow, drawIn);
  // 经验选箭基线：推荐 AMO 标号 ≈ 1240 - 18.5×磅数（28in/100gr 基准）
  const recommendedSpine = 1240 - 18.5 * weightAtDraw;
  const lengthFactor = 1 + 0.06 * (arrow.lengthIn - 28);
  const pointFactor = 1 + 0.0016 * (arrow.pointGrains - 100);
  const effectiveSpine = arrow.spineLabel * lengthFactor * pointFactor;
  return effectiveSpine / recommendedSpine;
}

export function drawWeightLb(bow: BowSpec, drawIn: number): number {
  // 近似线性拉力曲线，按参考点标定
  return bow.drawWeightLb * Math.max(0.2, drawIn / bow.refDrawLengthIn);
}

export function drawEnergyJ(bow: BowSpec, drawIn: number): number {
  const brace = bow.braceHeightIn;
  const strokeM = Math.max(0, drawIn - brace) * IN_TO_M;
  const wRef = bow.drawWeightLb * 4.4482216;
  // 线性增力（0 -> 实际拉重）的三角/梯形储能
  const wDraw = wRef * Math.max(0.2, drawIn / bow.refDrawLengthIn);
  return 0.5 * wDraw * strokeM;
}

export function launchSpeed(bow: BowSpec, arrow: DerivedArrow, drawIn: number): number {
  const ke = drawEnergyJ(bow, drawIn) * bow.efficiency;
  return Math.sqrt((2 * ke) / arrow.totalMassKg);
}

export { AIR_DENSITY };
