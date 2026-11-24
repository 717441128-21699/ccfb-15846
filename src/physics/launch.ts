import { LB_TO_N, IN_TO_M } from './math';
import { drawWeightLb, drawEnergyJ, launchSpeed } from './derive';
import { modeShape, modalMass, modalStiffness, naturalOmega } from './beam';
import type { BowSpec, DerivedArrow, LaunchExit } from './types';

// 通道：s = 侧向(z) / 垂直(y)，两个方向共用同一套模态参数，激励不同
interface Channel {
  q: number;      // 弯曲模态坐标（箭尾处等效横向位移，m）
  qDot: number;
  M: number;
  K: number;
  rigV: number;   // 质心整体横向速度 m/s
  rigX: number;   // 质心整体横向位移 m
  yaw: number;    // 该通道对应的刚性转角（z通道->偏航，y通道->俯仰）
  yawRate: number;
}

function makeChannel(a: DerivedArrow): Channel {
  return {
    q: 0, qDot: 0,
    M: modalMass(a.linearDensity, a.lengthM),
    K: modalStiffness(a.EI, a.lengthM),
    rigV: 0, rigX: 0, yaw: 0, yawRate: 0,
  };
}

export interface LaunchTrace {
  exit: LaunchExit;
  samples: { t: number; nockZ: number; tipZ: number; stroke: number }[];
}

/**
 * 弓上阶段仿真（弓箭手悖论），右手弓、z 轴朝射手右侧。
 *
 * 每个横向通道包含 3 个自由度：
 *   1. 质心整体横向平动（决定离弦后整箭的侧向漂移）
 *   2. 刚性偏航/俯仰转动
 *   3. 一阶弯曲模态（箭杆弹性）
 *
 * 顶视激励：
 *   - 撒放瞬间弦从三指滑出，给箭尾一个短促的右向力（fingerSlip）
 *   - 箭杆弯向弓把，接触点被侧垫/弓把推回（plunger，弹性接触+阻尼）
 *   - 弦仍扣在箭尾时，弦张力把箭尾拉回射箭线（弦的横向恢复力）
 * 软箭弯曲吸能多、弓把冲量小 -> 质心右向速度大 -> 右偏；
 * 硬箭弯曲小、弓把反向冲量大 -> 质心左向速度大 -> 左偏。
 */
