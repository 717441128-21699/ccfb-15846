import { Renderer, type ArrowPose } from '../webgl/renderer';
import { mat4Identity, mat4Basis, mat4Perspective } from '../webgl/mat4';
import type { DerivedArrow, ShotSample } from '../physics/types';

export interface SceneHandle {
  renderer: Renderer;
  canvas: HTMLCanvasElement;
  drawScene: (opts: SceneOpts) => void;
}

interface SceneOpts {
  arrow: DerivedArrow;
  pose: ArrowPose;
  targetDistance: number;
  trajectory?: ShotSample[];
  showBow?: boolean;
  cameraDist?: number;
}

export function createScene(canvas: HTMLCanvasElement, arrow: DerivedArrow): SceneHandle {
  const fit = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(2, Math.floor(rect.width * dpr));
    canvas.height = Math.max(2, Math.floor(rect.height * dpr));
  };
  fit();
  const renderer = new Renderer(canvas, arrow);
  const gl = renderer.gl;

  function drawScene({ arrow: ar, pose, targetDistance, trajectory, showBow, cameraDist }: SceneOpts) {
    renderer.arrow = ar;
    fit();
    gl.viewport(0, 0, canvas.width, canvas.height);
    renderer.proj = mat4Perspective(Math.PI / 5, canvas.width / canvas.height, 0.05, 400);
    // 相机：侧后方跟随，看向箭与靶之间
    const cd = cameraDist ?? 4;
    const eye: [number, number, number] = [
      Math.max(-2, pose.pos[0] - cd),
      pose.pos[1] + 1.4,
      pose.pos[2] + cd * 0.8,
    ];
    const center: [number, number, number] = [pose.pos[0] + 6, pose.pos[1] + 0.2, pose.pos[2]];
    renderer.setCamera(eye, center);

    renderer.clear();
    // 地面（平移到箭下方）
    renderer.drawMesh(renderer.meshes.get('ground')!, mat4Basis([0, 0, 0], [1, 0, 0], [0, 1, 0]),
      [0.32, 0.45, 0.34], 0.6);
    // 靶
    const targetModel = mat4Basis([targetDistance, 1.3, 0], [1, 0, 0], [0, 1, 0]);
    renderer.drawMesh(renderer.meshes.get('target')!, targetModel, [0.85, 0.8, 0.6], 0.5);
    // 弓（固定在起点附近）
    if (showBow) {
      renderer.drawMesh(renderer.meshes.get('bow')!, mat4Basis([0, 1.3, 0], [1, 0, 0], [0, 1, 0]),
        [0.55, 0.35, 0.2], 0.4);
    }
    // 轨迹
    if (trajectory && trajectory.length > 1) {
      const pts = trajectory.map((s) => [s.x, s.y + 1.3, s.z] as [number, number, number]);
      const line = renderer.buildTrajectory(pts);
      renderer.drawLine(line, mat4Identity(), [0.95, 0.4, 0.2]);
    }
    // 箭（位置抬高到靶心高度基准 1.3m）
    const worldPose: ArrowPose = {
      pos: [pose.pos[0], pose.pos[1] + 1.3, pose.pos[2]],
      axis: pose.axis, q: pose.q, qv: pose.qv,
    };
    const arrowMesh = renderer.buildArrowMesh(worldPose);
    renderer.drawMesh(arrowMesh, renderer.arrowModel(worldPose), [0.75, 0.55, 0.3], 0.35);
    gl.deleteVertexArray(arrowMesh.vao);
  }

  return { renderer, canvas, drawScene };
}

/** 由样本中的姿态角求体轴方向 */
export function axisFromAngles(yaw: number, pitch: number): [number, number, number] {
  return [
    Math.cos(pitch) * Math.cos(yaw),
    Math.sin(pitch),
    Math.cos(pitch) * Math.sin(yaw),
  ];
}
