import { BOWS, ARROWS } from '../physics/catalog';
import { deriveArrow, dynamicSpineIndex, drawWeightLb } from '../physics/derive';
import { naturalOmega } from '../physics/beam';
import { getSpineIndex, state, emit, clearZeroCache } from '../state';
import { spineVerdict, manualWindTable } from '../physics/shot';

export function matchingPage(): HTMLElement {
  const page = document.createElement('div');
  page.className = 'page';
  page.innerHTML = `<div class="grid2"><div id="l"></div><div id="r"></div></div>`;
  const l = page.querySelector('#l')!;
  const r = page.querySelector('#r')!;

  const selCard = document.createElement('div');
  selCard.className = 'card';
  selCard.innerHTML = `<h2>选择器材</h2>`;
  selCard.appendChild(buildSelect('弓', state.bowId, BOWS.map((b) => [b.id, b.name]),
    (v) => { state.bowId = v; }));
  selCard.appendChild(buildSelect('箭', state.arrowId, ARROWS.map((a) => [a.id, a.name]),
    (v) => { state.arrowId = v; }));
  const bow0 = BOWS.find((b) => b.id === state.bowId)!;
  selCard.appendChild(drawSlider('拉距', state.drawLengthIn, bow0.minDrawIn, bow0.maxDrawIn, 0.25,
    ' in', (v) => { state.drawLengthIn = v; }));
  l.appendChild(selCard);

  const detail = document.createElement('div');
  detail.className = 'card';
  l.appendChild(detail);

  const chartCard = document.createElement('div');
  chartCard.className = 'card';
  chartCard.innerHTML = `<h2>选箭表对照（当前弓在该拉距下）</h2><canvas id="spinechart" width="640" height="300" style="width:100%"></canvas>
    <p class="small muted">横轴 AMO 静挠度标号（小=硬，大=软），纵轴动态匹配指数。绿带 0.92–1.08 为匹配区；红点为当前箭。右手弓口径：偏软右偏、偏硬左偏。</p>`;
  r.appendChild(chartCard);

  const windCard = document.createElement('div');
  windCard.className = 'card';
  windCard.innerHTML = `<h2>手册风偏修正表（${state.distance} m，环宽 6.1cm）</h2>`;
  r.appendChild(windCard);

  function render() {
    const bow = BOWS.find((b) => b.id === state.bowId)!;
    const spec = ARROWS.find((a) => a.id === state.arrowId)!;
    const d = deriveArrow(spec);
    const idx = getSpineIndex();
    const v = spineVerdict(idx);
    const cls = v.drift === 'center' ? 'center' : v.drift === 'right' ? 'bad' : 'warn';
    const wLb = drawWeightLb(bow, state.drawLengthIn);

    detail.innerHTML = `<h2>器材派生参数</h2>
      <div class="kv">
        <span class="k">匹配判定</span><span><span class="pill ${cls}">${v.label}</span> <span class="small">${v.advice}</span></span>
        <span class="k">实际拉重</span><span>${wLb.toFixed(1)} lb</span>
        <span class="k">箭总长 / 质量</span><span>${spec.lengthIn} in / ${(d.totalMassKg * 1000).toFixed(1)} g</span>
        <span class="k">抗弯刚度 EI</span><span>${d.EI.toFixed(2)} N·m²（AMO ${spec.spineLabel}）</span>
        <span class="k">一阶弯曲频率</span><span>${(naturalOmega(d.EI, d.linearDensity, d.lengthM) / (2 * Math.PI)).toFixed(0)} Hz</span>
        <span class="k">FOC（前端重心）</span><span>${(d.foc * 100).toFixed(1)} %</span>
        <span class="k">转动惯量</span><span>${d.inertiaY.toExponential(2)} kg·m²</span>
        <span class="k">羽毛总面积</span><span>${(d.fletchArea * 1e4).toFixed(0)} cm²</span>
        <span class="k">侧垫刚度</span><span>${Number.isFinite(bow.plungerStiffness) ? bow.plungerStiffness + ' N/m' : '硬接触'}</span>
      </div>`;

    drawSpineChart(chartCard.querySelector('#spinechart') as HTMLCanvasElement, bow, spec);

    const rows = manualWindTable(state.distance).map((t) =>
      `<tr><td>${t.windMs} m/s</td><td class="num">${t.driftCm.toFixed(0)} cm</td>
       <td class="num">${(t.driftCm / 6.1).toFixed(1)} 环</td></tr>`).join('');
    windCard.innerHTML = `<h2>手册风偏修正表（${state.distance} m，环宽 6.1cm）</h2>
      <table><thead><tr><th>侧风</th><th class="num">修正量</th><th class="num">折合环数</th></tr></thead>
      <tbody>${rows}</tbody></table>`;
  }

  render();
  // 选择变化后重渲染
  page.addEventListener('change', () => { clearZeroCache(); render(); });
  page.addEventListener('input', () => { clearZeroCache(); render(); });
  return page;
}