export function simulateLaunch(bow: BowSpec, a: DerivedArrow, drawIn: number): LaunchTrace {
  const L = a.lengthM;
  const m = a.totalMassKg;
  const I = a.inertiaY;
  const dt = 5e-6;
  const phiNock = modeShape(0); // = 1
  const phiTip = modeShape(1);
  const omega = naturalOmega(a.EI, a.linearDensity, L);

  const z = makeChannel(a);
  const y = makeChannel(a);

  const braceM = bow.braceHeightIn * IN_TO_M;
  const strokeMax = Math.max(0.02, drawIn - bow.braceHeightIn) * IN_TO_M;
  const wDrawN = drawWeightLb(bow, drawIn) * LB_TO_N;

  let vx = 0;
  let stroke = 0;
  const samples: LaunchTrace['samples'] = [];
  let t = 0;
  let exited = false;

  const restXFromNock0 = strokeMax + braceM;

  const stepChannel = (
    c: Channel,
    Ffinger: number,
    Frest: number,
    stringF: number,
    phiContact: number,
    leverContact: number,
    dt: number,
  ) => {
    const leverNock = -a.cmFromNock;
    // 弦的横向恢复力：弦把箭尾拉回中心线
    const nockLateral = c.rigX + c.yaw * leverNock + c.q * phiNock;
    const FstringSide = -stringF * 0.4 * nockLateral / Math.max(braceM * 0.6, stroke + braceM);

    const Fsum = Ffinger + Frest + FstringSide;
    // 1. 质心横向平动
    c.rigV += (Fsum / m) * dt;
    c.rigX += c.rigV * dt;
    // 2. 刚性转动
    const torque = Ffinger * leverNock + Frest * leverContact + FstringSide * leverNock;
    c.yawRate += (torque / I) * dt;
    c.yaw += c.yawRate * dt;
    // 3. 弯曲模态
    const Q =
      (Ffinger + FstringSide) * phiNock +
      Frest * phiContact -
      c.K * c.q -
      2 * 0.03 * omega * c.M * c.qDot;
    c.qDot += (Q / c.M) * dt;
    c.q += c.qDot * dt;
  };

  for (let step = 0; step < 200000 && !exited; step++) {
    t += dt;
    const progress = Math.min(1, stroke / strokeMax);
    const stringF = wDrawN * Math.max(0.08, 1 - progress * 0.92);
    const fingerEnv = progress < 0.7 ? 0.5 * (1 + Math.cos(Math.PI * progress / 0.7)) : 0;
    const FfingerZ = wDrawN * bow.fingerSlipFactor * fingerEnv;

    // 轴向
    vx += (stringF / m) * dt;
    stroke = vx * t;

    // 弓把接触点在箭杆上的位置（随行程向箭尾移动）
    const xContact = Math.max(0.05, restXFromNock0 - stroke);
    const xiContact = Math.min(0.95, Math.max(0.02, 1 - xContact / L));
    const phiContact = modeShape(xiContact);
    const leverContact = xContact - a.cmFromNock;

    const contactZ = z.rigX + z.yaw * leverContact + z.q * phiContact;
    const contactY = y.rigX + y.yaw * leverContact + y.q * phiContact;
    let FrestZ = 0;
    let FrestY = 0;
    // 箭台/侧垫零间隙贴合：箭杆一向弓把侧弯即被弹性推回。
    // 软侧垫（传统弓用等效软接触）是弓箭手悖论中软硬箭分化的关键。
    const kp = Number.isFinite(bow.plungerStiffness) ? bow.plungerStiffness : 150;
    if (contactZ > 0) {
      const contactVel = z.rigV + z.yawRate * leverContact + z.qDot * phiContact;
      FrestZ = -kp * contactZ - 0.05 * Math.sqrt(kp * m) * contactVel;
    }
    if (contactY < 0) {
      FrestY = kp * (-contactY);
    }

    stepChannel(z, FfingerZ, FrestZ, stringF, phiContact, leverContact, dt);
    stepChannel(y, 0, FrestY, stringF, phiContact, leverContact, dt);

    if (step % 200 === 0) {
      samples.push({
        t,
        nockZ: z.rigX + z.yaw * (-a.cmFromNock) + z.q * phiNock,
        tipZ: z.rigX + z.yaw * (L - a.cmFromNock) + z.q * phiTip,
        stroke,
      });
    }

    if (stroke >= strokeMax) {
      exited = true;
      // 轴向速度按弓效率标定（修正积分误差），横向/转动量保持物理积分结果
      const targetSpeed = launchSpeed(bow, a, drawIn);
      vx = targetSpeed;
      samples.push({
        t,
        nockZ: z.rigX + z.yaw * (-a.cmFromNock) + z.q * phiNock,
        tipZ: z.rigX + z.yaw * (L - a.cmFromNock) + z.q * phiTip,
        stroke,
      });
      return {
        exit: {
          speed: targetSpeed,
          lateralV: z.rigV,
          verticalV: y.rigV,
          yaw: z.yaw,
          yawRate: z.yawRate,
          pitch: y.yaw,
          pitchRate: y.yawRate,
          q: z.q,
          qDot: z.qDot,
          qv: y.q,
          qvDot: y.qDot,
          strokeTime: t,
        },
        samples,
      };
    }
  }

  const speed = Math.sqrt((2 * drawEnergyJ(bow, drawIn) * bow.efficiency) / m);
  return {
    exit: {
      speed,
      lateralV: z.rigV,
      verticalV: y.rigV,
      yaw: z.yaw, yawRate: z.yawRate, pitch: y.yaw, pitchRate: y.yawRate,
      q: z.q, qDot: z.qDot, qv: y.q, qvDot: y.qDot,
      strokeTime: t,
    },
    samples,
  };
}
