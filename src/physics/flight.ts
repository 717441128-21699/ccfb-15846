import { AIR_DENSITY, GRAVITY, v3, type Vec3 } from './math';
import { modeShape, modalMass, modalStiffness, naturalOmega } from './beam';
import type { DerivedArrow, LaunchExit, ShotSample, ImpactResult } from './types';

// 四元数 [w,x,y,z]
type Quat = [number, number, number, number];

/** 质心法向力（风标/风偏）耦合增益，弱值使 70m 风偏贴近手册瞄点修正表 */
export let WEATHERVANE_GAIN = 0.002;
/** 转动恢复力矩增益，强值使撒放后箭身快速归正、软硬箭分化清晰 */
export let RESTORE_GAIN = 1.0;
export function setWeathervaneGain(g: number): void { WEATHERVANE_GAIN = g; }
export function setRestoreGain(g: number): void { RESTORE_GAIN = g; }

function quatFromEuler(yaw: number, pitch: number): Quat {
  const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2);
  const cp = Math.cos(pitch / 2), sp = Math.sin(pitch / 2);
  return [cy * cp, 0, sy * cp, cy * sp];
}

function rotate(q: Quat, v: Vec3): Vec3 {
  // 标准 v' = v + 2 w×(u×v + w v)，u 为四元数向量部，w 为标量部
  const [w, x, y, z] = q;
  const u: Vec3 = [x, y, z];
  const uxv = v3.cross(u, v);
  const uv = v3.dot(u, v);
  const t = v3.add(uxv, v3.scale(v, w));
  return v3.add(v, v3.scale(v3.cross(v3.scale(u, 2), t), 1));
}

function integrateQuat(q: Quat, omega: Vec3, dt: number): Quat {
  // q' = q + 0.5 [0,ω]⊗q，归一化
  const [w, x, y, z] = q;
  const [ox, oy, oz] = omega;
  const dw = 0.5 * (-x * ox - y * oy - z * oz);
  const dx = 0.5 * (w * ox + y * oz - z * oy);
  const dy = 0.5 * (w * oy + z * ox - x * oz);
  const dz = 0.5 * (w * oz + x * oy - y * ox);
  const n: Quat = [w + dw * dt, x + dx * dt, y + dy * dt, z + dz * dt];
  const nl = Math.hypot(n[0], n[1], n[2], n[3]) || 1;
  return [n[0] / nl, n[1] / nl, n[2] / nl, n[3] / nl];
}

function eulerFromQuat(q: Quat): { yaw: number; pitch: number } {
  const [w, x, y, z] = q;
  const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * z - y * x))));
  return { yaw, pitch };
}

export interface FlightInput {
  arrow: DerivedArrow;
  exit: LaunchExit;
  aimYaw: number;
  aimPitch: number;
  windSide: number;
  windHead: number;
  distance: number;
  tremorYaw: number;
  tremorPitch: number;
  sampleDt?: number;
}

/**
 * 自由飞行：刚体质心平动 + 偏航/俯仰转动 + 两个弯曲模态。
 * 体轴 x 指向箭头；绕 y 为偏航（z 向侧移），绕 z 为俯仰（y 向升降）。
 * 气动力：轴向阻力、小攻角法向力（风标稳定）、转动气动阻尼、
 * 弯曲模态的材料+气动阻尼（大羽毛 -> 摆正早）。
 */
