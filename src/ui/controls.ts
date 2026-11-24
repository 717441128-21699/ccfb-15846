import { BOWS, ARROWS } from '../physics/catalog';
import { state, emit, getSpineIndex } from '../state';
import { spineVerdict } from '../physics/shot';

function select(label: string, value: string, options: [string, string][], onChange: (v: string) => void) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.innerHTML = `<div class="row"><span class="name">${label}</span></div>`;
  const sel = document.createElement('select');
  for (const [v, t] of options) {
    const o = document.createElement('option');
    o.value = v; o.textContent = t;
    if (v === value) o.selected = true;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => { onChange(sel.value); emit(); });
  wrap.appendChild(sel);
  return wrap;
}

function slider(label: string, value: number, min: number, max: number, step: number, unit: string,
  onChange: (v: number) => void) {
  const wrap = document.createElement('label');
  wrap.className = 'field';
  wrap.innerHTML = `<div class="row"><span class="name">${label}</span>
    <span class="val">${value}${unit}</span></div>`;
  const input = document.createElement('input');
  input.type = 'range'; input.min = String(min); input.max = String(max);
  input.step = String(step); input.value = String(value);
  input.addEventListener('input', () => {
    const v = Number(input.value);
    onChange(v);
    wrap.querySelector('.val')!.textContent = `${v}${unit}`;
    emit();
  });
  wrap.appendChild(input);
  return wrap;
}

/** 通用器材与环境参数面板（搭配页与射箭场共用） */
export function equipmentPanel(onNeedZeroClear?: () => void): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<h2>弓与箭</h2>`;

  card.appendChild(select('弓', state.bowId, BOWS.map((b) => [b.id, b.name]),
    (v) => { state.bowId = v; onNeedZeroClear?.(); }));
  card.appendChild(select('箭', state.arrowId, ARROWS.map((a) => [a.id, a.name]),
    (v) => { state.arrowId = v; onNeedZeroClear?.(); }));

  const verdictBox = document.createElement('div');
  const renderVerdict = () => {
    const idx = getSpineIndex();
    const v = spineVerdict(idx);
    const cls = v.drift === 'center' ? 'center' : v.drift === 'right' ? 'bad' : 'warn';
    verdictBox.innerHTML = `<div class="row-flex" style="margin:6px 0 12px">
      <span class="pill ${cls}">${v.label}</span>
      <span class="small muted">${v.advice}</span></div>`;
  };
  renderVerdict();
  card.appendChild(verdictBox);

  const bow = BOWS.find((b) => b.id === state.bowId)!;
  card.appendChild(slider('拉距', state.drawLengthIn, bow.minDrawIn, bow.maxDrawIn, 0.25, ' in',
    (v) => { state.drawLengthIn = v; onNeedZeroClear?.(); renderVerdict(); }));

  card.innerHTML += `<h3>风与误差</h3>`;
  card.appendChild(slider('侧风（+向右吹）', state.windSide, 0, 8, 0.5, ' m/s',
    (v) => { state.windSide = v; }));
  card.appendChild(slider('逆风', state.windHead, 0, 6, 0.5, ' m/s',
    (v) => { state.windHead = v; }));
  card.appendChild(slider('撒放时机抖动 1σ', state.releaseTimingSigma * 1000, 0, 20, 1, ' ms',
    (v) => { state.releaseTimingSigma = v / 1000; }));
  card.appendChild(slider('手抖角 1σ', state.handTremorSigma * 1000, 0, 4, 0.1, ' mrad',
    (v) => { state.handTremorSigma = v / 1000; }));
  card.appendChild(slider('距离', state.distance, 18, 90, 1, ' m',
    (v) => { state.distance = v; onNeedZeroClear?.(); }));

  return card;
}