function buildSelect(label: string, value: string, options: [string, string][], on: (v: string) => void) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.innerHTML = `<div class="row"><span class="name">${label}</span></div>`;
  const sel = document.createElement('select');
  for (const [v, t] of options) {
    const o = document.createElement('option');
    o.value = v; o.textContent = t; if (v === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => on(sel.value));
  wrap.appendChild(sel);
  return wrap;
}

function drawSlider(label: string, value: number, min: number, max: number, step: number, unit: string,
  on: (v: number) => void) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.innerHTML = `<div class="row"><span class="name">${label}</span><span class="val">${value}${unit}</span></div>`;
  const input = document.createElement('input');
  input.type = 'range'; input.min = String(min); input.max = String(max);
  input.step = String(step); input.value = String(value);
  input.addEventListener('input', () => {
    on(Number(input.value));
    wrap.querySelector('.val')!.textContent = `${input.value}${unit}`;
  });
  wrap.appendChild(input);
  return wrap;
}

function drawSpineChart(canvas: HTMLCanvasElement, bow: (typeof BOWS)[number], current: (typeof ARROWS)[number]) {
  const ctx = canvas.getContext('2d')!;
  const W = canvas.width, H = canvas.height, pad = 46;
  ctx.clearRect(0, 0, W, H);
  const spines = [300, 400, 500, 600, 700, 800];
  const vals = spines.map((sp) => {
    const spec = { ...ARROWS.find((a) => a.spineLabel === 500)!, spineLabel: sp, id: `tmp-${sp}` };
    return dynamicSpineIndex(bow, spec, state.drawLengthIn);
  });
  const xMin = spines[0], xMax = spines[spines.length - 1];
  const yMin = 0.5, yMax = 1.6;
  const X = (s: number) => pad + ((s - xMin) / (xMax - xMin)) * (W - 2 * pad);
  const Y = (v: number) => H - pad - ((v - yMin) / (yMax - yMin)) * (H - 2 * pad);

  // 匹配带
  ctx.fillStyle = 'rgba(87,201,138,0.15)';
  ctx.fillRect(pad, Y(1.08), W - 2 * pad, Y(0.92) - Y(1.08));
  // 轴
  ctx.strokeStyle = '#3a4d66'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(pad, pad); ctx.lineTo(pad, H - pad); ctx.lineTo(W - pad, H - pad); ctx.stroke();
  // 参考线 1.0
  ctx.strokeStyle = '#4fb0e0'; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.moveTo(pad, Y(1)); ctx.lineTo(W - pad, Y(1)); ctx.stroke(); ctx.setLineDash([]);
  // 曲线
  ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  spines.forEach((s, i) => { i ? ctx.lineTo(X(s), Y(vals[i])) : ctx.moveTo(X(s), Y(vals[i])); });
  ctx.stroke();
  // 当前点
  const curIdx = dynamicSpineIndex(bow, current, state.drawLengthIn);
  ctx.fillStyle = '#e06a6a';
  ctx.beginPath(); ctx.arc(X(current.spineLabel), Y(curIdx), 7, 0, Math.PI * 2); ctx.fill();
  // 标签
  ctx.fillStyle = '#8da2bb'; ctx.font = '13px Segoe UI';
  ctx.textAlign = 'center';
  spines.forEach((s) => ctx.fillText(String(s), X(s), H - pad + 18));
  ctx.fillText('AMO 静挠度（小=硬 → 大=软）', W / 2, H - 8);
  ctx.save(); ctx.translate(14, H / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('动态匹配指数', 0, 0); ctx.restore();
  ctx.textAlign = 'left'; ctx.fillStyle = '#57c98a'; ctx.fillText('匹配区 0.92–1.08', pad + 8, Y(1.08) - 6);
}
