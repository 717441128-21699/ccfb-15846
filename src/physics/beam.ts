/**
 * 自由-自由欧拉-伯努利梁的一阶对称弯曲模态。
 * 模态形函数 φ(x)，归一化为箭尾 φ(0)=1（箭头端 φ(L)≈-1.028）。
 * βL = 4.7300407 是自由-自由梁第一阶特征根。
 */
const BETA_L = 4.730040744862704;
const COSH = Math.cosh(BETA_L);
const COS = Math.cos(BETA_L);
const SIGMA = (Math.cosh(BETA_L) + Math.cos(BETA_L)) / (Math.sinh(BETA_L) + Math.sin(BETA_L));

export function modeShape(xi: number): number {
  const bxi = BETA_L * xi;
  const raw = Math.cosh(bxi) + Math.cos(bxi) - SIGMA * (Math.sinh(bxi) + Math.sin(bxi));
  // 归一化：φ(0) = 1 + 1 - 0 = 2
  return raw / 2;
}

export function modeSlope(xi: number): number {
  const bxi = BETA_L * xi;
  const raw =
    Math.sinh(bxi) - Math.sin(bxi) - SIGMA * (Math.cosh(bxi) + Math.cos(bxi));
  return (raw * BETA_L) / 2;
}

/** 模态质量 M = μ ∫φ² dx，μ 为线密度 */
export function modalMass(linearDensity: number, lengthM: number): number {
  const N = 64;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const xi = (i + 0.5) / N;
    const p = modeShape(xi);
    sum += p * p;
  }
  return linearDensity * lengthM * (sum / N);
}

/** 模态刚度 K = EI ∫(φ'')² dx（自由-自由梁可用 β⁴ 形式） */
export function modalStiffness(EI: number, lengthM: number): number {
  const N = 64;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const xi = (i + 0.5) / N;
    const bxi = BETA_L * xi;
    // φ''（含归一化系数 1/2）
    const d2 =
      (Math.cosh(bxi) + Math.cos(bxi) - SIGMA * (Math.sinh(bxi) - Math.sin(bxi))) *
      (BETA_L * BETA_L) / 2;
    const pp = d2 / lengthM ** 2;
    sum += pp * pp;
  }
  return EI * lengthM * (sum / N);
}

/** 一阶弯曲固有角频率 */
export function naturalOmega(EI: number, linearDensity: number, lengthM: number): number {
  const M = modalMass(linearDensity, lengthM);
  const K = modalStiffness(EI, lengthM);
  return Math.sqrt(K / M);
}
