import { mat4Basis, mat4LookAt, mat4Multiply, mat4Perspective, type Mat4 } from './mat4';
import { modeShape } from '../physics/beam';
import type { DerivedArrow } from '../physics/types';

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
uniform mat4 uProj, uView, uModel;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPos, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProj * uView * world;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform float uAmbient;
out vec4 outColor;
void main() {
  float d = max(dot(normalize(vNormal), normalize(uLightDir)), 0.0);
  vec3 col = uColor * (uAmbient + (1.0 - uAmbient) * d);
  outColor = vec4(col, 1.0);
}`;

const LINE_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
uniform mat4 uProj, uView, uModel;
void main() { gl_Position = uProj * uView * uModel * vec4(aPos, 1.0); }`;
const LINE_FRAG = `#version 300 es
precision highp float;
uniform vec3 uColor;
out vec4 outColor;
void main() { outColor = vec4(uColor, 1.0); }`;

interface Mesh { vao: WebGLVertexArrayObject; count: number; mode: number; }

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) ?? 'shader compile error');
  }
  return s;
}
function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) ?? 'link error');
  }
  return p;
}

function uploadMesh(
  gl: WebGL2RenderingContext,
  positions: Float32Array,
  normals: Float32Array,
  mode: number,
): Mesh {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  const pbuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const nbuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, nbuf);
  gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, count: positions.length / 3, mode };
}

export interface ArrowPose {
  pos: [number, number, number];
  axis: [number, number, number];
  /** 侧向弯曲模态坐标 m */
  q: number;
  /** 垂直弯曲模态坐标 m */
  qv: number;
}

export class Renderer {
  gl: WebGL2RenderingContext;
  prog: WebGLProgram;
  lineProg: WebGLProgram;
  meshes = new Map<string, Mesh>();
  proj: Mat4;
  view: Mat4;
  lightDir: [number, number, number] = [0.4, 0.9, 0.3];
  arrow: DerivedArrow;

