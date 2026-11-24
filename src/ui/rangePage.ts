import { state, fireShot, getDerivedArrow, getZeroAim, clearZeroCache } from '../state';
import { equipmentPanel } from './controls';
import { createScene, axisFromAngles } from './scene';
import type { ArrowPose } from '../webgl/renderer';

export function rangePage(): HTMLElement {
  const page = document.createElement('div');
  page.className = 'page';
  page.innerHTML = `<div class="grid2"><div id="left"></div><div id="right"></div></div>`;
  const left = page.querySelector('#left')!;
  const right = page.querySelector('#right')!;

  left.appendChild(equipmentPanel(clearZeroCache));

  // 瞄准控制
  const aimCard = document.createElement('div');
  aimCard.className = 'card';
  aimCard.innerHTML = `<h2>瞄准与撒放</h2>`;
  const auto = document.createElement('label');
  auto.className = 'field row-flex';
  auto.innerHTML = `<input type="checkbox" ${state.autoZero ? 'checked' : ''}/>
    <span>自动归零（按当前弓/箭/距离补偿重力与侧偏）</span>`;
  auto.querySelector('input')!.addEventListener('change', (e) => {
    state.autoZero = (e.target as HTMLInputElement).checked;
  });
  aimCard.appendChild(auto);

  const aimYaw = makeAimSlider('瞄具左右修正', state.aimYaw, 0.02, (v) => state.aimYaw = v, 'mrad', 1000);
  const aimPitch = makeAimSlider('瞄具高低修正', state.aimPitch, 0.02, (v) => state.aimPitch = v, 'mrad', 1000);
  aimCard.appendChild(aimYaw.wrap);
  aimCard.appendChild(aimPitch.wrap);

  const fireBtn = document.createElement('button');
  fireBtn.className = 'btn';
  fireBtn.textContent = '🏹 撒放射箭';
  aimCard.appendChild(fireBtn);
  left.appendChild(aimCard);

  // 右侧 3D
  const sceneCard = document.createElement('div');
  sceneCard.className = 'card';
  sceneCard.innerHTML = `<h2>射箭场</h2>`;
  const canvas = document.createElement('canvas');
  canvas.className = 'gl';
  sceneCard.appendChild(canvas);
  const readout = document.createElement('div');
  readout.style.marginTop = '12px';
  sceneCard.appendChild(readout);
  right.appendChild(sceneCard);

  const arrow = getDerivedArrow();
  const scene = createScene(canvas, arrow);

  function renderIdle() {
    const zero = getZeroAim();
    const yaw = state.autoZero ? zero.yaw + state.aimYaw : state.aimYaw;
    const pitch = state.autoZero ? zero.pitch + state.aimPitch : state.aimPitch;
    const pose: ArrowPose = {
      pos: [0, 0, 0],
      axis: axisFromAngles(yaw, pitch),
      q: 0, qv: 0,
    };
    scene.drawScene({ arrow: getDerivedArrow(), pose, targetDistance: state.distance, showBow: true });
  }

  function renderReadout() {
    const s = state.lastShot;
    if (!s) {
      readout.innerHTML = `<div class="muted small">调整参数后点击「撒放射箭」。当前为待射姿态。</div>`;
      return;
    }
    const ringCls = s.score >= 8 ? 'good' : s.score >= 5 ? 'warn' : 'bad';
    readout.innerHTML = `
      <div class="readout">
        <div class="box"><div class="k">环数</div><div class="v"><span class="pill ${ringCls}">${s.score} 环</span></div></div>
        <div class="box"><div class="k">飞行时间</div><div class="v">${s.flightTime.toFixed(2)} s</div></div>
        <div class="box"><div class="k">左右偏差</div><div class="v">${(s.z * 100).toFixed(1)} cm</div></div>
        <div class="box"><div class="k">高低偏差</div><div class="v">${(s.y * 100).toFixed(1)} cm</div></div>
        <div class="box"><div class="k">风偏贡献</div><div class="v">${s.windDriftCm.toFixed(1)} cm</div></div>
        <div class="box"><div class="k">插靶角(偏航/俯仰)</div><div class="v">${(s.yawAtImpact * 180 / Math.PI).toFixed(1)}° / ${(s.pitchAtImpact * 180 / Math.PI).toFixed(1)}°</div></div>
      </div>
      <div class="small muted" style="margin-top:8px">动态挠度指数 ×${s.spineIndex.toFixed(2)}（硬&lt;0.92，软&gt;1.08）</div>`;
  }

  // 动画播放上一箭
  let raf = 0;
  function playFlight() {
    cancelAnimationFrame(raf);
    const s = state.lastShot;
    if (!s) { renderIdle(); return; }
    const samples = s.samples;
    const t0 = performance.now();
    const dur = Math.min(2600, s.flightTime * 900 + 500);
    const frame = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const idx = Math.min(samples.length - 1, Math.floor(k * samples.length));
      const sm = samples[idx];
      const pose: ArrowPose = {
        pos: [sm.x, sm.y, sm.z],
        axis: axisFromAngles(sm.yaw, sm.pitch),
        q: sm.q, qv: sm.qv,
      };
      scene.drawScene({
        arrow: getDerivedArrow(), pose, targetDistance: state.distance,
        trajectory: samples.slice(0, idx + 1),
      });
      if (k < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  fireBtn.addEventListener('click', () => {
    fireShot();
    renderReadout();
    playFlight();
  });

  renderIdle();
  renderReadout();
  return page;
}

function makeAimSlider(label: string, value: number, span: number, set: (v: number) => void,
  unit: string, scale: number) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.innerHTML = `<div class="row"><span class="name">${label}</span>
    <span class="val">${(value * scale).toFixed(1)} ${unit}</span></div>`;
  const input = document.createElement('input');
  input.type = 'range'; input.min = String(-span); input.max = String(span);
  input.step = String(span / 200); input.value = String(value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    set(v);
    wrap.querySelector('.val')!.textContent = `${(v * scale).toFixed(1)} ${unit}`;
  });
  wrap.appendChild(input);
  return { wrap };
}