export function simulateFlight(input: FlightInput): ImpactResult {
  const a = input.arrow;
  const L = a.lengthM;
  const m = a.totalMassKg;
  const I = a.inertiaY;
  const rho = AIR_DENSITY;

  const M = modalMass(a.linearDensity, L);
  const K = modalStiffness(a.EI, L);
  const omegaN = naturalOmega(a.EI, a.linearDensity, L);

  // 弯曲模态阻尼比：材料 3% + 羽毛气动阻尼（面积越大越强）
  const zetaBend = Math.min(0.55, 0.03 + 6.0 * a.fletchArea);

  const yaw0 = input.aimYaw + input.tremorYaw + input.exit.yaw;
  const pitch0 = input.aimPitch + input.tremorPitch + input.exit.pitch;
  let quat = quatFromEuler(yaw0, pitch0);
  let omega: Vec3 = [0, input.exit.yawRate, input.exit.pitchRate];
  const pos: Vec3 = [0, 0, 0];
  const cYaw = Math.cos(yaw0), sYaw = Math.sin(yaw0);
  const cPitch = Math.cos(pitch0), sPitch = Math.sin(pitch0);
  let vel: Vec3 = [
    input.exit.speed * cPitch * cYaw,
    input.exit.speed * sPitch + input.exit.verticalV,
    input.exit.speed * cPitch * sYaw + input.exit.lateralV,
  ];

  let q = input.exit.q;
  let qDot = input.exit.qDot;
  let qv = input.exit.qv;
  let qvDot = input.exit.qvDot;

  const dt = 5e-5;
  const sampleDt = input.sampleDt ?? 0.004;
  let sampleAcc = 0;
  const samples: ShotSample[] = [];
  const wind: Vec3 = [-input.windHead, 0, input.windSide];

  const pushSample = (t: number) => {
    const e = eulerFromQuat(quat);
    samples.push({
      t, x: pos[0], y: pos[1], z: pos[2],
      yaw: e.yaw, pitch: e.pitch, q, qv,
      speed: v3.len(vel),
    });
  };
  pushSample(0);

  // 法向力等效面积（几何法）。两个增益解耦：
  //  RESTORE_GAIN 驱动转动恢复力矩（强，撒放后快速归正姿态、放大软硬差异）
  //  WEATHERVANE_GAIN 驱动质心法向力（弱，使 70m 风偏贴近手册瞄点修正表）
  const geomCnA = (Math.PI / 2) * a.spec.diameterM * L * 0.5 + a.fletchArea * 1.6;
  const cnA = WEATHERVANE_GAIN * geomCnA;          // 质心平动用
  const cnARot = RESTORE_GAIN * geomCnA;           // 转动恢复用
  const cdA = a.dragArea;
  const cpArm = a.cpBehindCm;
  // 风标二阶系统：I·θ¨ + c·v·θ˙ + qBar·cnARot·arm·θ = 0
  // 阻尼比 1.2：近过阻尼，抑制撒放偏航过冲，箭身平滑归正
  const omegaNRot = Math.sqrt((0.5 * rho * 56 * 56 * cnARot * cpArm) / I);
  const rotDampCoeff = (1.2 * 2 * I * omegaNRot) / 56;

  let t = 0;
  const maxT = 8;

  while (t < maxT) {
    const axis = rotate(quat, [1, 0, 0]);
    const sideAxis = rotate(quat, [0, 0, 1]);
    const upAxis = rotate(quat, [0, 1, 0]);
    const rel = v3.sub(vel, wind);
    const speedRel = v3.len(rel);
    const uRel: Vec3 = speedRel > 1e-6 ? v3.scale(rel, 1 / speedRel) : [1, 0, 0];

    // 小攻角（右手系约定）：β 来流在体轴左侧为正、α 来流在体轴上侧为正
    const beta = Math.atan2(-v3.dot(rel, sideAxis), Math.max(1e-6, v3.dot(rel, axis)));
    const alpha = Math.atan2(v3.dot(rel, upAxis), Math.max(1e-6, v3.dot(rel, axis)));
    const axialCos = Math.abs(v3.dot(uRel, axis));

    const qBar = 0.5 * rho * speedRel * speedRel;
    // 轴向阻力：沿相对来流反方向
    const fDrag = v3.scale(uRel, -qBar * cdA);
    // 法向风标力：把箭身推向来流方向（与攻角同向），作用于压心
    const fN = qBar * cnA;
    const fAero = v3.add(
      fDrag,
      v3.add(v3.scale(sideAxis, fN * beta), v3.scale(upAxis, -fN * alpha)),
    );
    const force = v3.add(fAero, [0, -GRAVITY * m, 0]);

    // 压心在质心之后，转动恢复力矩（用强增益 cnARot），外加转动气动阻尼
    const torque: Vec3 = [
      0,
      qBar * cnARot * beta * cpArm - rotDampCoeff * speedRel * omega[1],
      qBar * cnARot * alpha * cpArm - rotDampCoeff * speedRel * omega[2],
    ];

    vel = v3.add(vel, v3.scale(force, dt / m));
    pos[0] += vel[0] * dt;
    pos[1] += vel[1] * dt;
    pos[2] += vel[2] * dt;
    omega = v3.add(omega, [0, (torque[1] / I) * dt, (torque[2] / I) * dt]);
    quat = integrateQuat(quat, omega, dt);

    // 弯曲模态（来流攻角弱激励，弹性+气动阻尼主导衰减）
    const qAcc =
      (-K * q - 2 * zetaBend * omegaN * M * qDot + fN * beta * 0.12 * modeShape(0)) / M;
    const qvAcc =
      (-K * qv - 2 * zetaBend * omegaN * M * qvDot + fN * alpha * 0.12 * modeShape(0)) / M;
    qDot += qAcc * dt;
    q += qDot * dt;
    qvDot += qvAcc * dt;
    qv += qvDot * dt;

    t += dt;
    sampleAcc += dt;
    if (sampleAcc >= sampleDt) {
      sampleAcc = 0;
      pushSample(t);
    }

    if (pos[0] >= input.distance) {
      const over = (pos[0] - input.distance) / Math.max(1e-9, vel[0] * dt);
      pos[1] -= vel[1] * dt * over;
      pos[2] -= vel[2] * dt * over;
      pushSample(t);
      break;
    }
    if (pos[1] < -0.5) break;
  }

  const e = eulerFromQuat(quat);
  return {
    z: pos[2],
    y: pos[1],
    flightTime: t,
    yawAtImpact: e.yaw,
    pitchAtImpact: e.pitch,
    launch: input.exit,
    samples,
    score: scoreImpact(pos[1], pos[2], input.distance),
  };
}

/** WA 环靶计分：落点距靶心 r(cm)，70m 靶环宽 6.1cm */
export function scoreImpact(y: number, z: number, distance: number): number {
  const rCm = Math.hypot(y, z) * 100;
  const ringWidth = distance >= 60 ? 6.1 : distance >= 45 ? 5 : 4;
  const score = Math.max(0, 10 - Math.floor(rCm / ringWidth + 1e-9));
  return Math.min(10, score);
}
