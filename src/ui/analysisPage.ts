import { state, buildReplay, getDerivedArrow } from '../state';
import { createScene, axisFromAngles } from './scene';
import { naturalOmega } from '../physics/beam';
import type { ArrowPose } from '../webgl/renderer';

export function analysisPage(): HTMLElement {
  const page = document.createElement('div');
  page.className = 'page';
  page.innerHTML = `<div class="grid2 flip"><div id="l"></div><div id="r"></div></div>`;
  const l = page.querySelector('#l')!;
  const r = page.querySelector('#r')!;

  const sceneCard = document.createElement('div');
  sceneCard.className = 'card';
  sceneCard.innerHTML = `<h2>飞行慢放（含箭杆弯曲）</h2>`;
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  sceneCard.appendChild(canvas);

  const phaseTag = document.createElement('div');
  phaseTag.className = 'small muted';
  phaseTag.style.margin = '8px 0';
  sceneCard.appendChild(phaseTag);

  const playbar = document.createElement('div');
  playbar.className = 'playbar';
  playbar.innerHTML = `<button class="btn secondary" id="play" style="width:auto;padding:8px 16px">▶ 播放</button>
    <input type="range" id="scrub" min="0" max="1000" value="0" />
    <span class="small" id="tlabel" style="min-width:90px;text-align:right">0 ms</span>`;
  sceneCard.appendChild(playbar);
  l.appendChild(sceneCard);

  // 右侧：模态曲线 + 数据
  const curveCard = document.createElement('div');
  curveCard.className = 'card';
  curveCard.innerHTML = `<h2>弯曲模态 q(t) 与偏航角</h2><canvas id="curve" width="560" height="260" style="width:100%"></canvas>`;
  r.appendChild(curveCard);

  const dataCard = document.createElement('div');
  dataCard.className = 'card';
  r.appendChild(dataCard);

  const replay = buildReplay();
  const arrow = getDerivedArrow();
  const scene = createScene(canvas, arrow);

  // 合并撒放（放大时间轴）与飞行两段
  const launch = replay.launch;
  const flightSamples = state.lastShot?.samples ?? [];
  const totalFlight = flightSamples.length ? flightSamples[flightSamples.length - 1].t : 1;

  const scrub = playbar.querySelector('#scrub') as HTMLInputElement;
  const tlabel = playbar.querySelector('#tlabel') as HTMLElement;
  const playBtn = playbar.querySelector('#play') as HTMLButtonElement;

  function renderAt(k: number) {
    // 前 18% 时间展示撒放（弓上 ~10ms 拉伸到慢放），其余展示飞行
    const pose: ArrowPose = { pos: [0, 0, 0], axis: [1, 0, 0], q: 0, qv: 0 };
    let label = '';
    if (k < 0.18) {
      const lk = k / 0.18;
      const sm = launch.samples[Math.min(launch.samples.length - 1, Math.floor(lk * launch.samples.length))];
      pose.q = sm.nockZ; // 用箭尾位移近似弯曲展示
      pose.pos = [sm.stroke * 0.3, 0, 0];
      label = `弓上阶段 t=${(sm.t * 1000).toFixed(2)} ms（行程 ${(sm.stroke * 100).toFixed(1)} cm，箭尾横移 ${(sm.nockZ * 1000).toFixed(2)} mm）`;
    } else if (flightSamples.length) {
      const fk = (k - 0.18) / 0.82;
      const idx = Math.min(flightSamples.length - 1, Math.floor(fk * flightSamples.length));
      const sm = flightSamples[idx];
      pose.pos = [sm.x, sm.y, sm.z];
      pose.axis = axisFromAngles(sm.yaw, sm.pitch);
      pose.q = sm.q; pose.qv = sm.qv;
      label = `自由飞行 t=${sm.t.toFixed(2)} s，速度 ${sm.speed.toFixed(1)} m/s，偏航 ${(sm.yaw * 180 / Math.PI).toFixed(2)}°`;
    } else {
      label = '尚无飞行数据，请到射箭场射一箭';
    }
    scene.drawScene({ arrow, pose, targetDistance: state.distance, showBow: k < 0.18,
      trajectory: flightSamples });
    phaseTag.textContent = label;
    tlabel.textContent = k < 0.18
      ? `${(launch.samples[Math.min(launch.samples.length - 1, Math.floor((k / 0.18) * launch.samples.length))].t * 1000).toFixed(1)} ms`
      : `${(fkToTime(k)).toFixed(2)} s`;
  }
  function fkToTime(k: number) {
    if (!flightSamples.length) return 0;
    const fk = (k - 0.18) / 0.82;
    return flightSamples[Math.min(flightSamples.length - 1, Math.floor(fk * flightSamples.length))].t;
  }

  scrub.addEventListener('input', () => renderAt(Number(scrub.value) / 1000));
  let raf = 0, playing = false;
  playBtn.addEventListener('click', () => {
    if (playing) { playing = false; cancelAnimationFrame(raf); playBtn.textContent = '▶ 播放'; return; }
    playing = true; playBtn.textContent = '⏸ 暂停';
    const t0 = performance.now();
    const dur = 6000;
    const tick = (now: number) => {
      if (!playing) return;
      const k = (now - t0) / dur;
      if (k >= 1) { playing = false; playBtn.textContent = '▶ 播放'; scrub.value = '1000'; renderAt(1); return; }
      scrub.value = String(Math.floor(k * 1000));
      renderAt(k);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  // 数据卡
  dataCard.innerHTML = `<h2>离弦瞬间状态</h2><div class="kv">
    <span class="k">初速</span><span>${launch.exit.speed.toFixed(1)} m/s</span>
    <span class="k">弓上作用时间</span><span>${(launch.exit.strokeTime * 1000).toFixed(2)} ms</span>
    <span class="k">离弦偏航角/速度</span><span>${(launch.exit.yaw * 180 / Math.PI).toFixed(2)}° / ${launch.exit.yawRate.toFixed(2)} rad/s</span>
    <span class="k">质心侧向速度</span><span>${(launch.exit.lateralV * 1000).toFixed(1)} mm/s</span>
    <span class="k">侧向弯曲 q / q̇</span><span>${(launch.exit.q * 1000).toFixed(2)} mm / ${launch.exit.qDot.toFixed(2)} m/s</span>
    <span class="k">一阶弯曲频率</span><span>${(naturalOmega(arrow.EI, arrow.linearDensity, arrow.lengthM) / (2 * Math.PI)).toFixed(0)} Hz</span>
  </div>`;

  renderAt(0);
  drawCurve(curveCard.querySelector('#curve') as HTMLCanvasElement);
  return page;
}

function drawCurve(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height, pad = 40;
  ctx.clearRect(0, 0, W, H);
  const s = state.lastShot;
  if (!s) {
    ctx.fillStyle = '#8da2bb'; ctx.font = '14px Segoe UI';
    ctx.fillText('请先到射箭场射一箭，这里将显示飞行中的弯曲与偏航曲线', pad, H / 2);
    return;
  }
  const samples = s.samples;
  const tMax = samples[samples.length - 1].t;
  const X = (t: number) => pad + (t / tMax) * (W - 2 * pad);
  const qMax = Math.max(...samples.map((d) => Math.abs(d.q)), 1e-4);
  const yawMax = Math.max(...samples.map((d) => Math.abs(d.yaw)), 1e-4);
  const Yq = (q: number) => H / 2 - (q / qMax) * (H / 2 - pad);
  const Yy = (y: number) => H / 2 - (y / yawMax) * (H / 2 - pad);

  ctx.strokeStyle = '#3a4d66';
  ctx.beginPath(); ctx.moveTo(pad, H / 2); ctx.lineTo(W - pad, H / 2); ctx.stroke();
  // q 曲线（橙）
  ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 2;
  ctx.beginPath();
  samples.forEach((d, i) => i ? ctx.lineTo(X(d.t), Yq(d.q)) : ctx.moveTo(X(d.t), Yq(d.q)));
  ctx.stroke();
  // yaw 曲线（蓝）
  ctx.strokeStyle = '#4fb0e0'; ctx.lineWidth = 2;
  ctx.beginPath();
  samples.forEach((d, i) => i ? ctx.lineTo(X(d.t), Yy(d.yaw)) : ctx.moveTo(X(d.t), Yy(d.yaw)));
  ctx.stroke();
  ctx.fillStyle = '#e8a33d'; ctx.font = '13px Segoe UI';
  ctx.fillText('— 弯曲模态 q', pad, 18);
  ctx.fillStyle = '#4fb0e0';
  ctx.fillText('— 偏航角 yaw', pad + 130, 18);
  ctx.fillStyle = '#8da2bb';
  ctx.fillText('t (s)', W - 50, H - 10);
}
