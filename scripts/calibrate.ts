import { BOWS, ARROWS } from '../src/physics/catalog';
import { deriveArrow, dynamicSpineIndex } from '../src/physics/derive';
import { simulateLaunch } from '../src/physics/launch';
import { simulateFlight } from '../src/physics/flight';
import { zeroPitch, zeroYaw, manualWindTable, spineVerdict } from '../src/physics/shot';

const bow = BOWS.find((b) => b.id === 'recurve-40')!;
const dist = 70;
const draw = 28;
const find = (id: string) => ARROWS.find((a) => a.id === id)!;

// 用匹配箭做双轴归零
const pitch = zeroPitch(bow, find('carbon-500'), draw, dist);
const yaw = zeroYaw(bow, find('carbon-500'), draw, dist, pitch);

function shoot(id: string, wind = 0) {
  const spec = find(id);
  const a = deriveArrow(spec);
  const tr = simulateLaunch(bow, a, draw);
  return simulateFlight({
    arrow: a, exit: tr.exit, aimYaw: yaw, aimPitch: pitch,
    windSide: wind, windHead: 0, distance: dist, tremorYaw: 0, tremorPitch: 0,
  });
}

console.log('=== 指标1：软硬箭左右偏（教练表 硬左/软右）===');
for (const id of ['carbon-400-s', 'carbon-500', 'carbon-600-w', 'carbon-700']) {
  const r = shoot(id);
  const v = spineVerdict(dynamicSpineIndex(bow, find(id), draw));
  console.log(id.padEnd(14), 'z(cm)=', (r.z * 100).toFixed(2).padStart(7), v.label, '偏:', v.drift);
}

console.log('\n=== 箭头重量：轻箭头上移 ===');
for (const id of ['carbon-500-light', 'carbon-500', 'carbon-500-heavy']) {
  console.log(id.padEnd(20), 'y(cm)=', (shoot(id).y * 100).toFixed(2));
}

console.log('\n=== 羽毛大小：摆正时间（偏航衰减到初始 10%）===');
for (const id of ['fletch-small', 'carbon-500', 'fletch-large']) {
  const a = deriveArrow(find(id));
  const tr = simulateLaunch(bow, a, draw);
  const r = simulateFlight({
    arrow: a, exit: tr.exit, aimYaw: yaw, aimPitch: pitch,
    windSide: 0, windHead: 0, distance: dist, tremorYaw: 0, tremorPitch: 0, sampleDt: 0.005,
  });
  const yaw0 = Math.abs(r.samples[0].yaw);
  const settled = r.samples.find((s) => Math.abs(s.yaw) < 0.1 * yaw0 && s.t > 0.02);
  console.log(id.padEnd(16), 'fletch(cm²)=', (a.fletchArea * 1e4).toFixed(0),
    '摆正(ms)=', settled ? (settled.t * 1000).toFixed(0) : '>全程');
}

console.log('\n=== 指标2：70m 风偏 vs 手册（环宽 6.1cm）===');
const table = manualWindTable(dist);
const base = shoot('carbon-500', 0).z * 100;
let maxErr = 0;
for (const w of [0, 2, 4, 6, 8]) {
  const drift = shoot('carbon-500', w).z * 100 - base;
  const manual = table.find((t) => t.windMs === w)!.driftCm;
  const err = Math.abs(drift - manual);
  maxErr = Math.max(maxErr, err);
  console.log('wind=', w, '模拟=', drift.toFixed(1).padStart(6), 'cm 手册=', manual.toFixed(0).padStart(3),
    '误差=', err.toFixed(2), 'cm =', (err / 6.1).toFixed(2), '环');
}
console.log('最大误差', maxErr.toFixed(2), 'cm =', (maxErr / 6.1).toFixed(2), '环',
  maxErr <= 6.1 ? '✓ 达标(≤1环)' : '✗');

console.log('\n=== 插靶角度 ===');
const r = shoot('carbon-500', 4);
console.log('yaw°=', (r.yawAtImpact * 180 / Math.PI).toFixed(2),
  'pitch°=', (r.pitchAtImpact * 180 / Math.PI).toFixed(2), 'score=', r.score);
