import { gaussian, makeRng } from './math';
import { deriveArrow, dynamicSpineIndex } from './derive';
import { simulateLaunch } from './launch';
import { simulateFlight } from './flight';
import type {
  ArrowSpec, BowSpec, ImpactResult, ShotParams,
} from './types';

export interface FullShotResult extends ImpactResult {
  spineIndex: number;
  windDriftCm: number;
  /** 无扰动理想落点（用于成绩归因） */
  idealZ: number;
  idealY: number;
}

/**
 * 计算该弓/箭/距离下的归零俯仰角（无风、无撒放误差，命中靶心高度）。
 * 二分搜索 aimPitch。
 */
export function zeroPitch(
  bow: BowSpec,
  arrowSpec: ArrowSpec,
  drawIn: number,
  distance: number,
): number {
  const arrow = deriveArrow(arrowSpec);
  const exit = simulateLaunch(bow, arrow, drawIn).exit;
  const run = (pitch: number) =>
    simulateFlight({
      arrow, exit, aimYaw: 0, aimPitch: pitch,
      windSide: 0, windHead: 0, distance,
      tremorYaw: 0, tremorPitch: 0,
    });
  let lo = -0.05, hi = 0.2;
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    const r = run(mid);
    // 仰角越大落点越高；低于靶心则抬高下界
    if (r.y < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 侧向归零角（瞄具左右修正，抵消弓箭手悖论的共同侧偏）。
 * 小角近似：aimYaw ≈ -z / distance。
 */
export function zeroYaw(
  bow: BowSpec,
  arrowSpec: ArrowSpec,
  drawIn: number,
  distance: number,
  pitch: number,
): number {
  const arrow = deriveArrow(arrowSpec);
  const exit = simulateLaunch(bow, arrow, drawIn).exit;
  const r = simulateFlight({
    arrow, exit, aimYaw: 0, aimPitch: pitch,
    windSide: 0, windHead: 0, distance,
    tremorYaw: 0, tremorPitch: 0,
  });
  return -r.z / distance;
}

export function takeShot(
  bow: BowSpec,
  arrowSpec: ArrowSpec,
  params: ShotParams,
): FullShotResult {
  const arrow = deriveArrow(arrowSpec);
  const rng = makeRng(params.seed);

  // 撒放时机偏差 -> 实际拉距抖动；手抖 -> 瞄准角抖动
  const timingJitter = gaussian(rng) * params.releaseTimingSigma;
  const drawIn = params.drawLengthIn + timingJitter * 12; // 10ms ≈ 0.12in 拉距
  const launch = simulateLaunch(bow, arrow, drawIn);
  const tremorYaw = gaussian(rng) * params.handTremorSigma;
  const tremorPitch = gaussian(rng) * params.handTremorSigma * 0.7;

  const impact = simulateFlight({
    arrow,
    exit: launch.exit,
    aimYaw: params.aimYaw,
    aimPitch: params.aimPitch,
    windSide: params.wind.side,
    windHead: params.wind.head,
    distance: params.distance,
    tremorYaw,
    tremorPitch,
  });

  // 理想（无手抖、无风）对照
  const ideal = simulateFlight({
    arrow,
    exit: launch.exit,
    aimYaw: params.aimYaw,
    aimPitch: params.aimPitch,
    windSide: 0,
    windHead: 0,
    distance: params.distance,
    tremorYaw: 0,
    tremorPitch: 0,
  });

  const spineIndex = dynamicSpineIndex(bow, arrowSpec, drawIn);
  return {
    ...impact,
    spineIndex,
    windDriftCm: (impact.z - ideal.z) * 100,
    idealZ: ideal.z,
    idealY: ideal.y,
  };
}

/**
 * 手册风偏修正表（教练手册口径，环数/米每秒侧风）。
 * 反曲 70m：每 1 m/s 侧风修正约 6 cm（约一环），距离越近修正越小。
 */
export function manualWindTable(distance: number): { windMs: number; driftCm: number }[] {
  const slope = 0.0857 * distance; // cm/(m/s)，70m -> 6.0
  const rows: { windMs: number; driftCm: number }[] = [];
  for (let w = 0; w <= 8; w++) {
    rows.push({ windMs: w, driftCm: slope * w });
  }
  return rows;
}

/** 教练用箭杆匹配表（右手弓口径）：指数 >1 偏软 -> 右偏；<1 偏硬 -> 左偏 */
export function spineVerdict(index: number): {
  label: string;
  drift: 'right' | 'left' | 'center';
  advice: string;
} {
  if (index > 1.08) {
    return {
      label: `偏软 ×${index.toFixed(2)}`,
      drift: 'right',
      advice: '换更硬的箭（更小挠度标号），或缩短箭长、减轻箭头。',
    };
  }
  if (index < 0.92) {
    return {
      label: `偏硬 ×${index.toFixed(2)}`,
      drift: 'left',
      advice: '换更软的箭（更大挠度标号），或加长箭长、加重箭头。',
    };
  }
  return {
    label: `匹配 ×${index.toFixed(2)}`,
    drift: 'center',
    advice: '动态挠度匹配良好。',
  };
}
