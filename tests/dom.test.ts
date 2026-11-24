import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

before(() => {
  const dom = new JSDOM('<!doctype html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const g = globalThis as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  const store = new Map<string, string>();
  g.localStorage = {
    getItem(k: string) { return store.has(k) ? store.get(k)! : null; },
    setItem(k: string, v: string) { store.set(k, v); },
    removeItem(k: string) { store.delete(k); },
    clear() { store.clear(); },
  };
  g.location = dom.window.location;
  g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16) as unknown as number;
  g.cancelAnimationFrame = (id: number) => clearTimeout(id);
  // Canvas：WebGL2 与 2D 双上下文 mock
  g.HTMLCanvasElement = dom.window.HTMLCanvasElement;
  const ctx2d = new Proxy({}, {
    get: () => () => {},
  });
  dom.window.HTMLCanvasElement.prototype.getContext = function (type: string) {
    if (type === '2d') return ctx2d;
    return {
      createShader: () => ({}), shaderSource() {}, compileShader() {}, getShaderParameter: () => true,
      getShaderInfoLog: () => '', createProgram: () => ({}), attachShader() {}, linkProgram() {},
      getProgramParameter: () => true, getProgramInfoLog: () => '',
      createVertexArray: () => ({}), bindVertexArray() {}, createBuffer: () => ({}), bindBuffer() {},
      bufferData() {}, enableVertexAttribArray() {}, vertexAttribPointer() {}, drawArrays() {},
      useProgram() {}, uniformMatrix4fv() {}, uniform3fv() {}, uniform1f() {}, getUniformLocation: () => 0,
      enable() {}, clearColor() {}, clear() {}, viewport() {}, deleteVertexArray() {},
      VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7,
      TRIANGLES: 8, LINE_STRIP: 9, COLOR_BUFFER_BIT: 10, DEPTH_BUFFER_BIT: 11, DEPTH_TEST: 12,
    };
  } as typeof dom.window.HTMLCanvasElement.prototype.getContext;
});

test('四个页面均可挂载到 DOM 且无异常', async () => {
  const { rangePage } = await import('../src/ui/rangePage');
  const { matchingPage } = await import('../src/ui/matchingPage');
  const { analysisPage } = await import('../src/ui/analysisPage');
  const { scorePage } = await import('../src/ui/scorePage');
  for (const build of [rangePage, matchingPage, analysisPage, scorePage]) {
    const el = build();
    assert.ok(el instanceof (globalThis.window as any).HTMLElement);
    assert.ok(el.querySelectorAll('*').length > 5, '页面应包含多个控件');
  }
});

test('射箭场端到端：点击撒放后产生成绩记录并更新读数', async () => {
  const { state } = await import('../src/state');
  const { rangePage } = await import('../src/ui/rangePage');
  state.history = [];
  const page = rangePage();
  document.body.appendChild(page);
  const before = state.history.length;
  const btn = page.querySelector('button.btn') as HTMLButtonElement;
  assert.ok(btn && btn.textContent?.includes('撒放'));
  btn.click();
  assert.equal(state.history.length, before + 1);
  assert.ok(state.lastShot !== null);
  assert.ok(Number.isFinite(state.lastShot.score));
  // 读数区出现环数
  assert.match(page.textContent ?? '', /环/);
});

test('成绩页渲染历史记录与靶面', async () => {
  const { fireShot } = await import('../src/state');
  fireShot();
  const { scorePage } = await import('../src/ui/scorePage');
  const page = scorePage();
  assert.ok(page.querySelector('.target-face'));
  assert.ok((page.textContent ?? '').includes('统计'));
});

test('慢放页包含播放控件与离弦数据', async () => {
  const { analysisPage } = await import('../src/ui/analysisPage');
  const page = analysisPage();
  assert.ok(page.querySelector('#scrub'));
  assert.ok((page.textContent ?? '').includes('初速'));
});
