import { state } from '../state';
import { ARROWS, BOWS } from '../physics/catalog';

const RING_WIDTH_CM = 6.1; // 70m 靶

export function scorePage(): HTMLElement {
  const page = document.createElement('div');
  page.className = 'page';
  page.innerHTML = `<div class="grid2"><div id="l"></div><div id="r"></div></div>`;
  const l = page.querySelector('#l')!;
  const r = page.querySelector('#r')!;

  const faceCard = document.createElement('div');
  faceCard.className = 'card';
  faceCard.innerHTML = `<h2>靶面落点（最近一箭）</h2><div id="face"></div>
    <p class="small muted" style="text-align:center">环宽 6.1cm（122cm 标准靶缩放显示），红点为实际着箭点，角度按插靶偏航/俯仰标注。</p>`;
  l.appendChild(faceCard);

  const statsCard = document.createElement('div');
  statsCard.className = 'card';
  l.appendChild(statsCard);

  const histCard = document.createElement('div');
  histCard.className = 'card';
  histCard.innerHTML = `<h2>成绩记录</h2><div class="scroll-y" id="hist"></div>
    <button class="btn secondary" id="clear" style="margin-top:12px">清空记录</button>`;
  r.appendChild(histCard);

  function render() {
    renderFace(faceCard.querySelector('#face')!);
    renderStats(statsCard);
    renderHist(histCard.querySelector('#hist')!);
  }

  histCard.querySelector('#clear')!.addEventListener('click', () => {
    state.history = [];
    render();
  });

  render();
  return page;
}

function renderFace(container: HTMLElement) {
  const shot = state.lastShot;
  const colors = ['#f0d24a', '#f0d24a', '#e06a4a', '#e06a4a', '#5b8fd6', '#5b8fd6',
    '#2f2f36', '#2f2f36', '#e8e8e8', '#e8e8e8'];
  let html = `<div class="target-face" style="background:#f0d24a">`;
  // 10 个环，从外到内半径递减（最外 1 环最大）
  for (let ring = 1; ring <= 10; ring++) {
    const radiusPct = ring * 10; // 1 环=100%? 用 (11-ring)*10
    const size = (11 - ring) * 10;
    html += `<div class="ring" style="width:${size}%;height:${size}%;background:${colors[ring - 1]}"></div>`;
  }
  if (shot) {
    // 靶心对应 (y,z)=(0,0)，122cm 靶半径 61cm 映射到 50% 半径
    const scale = 50 / 61;
    const left = 50 + shot.z * 100 * scale;
    const top = 50 - shot.y * 100 * scale;
    const clamped = Math.max(4, Math.min(96, left));
    const clampedTop = Math.max(4, Math.min(96, top));
    html += `<div class="hit" style="left:${clamped}%;top:${clampedTop}%"></div>`;
  }
  html += `</div>`;
  if (shot) {
    html += `<div class="kv" style="margin-top:14px">
      <span class="k">环数</span><span>${shot.score}</span>
      <span class="k">着靶坐标(z/y)</span><span>${(shot.z * 100).toFixed(1)} / ${(shot.y * 100).toFixed(1)} cm</span>
      <span class="k">插靶偏航角</span><span>${(shot.yawAtImpact * 180 / Math.PI).toFixed(2)}°</span>
      <span class="k">插靶俯仰角</span><span>${(shot.pitchAtImpact * 180 / Math.PI).toFixed(2)}°</span>
    </div>`;
  } else {
    html += `<p class="muted small" style="text-align:center">还没有射箭记录</p>`;
  }
  container.innerHTML = html;
}

function renderStats(card: HTMLElement) {
  const h = state.history;
  if (!h.length) {
    card.innerHTML = `<h2>统计</h2><p class="muted small">暂无数据</p>`;
    return;
  }
  const scores = h.map((r) => r.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const max = Math.max(...scores);
  const tens = scores.filter((s) => s >= 9).length;
  card.innerHTML = `<h2>统计（共 ${h.length} 箭）</h2>
    <div class="readout">
      <div class="box"><div class="k">平均环数</div><div class="v">${avg.toFixed(1)}</div></div>
      <div class="box"><div class="k">最高</div><div class="v">${max}</div></div>
      <div class="box"><div class="k">9 环以上</div><div class="v">${tens} 箭</div></div>
      <div class="box"><div class="k">命中率</div><div class="v">${((scores.filter((s) => s > 0).length / scores.length) * 100).toFixed(0)}%</div></div>
    </div>`;
}

function renderHist(container: HTMLElement) {
  if (!state.history.length) {
    container.innerHTML = `<p class="muted small">暂无记录</p>`;
    return;
  }
  const rows = state.history.map((r) => {
    const bow = BOWS.find((b) => b.id === r.bowId)?.name ?? r.bowId;
    const arrow = ARROWS.find((a) => a.id === r.arrowId)?.name ?? r.arrowId;
    const cls = r.score >= 8 ? 'good' : r.score >= 5 ? 'warn' : 'bad';
    return `<tr>
      <td>${r.time}</td><td>${bow}</td><td class="small">${arrow}</td>
      <td class="num">${r.distance}m</td><td class="num">${r.wind}m/s</td>
      <td class="num">×${r.spineIndex.toFixed(2)}</td>
      <td class="num"><span class="pill ${cls}">${r.score}</span></td>
      <td class="num">${(r.z * 100).toFixed(0)}/${(r.y * 100).toFixed(0)}</td>
    </tr>`;
  }).join('');
  container.innerHTML = `<table><thead><tr>
    <th>时间</th><th>弓</th><th>箭</th><th class="num">距离</th><th class="num">风</th>
    <th class="num">挠度</th><th class="num">环</th><th class="num">z/y cm</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}
