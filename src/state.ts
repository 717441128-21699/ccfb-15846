import { BOWS, ARROWS } from './physics/catalog';
import { deriveArrow, dynamicSpineIndex } from './physics/derive';
import { simulateLaunch } from './physics/launch';
import { takeShot, zeroPitch, zeroYaw, type FullShotResult } from './physics/shot';
import type { ArrowSpec, BowSpec, ShotParams } from './physics/types';

export interface ScoreRecord {
  id: number;
  bowId: string;
  arrowId: string;
  distance: number;
  wind: number;
  score: number;
  z: number;
  y: number;
  yawAtImpact: number;
  pitchAtImpact: number;
  spineIndex: number;
  time: string;
}

export interface AppState {
  bowId: string;
  arrowId: string;
  distance: number;
  drawLengthIn: number;
  windSide: number;
  windHead: number;
  releaseTimingSigma: number;
  handTremorSigma: number;
  aimYaw: number;
  aimPitch: number;
  autoZero: boolean;
  lastShot: FullShotResult | null;
  history: ScoreRecord[];
  seed: number;
}

const STORAGE_KEY = 'archery-sim-state-v1';

function load(): Partial<AppState> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

const saved = load();
export const state: AppState = {
  bowId: saved.bowId ?? 'recurve-40',
  arrowId: saved.arrowId ?? 'carbon-500',
  distance: saved.distance ?? 70,
  drawLengthIn: saved.drawLengthIn ?? 28,
  windSide: saved.windSide ?? 0,
  windHead: saved.windHead ?? 0,
  releaseTimingSigma: saved.releaseTimingSigma ?? 0.008,
  handTremorSigma: saved.handTremorSigma ?? 0.0012,
  aimYaw: saved.aimYaw ?? 0,
  aimPitch: saved.aimPitch ?? 0,
  autoZero: saved.autoZero ?? true,
  lastShot: null,
  history: saved.history ?? [],
  seed: saved.seed ?? 1,
};

const listeners = new Set<() => void>();
export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emit(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lastShot: null }));
  listeners.forEach((fn) => fn());
}

export function getBow(): BowSpec {
  return BOWS.find((b) => b.id === state.bowId)!;
}
export function getArrowSpec(): ArrowSpec {
  return ARROWS.find((a) => a.id === state.arrowId)!;
}
export function getDerivedArrow() {
  return deriveArrow(getArrowSpec());
}
export function getSpineIndex(): number {
  return dynamicSpineIndex(getBow(), getArrowSpec(), state.drawLengthIn);
}

// 归零角缓存：zeroPitch 需多次积分，按 弓/箭/拉距/距离 缓存
const zeroCache = new Map<string, { pitch: number; yaw: number }>();
export function getZeroAim(): { pitch: number; yaw: number } {
  const key = `${state.bowId}|${state.arrowId}|${state.drawLengthIn}|${state.distance}`;
  let z = zeroCache.get(key);
  if (!z) {
    const bow = getBow();
    const spec = getArrowSpec();
    const pitch = zeroPitch(bow, spec, state.drawLengthIn, state.distance);
    const yaw = zeroYaw(bow, spec, state.drawLengthIn, state.distance, pitch);
    z = { pitch, yaw };
    zeroCache.set(key, z);
  }
  return z;
}

export function clearZeroCache(): void {
  zeroCache.clear();
}

let recordId = Date.now() % 100000;

export function fireShot(): FullShotResult {
  const zero = getZeroAim();
  const params: ShotParams = {
    drawLengthIn: state.drawLengthIn,
    aimYaw: state.autoZero ? zero.yaw + state.aimYaw : state.aimYaw,
    aimPitch: state.autoZero ? zero.pitch + state.aimPitch : state.aimPitch,
    releaseTimingSigma: state.releaseTimingSigma,
    handTremorSigma: state.handTremorSigma,
    seed: state.seed * 7919 + state.history.length * 31 + 7,
    wind: { side: state.windSide, head: state.windHead },
    distance: state.distance,
  };
  const result = takeShot(getBow(), getArrowSpec(), params);
  state.lastShot = result;
  state.seed += 1;
  const rec: ScoreRecord = {
    id: recordId++,
    bowId: state.bowId,
    arrowId: state.arrowId,
    distance: state.distance,
    wind: state.windSide,
    score: result.score,
    z: result.z,
    y: result.y,
    yawAtImpact: result.yawAtImpact,
    pitchAtImpact: result.pitchAtImpact,
    spineIndex: result.spineIndex,
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
  };
  state.history.unshift(rec);
  if (state.history.length > 60) state.history.pop();
  emit();
  return result;
}

/** 慢放页用：返回撒放阶段细节 + 飞行样本 */
export function buildReplay() {
  const bow = getBow();
  const arrow = getDerivedArrow();
  const launch = simulateLaunch(bow, arrow, state.drawLengthIn);
  return { launch, arrow, bow };
}
