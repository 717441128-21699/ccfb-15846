import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOWS, ARROWS } from '../src/physics/catalog';
import { deriveArrow, dynamicSpineIndex } from '../src/physics/derive';
import { simulateLaunch } from '../src/physics/launch';
import { simulateFlight } from '../src/physics/flight';
import { zeroPitch, zeroYaw, manualWindTable, spineVerdict } from '../src/physics/shot';

const bow = BOWS.find((b) => b.id === 'recurve-40')!;
const DIST = 70;
const matchSpec = ARROWS.find((a) => a.id === 'carbon-500')!;
const pitch = zeroPitch(bow, matchSpec, 28, DIST);
const yaw = zeroYaw(bow, matchSpec, 28, DIST, pitch);

function shoot(id: string, wind = 0) {
  const spec = ARROWS.find((a) => a.id === id)!;
  const arrow = deriveArrow(spec);
  const tr = simulateLaunch(bow, arrow, 28);
  return simulateFlight({
    arrow, exit: tr.exit, aimYaw: yaw, aimPitch: pitch,
    windSide: wind, windHead: 0, distance: DIST, tremorYaw: 0, tremorPitch: 0,
  });
}

test('动态挠度匹配指数：随挠度标号单调，匹配箭≈1', () => {
  const idx400 = dynamicSpineIndex(bow, ARROWS.find((a) => a.id === 'carbon-400-s')!, 28);
  const idx500 = dynamicSpineIndex(bow, matchSpec, 28);
  const idx700 = dynamicSpineIndex(bow, ARROWS.find((a) => a.id === 'carbon-700')!, 28);
  assert.ok(idx400 < 0.92, '硬箭指数应<0.92');
  assert.ok(Math.abs(idx500 - 1) < 0.05, '匹配箭指数应≈1');
  assert.ok(idx700 > 1.08, '软箭指数应>1.08');
  assert.ok(idx400 < idx500 && idx500 < idx700);
});

test('教练表口径：硬箭左偏、软箭右偏，落点随挠度单调', () => {
  const z400 = shoot('carbon-400-s').z;
  const z500 = shoot('carbon-500').z;
  const z600 = shoot('carbon-600-w').z;
  const z700 = shoot('carbon-700').z;
  assert.equal(spineVerdict(dynamicSpineIndex(bow, ARROWS.find((a) => a.id === 'carbon-400-s')!, 28)).drift, 'left');
  assert.equal(spineVerdict(dynamicSpineIndex(bow, ARROWS.find((a) => a.id === 'carbon-700')!, 28)).drift, 'right');
  assert.ok(z400 < z500 && z500 < z600 && z600 < z700, '落点 z 应随挠度单调递增（左→右）');
  // 相邻挠度至少可分辨（>0.3cm）
  assert.ok(z700 - z400 > 0.03, '软硬两端落点差应>3cm');
});

test('轻箭头落点更高（初速更大）', () => {
  const yLight = shoot('carbon-500-light').y;
  const yStd = shoot('carbon-500').y;
  const yHeavy = shoot('carbon-500-heavy').y;
  assert.ok(yLight > yStd && yStd > yHeavy);
  assert.ok(yLight - yStd > 0.3, '轻箭头应明显上移>30cm');
});

test('羽毛越大，箭身摆正越早', () => {
  function settleTime(id: string) {
    const spec = ARROWS.find((a) => a.id === id)!;
    const arrow = deriveArrow(spec);
    const tr = simulateLaunch(bow, arrow, 28);
    const r = simulateFlight({
      arrow, exit: tr.exit, aimYaw: yaw, aimPitch: pitch,
      windSide: 0, windHead: 0, distance: DIST, tremorYaw: 0, tremorPitch: 0, sampleDt: 0.005,
    });
    const yaw0 = Math.abs(r.samples[0].yaw);
    const settled = r.samples.find((s) => Math.abs(s.yaw) < 0.1 * yaw0 && s.t > 0.02);
    return settled ? settled.t : Infinity;
  }
  const tSmall = settleTime('fletch-small');
  const tStd = settleTime('carbon-500');
  const tLarge = settleTime('fletch-large');
  assert.ok(tLarge < tStd && tStd < tSmall, `摆正时间应随羽毛面积递减: ${tLarge} < ${tStd} < ${tSmall}`);
});

test('70m 侧风 0-8m/s 着靶偏移与手册相差不超过一环(6.1cm)', () => {
  const table = manualWindTable(DIST);
  const base = shoot('carbon-500', 0).z * 100;
  let maxErr = 0;
  for (let w = 0; w <= 8; w += 2) {
    const drift = shoot('carbon-500', w).z * 100 - base;
    const manual = table.find((t) => t.windMs === w)!.driftCm;
    maxErr = Math.max(maxErr, Math.abs(drift - manual));
  }
  assert.ok(maxErr <= 6.1, `最大误差 ${maxErr.toFixed(2)}cm 应≤6.1cm(一环)`);
});

test('插靶角度有限且物理合理（俯仰向下、偏航小角）', () => {
  const r = shoot('carbon-500', 4);
  assert.ok(Number.isFinite(r.yawAtImpact) && Number.isFinite(r.pitchAtImpact));
  assert.ok(Math.abs(r.yawAtImpact) < 0.3, '偏航角应<17°');
  assert.ok(r.pitchAtImpact < 0, '下落中插靶俯仰应为负');
});

test('全部六张弓均可完成完整射箭且数值有限', () => {
  for (const b of BOWS) {
    const arrow = deriveArrow(matchSpec);
    const tr = simulateLaunch(b, arrow, b.refDrawLengthIn);
    const r = simulateFlight({
      arrow, exit: tr.exit, aimYaw: 0, aimPitch: 0.1,
      windSide: 3, windHead: 0, distance: DIST, tremorYaw: 0, tremorPitch: 0,
    });
    assert.ok(Number.isFinite(r.z) && Number.isFinite(r.y) && Number.isFinite(r.flightTime));
    assert.ok(r.samples.length > 50);
  }
});
