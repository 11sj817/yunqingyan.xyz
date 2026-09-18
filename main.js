// ============================================================
// 产品官网式交互:滚动驱动运镜 + 爆炸拆解编排
// 分区策略:用 setViewOffset 在屏幕空间整体平移模型,
// 每章把模型推到文字卡片的对侧,像素级保证不遮挡。
// ============================================================
import * as THREE from 'three';
import { buildEngine, PART_INFO } from './engine.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

// ---------- 灯光 ----------
scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x141210, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 2.8);
key.position.set(6, 10, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -9; key.shadow.camera.right = 9;
key.shadow.camera.top = 9; key.shadow.camera.bottom = -7;
key.shadow.camera.far = 32;
key.shadow.bias = -0.0004;
scene.add(key);
const rim = new THREE.DirectionalLight(0x7fb2ff, 1.3);
rim.position.set(-8, 4, -7);
scene.add(rim);
const fill = new THREE.DirectionalLight(0xffd9a0, 0.5);
fill.position.set(3, 2, -9);
scene.add(fill);

// 接触阴影地面
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(15, 48),
  new THREE.ShadowMaterial({ opacity: 0.32 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -3.05;
ground.receiveShadow = true;
scene.add(ground);

// ---------- 发动机 ----------
const eng = buildEngine();
scene.add(eng.root);

// ---------- 滚动编排关键帧 ----------
// t 与各章节滚动窗口对齐;shift 为模型在屏幕上的水平位移
// (占屏宽比例,正=模型移向右侧,给左侧文字让位;负=相反);
// dim 为画布整体透明度(零件图鉴整页卡片时压暗背景模型)。
const KEY = [
  { t: 0.00, pos: [8.2, 4.0, 9.0],  tgt: [0, 1.1, 0], shift: 0.30,  explode: 0,    spin: 0.10, run: 1 },
  { t: 0.10, pos: [1.4, 2.4, 10.8], tgt: [0, 1.4, 0], shift: 0.28,  explode: 0,    spin: 0,    run: 1 },
  { t: 0.27, pos: [4.2, 9.6, 4.6],  tgt: [0, 2.2, 0], shift: -0.28, explode: 0,    spin: 0,    run: 0.5 },
  { t: 0.40, pos: [8.6, 3.4, 9.4],  tgt: [0, 1.9, 0], shift: 0.24,  explode: 0.5,  spin: 0,    run: 0.15 },
  { t: 0.52, pos: [-9.8, 5.2, 8.8], tgt: [0, 2.5, 0], shift: 0.22,  explode: 1,    spin: 0.08, run: 0 },
  { t: 0.62, pos: [-9.8, 5.2, 8.8], tgt: [0, 2.5, 0], shift: 0.22,  explode: 1,    spin: 0.08, run: 0 },
  { t: 0.74, pos: [6.5, 7.5, 10.8], tgt: [0, 1.2, 0], shift: 0.0,   explode: 0.4,  spin: 0,    run: 0.4, dim: 0.28 },
  { t: 0.90, pos: [6.5, 7.5, 10.8], tgt: [0, 1.2, 0], shift: 0.0,   explode: 0.3,  spin: 0,    run: 0.5, dim: 0.24 },
  { t: 1.00, pos: [9.8, 3.2, 10.4], tgt: [0, 0.9, 0], shift: -0.26, explode: 0,    spin: 0.08, run: 1, dim: 1 },
];
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = k => k * k * (3 - 2 * k);

function sampleKeys(p) {
  let i = 0;
  while (i < KEY.length - 2 && p > KEY[i + 1].t) i++;
  const A = KEY[i], B = KEY[i + 1];
  const k = smooth(Math.min(Math.max((p - A.t) / (B.t - A.t), 0), 1));
  return {
    pos: A.pos.map((v, j) => lerp(v, B.pos[j], k)),
    tgt: A.tgt.map((v, j) => lerp(v, B.tgt[j], k)),
    shift: lerp(A.shift, B.shift, k),
    explode: lerp(A.explode, B.explode, k),
    spin: lerp(A.spin, B.spin, k),
    run: lerp(A.run, B.run, k),
    dim: lerp(A.dim ?? 1, B.dim ?? 1, k),
  };
}

// ---------- 滚动 ----------
let scrollP = 0, scrollPsmooth = 0;
const readScroll = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  scrollP = max > 0 ? Math.min(Math.max(scrollY / max, 0), 1) : 0;
};
addEventListener('scroll', readScroll, { passive: true });
readScroll();

// ---------- 模型交互:拖拽旋转(带惯性) + 点击拾取 ----------
let modelYaw = 0, yawVel = 0, dragging = false, lastX = 0;

canvas.addEventListener('pointerdown', e => {
  dragging = true; lastX = e.clientX; yawVel = 0;
  canvas.classList.add('grabbing');
});
addEventListener('pointermove', e => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  lastX = e.clientX;
  modelYaw += dx * 0.006;
  yawVel = dx * 0.006 * 60;   // 惯性:松手后按角速度继续转
});
addEventListener('pointerup', () => {
  dragging = false;
  canvas.classList.remove('grabbing');
});

// 拾取(点击零件 → 图鉴高亮 + 底部信息条)
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downXY = null;
canvas.addEventListener('pointerdown', e => { downXY = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!downXY) return;
  const dx = e.clientX - downXY[0], dy = e.clientY - downXY[1];
  downXY = null;
  if (dx * dx + dy * dy > 25) return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(eng.root.children, true)
    .find(h => h.object.userData.part);
  if (hit) highlight(hit.object.userData.part);
});

