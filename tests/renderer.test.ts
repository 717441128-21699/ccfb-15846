import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, type ArrowPose } from '../src/webgl/renderer';
import { mat4Basis, mat4Perspective, mat4LookAt, mat4Multiply } from '../src/webgl/mat4';
import { deriveArrow } from '../src/physics/derive';
import { ARROWS } from '../src/physics/catalog';

// 最小 WebGL2 mock：只记录调用，不做真实 GPU
function makeMockGL() {
  const store = new Map<string, unknown>();
  return {
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TRIANGLES: 8, LINE_STRIP: 9,
    COLOR_BUFFER_BIT: 10, DEPTH_BUFFER_BIT: 11, DEPTH_TEST: 12,
    createShader: () => ({}), shaderSource() {}, compileShader() {},
    getShaderParameter: () => true, getShaderInfoLog: () => '',
    createProgram: () => ({}), attachShader() {}, linkProgram() {},
    getProgramParameter: () => true, getProgramInfoLog: () => '',
    createVertexArray: () => ({}), bindVertexArray() {}, createBuffer: () => ({}),
    bindBuffer() {}, bufferData() {}, enableVertexAttribArray() {},
    vertexAttribPointer() {}, drawArrays() {}, useProgram() {},
    uniformMatrix4fv() {}, uniform3fv() {}, uniform1f() {},
    getUniformLocation: () => 0, enable() {}, clearColor() {}, clear() {}, viewport() {},
    deleteVertexArray() {},
  } as unknown as WebGL2RenderingContext;
}

test('mat4 工具：透视/观察/基矩阵可乘且有限', () => {
  const p = mat4Perspective(Math.PI / 4, 1.5, 0.1, 100);
  const v = mat4LookAt([0, 1.6, 3], [0, 1, 0], [0, 1, 0]);
  const m = mat4Basis([1, 2, 3], [1, 0, 0], [0, 1, 0]);
  const out = mat4Multiply(p, mat4Multiply(v, m));
  assert.equal(out.length, 16);
  assert.ok(out.every((n) => Number.isFinite(n)));
});

test('Renderer 可在 mock GL 上实例化并生成静态网格', () => {
  const arrow = deriveArrow(ARROWS.find((a) => a.id === 'carbon-500')!);
  const canvas = { width: 800, height: 600, getContext: () => makeMockGL() } as unknown as HTMLCanvasElement;
  const r = new Renderer(canvas, arrow);
  assert.ok(r.meshes.has('ground'));
  assert.ok(r.meshes.has('target'));
  assert.ok(r.meshes.has('bow'));
});

test('弯曲箭杆网格随模态 q 生成且顶点有限', () => {
  const arrow = deriveArrow(ARROWS.find((a) => a.id === 'carbon-500')!);
  const canvas = { width: 800, height: 600, getContext: () => makeMockGL() } as unknown as HTMLCanvasElement;
  const r = new Renderer(canvas, arrow);
  const pose: ArrowPose = { pos: [5, 1, 0.2], axis: [1, 0, 0], q: 0.01, qv: -0.005 };
  const mesh = r.buildArrowMesh(pose);
  assert.ok(mesh.count > 100);
  const traj = r.buildTrajectory([[0, 0, 0], [1, 0.1, 0], [2, 0.3, 0.05]]);
  assert.equal(traj.count, 3);
});

test('不同羽毛尺寸的箭均可构建渲染资源', () => {
  for (const id of ['fletch-small', 'carbon-500', 'fletch-large']) {
    const arrow = deriveArrow(ARROWS.find((a) => a.id === id)!);
    const canvas = { width: 400, height: 300, getContext: () => makeMockGL() } as unknown as HTMLCanvasElement;
    const r = new Renderer(canvas, arrow);
    const mesh = r.buildArrowMesh({ pos: [0, 0, 0], axis: [1, 0, 0], q: 0, qv: 0 });
    assert.ok(mesh.count > 100);
  }
});