  constructor(canvas: HTMLCanvasElement, arrow: DerivedArrow) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL2 不可用');
    this.gl = gl;
    this.arrow = arrow;
    this.prog = program(gl, VERT, FRAG);
    this.lineProg = program(gl, LINE_VERT, LINE_FRAG);
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0.82, 0.88, 0.92, 1);
    this.proj = mat4Perspective(Math.PI / 5, canvas.width / canvas.height, 0.05, 300);
    this.view = mat4LookAt([0, 1.6, 3], [0, 1.2, 0], [0, 1, 0]);
    this.buildStaticMeshes();
  }

  setCamera(eye: number[], center: number[]): void {
    this.view = mat4LookAt(eye, center, [0, 1, 0]);
  }

  private buildStaticMeshes(): void {
    const gl = this.gl;
    // 地面
    const g = this.gridMesh(80, 20);
    this.meshes.set('ground', uploadMesh(gl, g.pos, g.norm, gl.TRIANGLES));
    // 靶面（圆柱薄片 + 环纹用线）
    const t = this.targetMesh(0.61);
    this.meshes.set('target', uploadMesh(gl, t.pos, t.norm, gl.TRIANGLES));
    // 弓（简化：弧片+弦线分开）
    const b = this.bowMesh();
    this.meshes.set('bow', uploadMesh(gl, b.pos, b.norm, gl.TRIANGLES));
  }

  private gridMesh(size: number, div: number) {
    const pos: number[] = [];
    const norm: number[] = [];
    const step = size / div;
    for (let i = 0; i < div; i++) {
      for (let j = 0; j < div; j++) {
        const x0 = -size / 2 + i * step, x1 = x0 + step;
        const z0 = -size / 2 + j * step, z1 = z0 + step;
        const quad = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z0], [x1, 0, z1], [x0, 0, z1]];
        for (const v of quad) { pos.push(...v); norm.push(0, 1, 0); }
      }
    }
    return { pos: new Float32Array(pos), norm: new Float32Array(norm) };
  }

  private targetMesh(radius: number) {
    const pos: number[] = [];
    const norm: number[] = [];
    const seg = 48;
    // 圆盘（朝向 -x，法线 -x）
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const tri = [
        [0, 0, 0],
        [0, Math.cos(a0) * radius, Math.sin(a0) * radius],
        [0, Math.cos(a1) * radius, Math.sin(a1) * radius],
      ];
      for (const v of tri) { pos.push(...v); norm.push(-1, 0, 0); }
    }
    return { pos: new Float32Array(pos), norm: new Float32Array(norm) };
  }

  private bowMesh() {
    // 竖直弓片（细长六棱柱弯成弧形），放在 x≈0
    const pos: number[] = [];
    const norm: number[] = [];
    const seg = 12, radial = 6;
    const h = 1.5;
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg;
      const y0 = -h / 2 + t0 * h, y1 = -h / 2 + t1 * h;
      const xb0 = -0.05 * Math.sin(t0 * Math.PI), xb1 = -0.05 * Math.sin(t1 * Math.PI);
      for (let r = 0; r < radial; r++) {
        const a0 = (r / radial) * Math.PI * 2, a1 = ((r + 1) / radial) * Math.PI * 2;
        const rad = 0.018;
        const ring = (x: number, y: number, a: number) =>
          [x + Math.cos(a) * rad, y, Math.sin(a) * rad] as number[];
        const q = [
          ring(xb0, y0, a0), ring(xb0, y0, a1), ring(xb1, y1, a1),
          ring(xb0, y0, a0), ring(xb1, y1, a1), ring(xb1, y1, a0),
        ];
        for (let k = 0; k < q.length; k++) {
          pos.push(...q[k]);
          norm.push(Math.cos((a0 + a1) / 2), 0, Math.sin((a0 + a1) / 2));
        }
      }
    }
    return { pos: new Float32Array(pos), norm: new Float32Array(norm) };
  }

  /** 动态生成弯曲箭杆网格（沿体轴 x，按模态 q/qv 弯曲），含箭头与羽毛 */
  buildArrowMesh(pose: ArrowPose): Mesh {
    const gl = this.gl;
    const a = this.arrow;
    const L = a.lengthM;
    const seg = 20, radial = 8;
    const pos: number[] = [];
    const norm: number[] = [];
    const r = a.spec.diameterM / 2;
    // 弯曲中心线：体轴坐标 x∈[0,L]，横向偏移 q·φ(ξ)（z）与 qv·φ(ξ)（y）
    const center = (xi: number): [number, number, number] => {
      const x = xi * L;
      const bend = modeShape(Math.min(1, Math.max(0, xi)));
      return [x, qvOffset(pose.qv, bend), qOffset(pose.q, bend)];
    };
    function qOffset(q: number, phi: number) { return q * phi; }
    function qvOffset(qv: number, phi: number) { return qv * phi; }

    for (let i = 0; i < seg; i++) {
      const xi0 = i / seg, xi1 = (i + 1) / seg;
      const c0 = center(xi0), c1 = center(xi1);
      const dx = c1[0] - c0[0], dy = c1[1] - c0[1], dz = c1[2] - c0[2];
      const dl = Math.hypot(dx, dy, dz);
      // 环平面法向
      const tx = dx / dl, ty = dy / dl, tz = dz / dl;
      for (let k = 0; k < radial; k++) {
        const a0 = (k / radial) * Math.PI * 2, a1 = ((k + 1) / radial) * Math.PI * 2;
        const ring = (c: number[], ang: number) => {
          // 用与切线垂直的两个基向量
          const ny = ty, nx = tx, nz = tz;
          const b1 = [1 - nx * nx, -nx * ny, -nx * nz];
          const b2 = [0, nz, -ny];
          const bl = Math.hypot(b1[0], b1[1], b1[2]) || 1;
          return [
            c[0] + (b1[0] / bl) * Math.cos(ang) * r + b2[0] * Math.sin(ang) * r,
            c[1] + (b1[1] / bl) * Math.cos(ang) * r + b2[1] * Math.sin(ang) * r,
            c[2] + (b1[2] / bl) * Math.cos(ang) * r + b2[2] * Math.sin(ang) * r,
          ] as number[];
        };
        const q = [ring(c0, a0), ring(c0, a1), ring(c1, a1), ring(c0, a0), ring(c1, a1), ring(c1, a0)];
        for (const v of q) { pos.push(...v); norm.push(0, 1, 0); }
      }
    }
    // 箭头（圆锥）
    const tipBase = center(1);
    const tipApex = [tipBase[0] + 0.03, tipBase[1], tipBase[2]];
    for (let k = 0; k < radial; k++) {
      const a0 = (k / radial) * Math.PI * 2, a1 = ((k + 1) / radial) * Math.PI * 2;
      const rb = (ang: number) => [tipBase[0], tipBase[1] + Math.cos(ang) * r * 1.4, tipBase[2] + Math.sin(ang) * r * 1.4];
      for (const v of [rb(a0), rb(a1), tipApex]) { pos.push(...v); norm.push(1, 0, 0); }
    }
    return uploadMesh(gl, new Float32Array(pos), new Float32Array(norm), gl.TRIANGLES);
  }

  /** 轨迹线（GL_LINES） */
  buildTrajectory(points: [number, number, number][]): Mesh {
    const gl = this.gl;
    const pos = new Float32Array(points.flat());
    const norm = new Float32Array(points.length * 3);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, count: points.length, mode: gl.LINE_STRIP };
  }

  drawMesh(mesh: Mesh, model: Mat4, color: [number, number, number], ambient = 0.35): void {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uProj'), false, this.proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uView'), false, this.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uModel'), false, model);
    gl.uniform3fv(gl.getUniformLocation(this.prog, 'uColor'), color);
    gl.uniform3fv(gl.getUniformLocation(this.prog, 'uLightDir'), this.lightDir);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uAmbient'), ambient);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(mesh.mode, 0, mesh.count);
    gl.bindVertexArray(null);
  }

  drawLine(mesh: Mesh, model: Mat4, color: [number, number, number]): void {
    const gl = this.gl;
    gl.useProgram(this.lineProg);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uProj'), false, this.proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uView'), false, this.view);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uModel'), false, model);
    gl.uniform3fv(gl.getUniformLocation(this.lineProg, 'uColor'), color);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(mesh.mode, 0, mesh.count);
    gl.bindVertexArray(null);
  }

  clear(): void {
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  /** 从 pose（位置+体轴+弯曲）构造模型矩阵 */
  arrowModel(pose: ArrowPose): Mat4 {
    return mat4Basis(pose.pos, pose.axis, [0, 1, 0]);
  }
}
