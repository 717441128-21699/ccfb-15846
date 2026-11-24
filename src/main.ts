import './ui/styles.css';
import { rangePage } from './ui/rangePage';
import { matchingPage } from './ui/matchingPage';
import { analysisPage } from './ui/analysisPage';
import { scorePage } from './ui/scorePage';

const TABS = [
  { id: 'range', label: '射箭场', build: rangePage },
  { id: 'matching', label: '弓箭搭配', build: matchingPage },
  { id: 'analysis', label: '慢放分析', build: analysisPage },
  { id: 'score', label: '成绩', build: scorePage },
] as const;

type TabId = (typeof TABS)[number]['id'];
let current: TabId = (location.hash.replace('#', '') as TabId) || 'range';
if (!TABS.some((t) => t.id === current)) current = 'range';

const app = document.querySelector('#app')!;
const header = document.createElement('header');
header.className = 'topbar';
header.innerHTML = `<h1>弓道 · 弹性箭杆模拟</h1><nav class="tabs"></nav><div class="spacer"></div>
  <span class="tag muted">WebGL2 · 欧拉-伯努利梁模态 · 6DOF 气动</span>`;
app.appendChild(header);
const nav = header.querySelector('nav.tabs')!;

const main = document.createElement('main');
app.appendChild(main);

function switchTab(id: TabId) {
  current = id;
  location.hash = id;
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
  main.innerHTML = '';
  const tab = TABS.find((t) => t.id === id)!;
  main.appendChild(tab.build());
}

for (const tab of TABS) {
  const btn = document.createElement('button');
  btn.textContent = tab.label;
  btn.dataset.tab = tab.id;
  btn.addEventListener('click', () => switchTab(tab.id));
  nav.appendChild(btn);
}

window.addEventListener('hashchange', () => {
  const id = location.hash.replace('#', '') as TabId;
  if (TABS.some((t) => t.id === id) && id !== current) switchTab(id);
});

switchTab(current);