function highlight(name) {
  for (const [pn, mats] of Object.entries(eng.mats)) {
    const on = pn === name;
    for (const m of mats || []) {
      m.emissive = new THREE.Color(on ? 0x2f66d8 : 0x000000);
      m.emissiveIntensity = on ? 0.85 : 0;
    }
  }
  document.querySelectorAll('.pcard').forEach(c =>
    c.classList.toggle('hot', c.dataset.part === name));
  if (name && PART_INFO[name]) {
    const strip = document.getElementById('pickInfo');
    strip.querySelector('.pi-name').textContent = PART_INFO[name].name;
    strip.querySelector('.pi-desc').textContent = PART_INFO[name].desc;
    strip.classList.add('show');
    clearTimeout(highlight._t);
    highlight._t = setTimeout(() => strip.classList.remove('show'), 5000);
  }
}

// 图鉴卡片 → 高亮零件
document.querySelectorAll('.pcard').forEach(card => {
  card.addEventListener('mouseenter', () => highlight(card.dataset.part));
  card.addEventListener('mouseleave', () => highlight(null));
  card.addEventListener('click', () => highlight(card.dataset.part));
});

// ---------- 章节浮现 ----------
const io = new IntersectionObserver(es => {
  es.forEach(e => e.isIntersecting && e.target.classList.add('in'));
}, { threshold: 0.18 });
document.querySelectorAll('.fade').forEach(el => io.observe(el));

// ---------- 3D 标签 ----------
const labelLayer = document.getElementById('labels');
const labels = eng.anchors.map(a => {
  const el = document.createElement('div');
  el.className = 'lbl';
  el.textContent = a.userData.label;
  el.style.opacity = '0';
  labelLayer.appendChild(el);
  return { anchor: a, el };
});
const v3 = new THREE.Vector3();
function updateLabels(opacity) {
  for (const { anchor, el } of labels) {
    if (opacity <= 0.01) { el.style.opacity = '0'; continue; }
    anchor.getWorldPosition(v3);
    v3.project(camera);
    if (v3.z > 1) { el.style.opacity = '0'; continue; }
    const x = (v3.x * 0.5 + 0.5) * innerWidth;
    const y = (-v3.y * 0.5 + 0.5) * innerHeight;
    el.style.opacity = opacity.toFixed(2);
    el.style.transform = `translate(${x}px, ${y}px)`;
  }
}

// ---------- 主循环 ----------
const clock = new THREE.Clock();
let theta = 0, omega = 0, explodeNow = 0;

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  // 滚动/拆解:重阻尼平滑(慢而稳)
  scrollPsmooth += (scrollP - scrollPsmooth) * Math.min(1, dt * 2.2);
  const K = sampleKeys(scrollPsmooth);
  // 运转:目标视觉转速 480rpm,平滑跟随(慢转)
  omega += (K.run * 480 - omega) * Math.min(1, dt * 1.0);
  theta += omega * dt * 0.12;

  explodeNow += (K.explode - explodeNow) * Math.min(1, dt * 2.4);
  eng.update(theta, explodeNow);

  // 模型拖拽:惯性衰减 + 缓慢回正
  if (!dragging) {
    modelYaw += yawVel * dt;
    yawVel *= Math.max(0, 1 - dt * 2.5);
    modelYaw += (0 - modelYaw) * Math.min(1, dt * 0.35);
  }
  eng.root.rotation.y = modelYaw;

  // 相机:关键帧 + 缓慢自旋,重阻尼
  const spinAng = K.spin ? clock.elapsedTime * K.spin * 0.06 : 0;
  const baseAng = Math.atan2(K.pos[2], K.pos[0]);
  const radius = Math.hypot(K.pos[0], K.pos[2]);
  const totalAng = baseAng + spinAng;
  camera.position.set(
    Math.cos(totalAng) * radius,
    K.pos[1],
    Math.sin(totalAng) * radius
  );
  camera.lookAt(K.tgt[0], K.tgt[1], K.tgt[2]);

  // 屏幕空间分区:整体平移渲染画面,把模型推到文字对侧
  camera.setViewOffset(innerWidth, innerHeight, -K.shift * innerWidth, 0, innerWidth, innerHeight);

  // 图鉴整页卡片时压暗背景模型
  canvas.style.opacity = K.dim.toFixed(3);

  const labelOp = Math.max(0, 1 - Math.abs(scrollPsmooth - 0.5) / 0.11);
  updateLabels(labelOp);

  renderer.render(scene, camera);
}
// 调试/自动化钩子:暴露交互状态供测试读取
window.__eng = { get yaw() { return modelYaw; }, get vel() { return yawVel; }, eng };
tick();
