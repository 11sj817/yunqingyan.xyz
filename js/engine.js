// ============================================================
// 直列四缸 DOHC 发动机 —— 程序化建模 + 曲柄连杆运动学
// 坐标约定: Y 上 / Z 曲轴轴向 / 曲轴中心线 y=0 (根节点整体抬高)
// ============================================================
import * as THREE from 'three';

// ---------- 零件图鉴(中文) ----------
export const PART_INFO = {
  block:   { name: '缸体', desc: '铝合金铸造的发动机骨架,内部有四个气缸孔,活塞在其中往复运动;下部曲轴箱承装曲轴,水道与油道贯穿整个缸体。' },
  head:    { name: '缸盖', desc: '位于缸体顶部,通过缸垫与缸体密封。内置燃烧室与进排气道,双顶置凸轮轴(DOHC)直接压动气门,控制换气过程。' },
  piston:  { name: '活塞', desc: '承受燃烧爆发的压力,在气缸内往复运动。顶部是燃烧室的底面,环槽中的活塞环负责密封燃气并刮布机油。' },
  rod:     { name: '连杆', desc: '连接活塞与曲轴的传力杆件,把活塞的往复直线运动转换为曲轴的旋转运动。大头端为剖分式结构,内装轴瓦。' },
  crank:   { name: '曲轴', desc: '发动机的"脊梁"。把四个气缸的往复力汇聚成旋转扭矩输出;曲柄臂下方的配重块用于平衡旋转离心力,尾部装飞轮。' },
  cam:     { name: '凸轮轴', desc: '以曲轴一半的转速旋转(2:1)。每根轴上的凸轮桃尖按点火顺序准时下压气门,实现进气与排气的正时控制。' },
  valve:   { name: '气门', desc: '进气门开启吸入新鲜空气,排气门开启排出废气。盘状头部与气门座圈贴合密封,气门弹簧保证它及时回座。' },
  plug:    { name: '火花塞', desc: '在压缩行程终了释放电火花,点燃被活塞压缩的可燃混合气,推动活塞下行做功——这就是点火系统的执行端。' },
  gasket:  { name: '缸盖垫片', desc: '夹在缸体与缸盖之间的多层金属密封垫,既要封住数千度的高温燃气,又要封住水道与油道,是发动机最苛刻的密封件。' },
  intake:  { name: '进气歧管', desc: '稳压腔先把空气"存"起来,再通过四根弯曲的进气道均分给四个气缸。气道长度经过调校,利用脉冲效应提升中低转扭矩。' },
  exhaust: { name: '排气歧管', desc: '把四个气缸排出的废气汇集到一起送往三元催化器。工作时温度可超过 800°C,通常由铸铁或不锈钢制成。' },
  pan:     { name: '油底壳', desc: '发动机最底部的机油储存池。曲轴旋转时曲柄会溅起机油润滑缸壁,底部磁性放油螺栓用于换油。' },
  flywheel:{ name: '飞轮', desc: '安装在曲轴尾部的大惯量圆盘,储存做功行程的能量,填补其他三个行程的"动力空窗",平息扭矩脉动。外圈齿圈供起动机啮合。' },
  pulley:  { name: '曲轴皮带轮', desc: '曲轴前端的旋转输出端,通过皮带驱动发电机、空调压缩机等附件,内含扭转减振橡胶层。' },
  belt:    { name: '正时链条', desc: '严格锁定曲轴与凸轮轴 2:1 的相位关系——正时一旦错位,气门就会与活塞相撞,发动机大修。' },
  sprocket:{ name: '正时链轮', desc: '与正时链条啮合的传动轮,把曲轴的旋转按精确比例分配给进、排气凸轮轴。' },
};

// ---------- 参数 ----------
const R = 0.42;            // 曲柄半径(半冲程)
const L = 1.55;            // 连杆长度
const BORE = 0.46;         // 活塞半径
const SPACING = 1.6;       // 缸心距
const ZPOS = [-2.4, -0.8, 0.8, 2.4];
const PHASE = [0, Math.PI, Math.PI, 0];              // 曲柄相位(平面曲轴)
const FIRE = [0, Math.PI, 1.5 * Math.PI, 0.5 * Math.PI]; // 点火间隔(1-3-4-2 感)
const DECK = R + L + 0.42;  // 缸体顶面
const HALFLEN = 3.5;
const CAM_Y = DECK + 1.02;  // 凸轮轴高度
const CAM_X = 0.27;         // 进/排气凸轮轴 x 偏移
const VALVE_X = 0.27;       // 气门 x 偏移
const MAXLIFT = 0.13;

const M = (c, rough = 0.55, metal = 0.75) =>
  new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal });

// 螺旋线(气门弹簧)
class Helix extends THREE.Curve {
  constructor(r, h, turns) { super(); this.r = r; this.h = h; this.turns = turns; }
  getPoint(t) {
    const a = this.turns * Math.PI * 2 * t;
    return new THREE.Vector3(Math.cos(a) * this.r, t * this.h, Math.sin(a) * this.r);
  }
}

// ---------- 构建 ----------
export function buildEngine() {
  const root = new THREE.Group();
  const parts = {}; // name -> {group, dir:Vector3, dist}
  const mats = {};  // part name -> material(高亮用)

  const reg = (name, group, dir, dist) => {
    group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.part = name; } });
    mats[name] = group.children.length ? collectMat(group) : null;
    parts[name] = { group, dir: new THREE.Vector3(...dir), dist };
    root.add(group);
  };
  const collectMat = g => { const m = new Set(); g.traverse(o => o.isMesh && o.material && m.add(o.material)); return [...m]; };

  // ----- 缸体(开放式顶面,便于观察活塞) -----
  const block = new THREE.Group();
  const bm = M(0x4a5158, 0.62, 0.65);
  const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.14, DECK + 0.75, HALFLEN * 2), bm);
  wallL.position.set(-0.78, (DECK - 0.75) / 2, 0);
  const wallR = wallL.clone(); wallR.position.x = 0.78;
  const front = new THREE.Mesh(new THREE.BoxGeometry(1.56, DECK + 0.75, 0.14), bm);
  front.position.set(0, (DECK - 0.75) / 2, -HALFLEN + 0.07);
  const back = front.clone(); back.position.z = HALFLEN - 0.07;
  block.add(wallL, wallR, front, back);
  // 顶面:横梁 + 侧轨(露出缸孔)
  for (const zt of [-3.2, -1.6, 0, 1.6, 3.2]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.14, 0.42), bm);
    strip.position.set(0, DECK, zt); block.add(strip);
  }
  for (const xs of [-0.71, 0.71]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, HALFLEN * 2), bm);
    rail.position.set(xs, DECK, 0); block.add(rail);
  }
  // 缸套(从顶面可见的深色缸孔)
  const linerMat = M(0x23262b, 0.4, 0.85);
  for (const z of ZPOS) {
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(BORE + 0.03, BORE + 0.03, DECK + 0.2, 28, 1, true), linerMat);
    liner.position.set(0, (DECK - 0.75) / 2 + 0.1, z); block.add(liner);
  }
  reg('block', block, [0, 0, 0], 0);

  // ----- 缸盖(壳体) -----
  const head = new THREE.Group();
  const hm = M(0x586069, 0.55, 0.7);
  const hBase = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.34, HALFLEN * 2), hm);
  hBase.position.set(0, DECK + 0.26, 0);
  const hRailL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, HALFLEN * 2), hm);
  hRailL.position.set(-0.7, DECK + 0.55, 0);
  const hRailR = hRailL.clone(); hRailR.position.x = 0.7;
  const hFront = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.85, 0.14), hm);
  hFront.position.set(0, DECK + 0.55, -HALFLEN + 0.07);
  const hBack = hFront.clone(); hBack.position.z = HALFLEN - 0.07;
  for (const zt of [-3.2, -1.6, 0, 1.6, 3.2]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.2, 0.3), hm);
    strip.position.set(0, DECK + 0.88, zt); head.add(strip);
  }
  head.add(hBase, hRailL, hRailR, hFront, hBack);
  reg('head', head, [0, 2.4, 0], 1);

  // ----- 缸垫 -----
  const gasket = new THREE.Group();
  const gm = M(0x8a2f2b, 0.5, 0.6);
  for (const xs of [-0.7, 0, 0.7]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, HALFLEN * 2), gm);
    bar.position.set(xs, DECK + 0.09, 0); gasket.add(bar);
  }
  reg('gasket', gasket, [0, 1.3, 0], 1);

  // ----- 凸轮轴 ×2 -----
  const camGroup = new THREE.Group();
  const camM = M(0x82898f, 0.35, 0.9);
  for (const cx of [-CAM_X, CAM_X]) {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, HALFLEN * 2 + 0.9, 20), camM);
    shaft.rotation.x = Math.PI / 2; shaft.position.set(cx, CAM_Y, 0);
    camGroup.add(shaft);
    for (let j = 0; j < 4; j++) {
      for (const [kind, sgn] of [['in', 1], ['ex', -1]]) {
        const lobe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.11, 22), camM);
        lobe.rotation.x = Math.PI / 2;
        lobe.scale.set(1.45, 1, 0.75); // 椭圆桃尖
        const jj = (cx < 0) ? j : j;   // 两轴同相位分布
        lobe.userData.lobePhase = FIRE[j] / 2 + (kind === 'ex' ? Math.PI / 2 : 0);
        lobe.position.set(cx, CAM_Y, ZPOS[j] + sgn * 0.22);
        lobe.rotation.y = 0;
        lobe.rotation.z = 0;
        camGroup.add(lobe);
      }
    }
    // 链轮
    const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.1, 24), camM);
    sp.rotation.x = Math.PI / 2; sp.position.set(cx, CAM_Y, HALFLEN + 0.62);
    camGroup.add(sp);
    // 轴座
    for (const zp of [-2.8, -1, 1, 2.8]) {
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), hm);
      ped.position.set(cx, CAM_Y - 0.32, zp); camGroup.add(ped);
    }
  }
  // lobe 初始朝向:桃尖向下时对应 lift 最大
  camGroup.traverse(o => { if (o.userData.lobePhase !== undefined) o.rotation.z = o.userData.lobePhase; });
  reg('cam', camGroup, [0, 3.6, 0], 1);

  // ----- 气门 + 弹簧(8 个) -----
  const valveGroup = new THREE.Group();
  const vm = M(0xc9ced4, 0.3, 0.95);
  const springM = M(0x555b62, 0.5, 0.6);
  for (let j = 0; j < 4; j++) {
    for (const sgn of [1, -1]) {
      const vg = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.8, 12), vm);
      stem.position.y = 0.4;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.11, 0.05, 20), vm);
      disc.position.y = 0.02;
      vg.add(stem, disc);
      const spring = new THREE.Mesh(
        new THREE.TubeGeometry(new Helix(0.085, 0.42, 5), 64, 0.018, 8), springM);
      spring.position.y = 0.18;
      vg.add(spring);
      vg.userData.spring = spring;
      vg.userData.liftSign = sgn > 0 ? 1 : -1; // +1 进气(-x 侧? 用 CAM_X 判断)
      vg.position.set(sgn * VALVE_X, DECK + 0.48, ZPOS[j]);
      vg.userData.isIntake = sgn < 0; // -x 侧为进气
      vg.userData.fire = FIRE[j];
      valveGroup.add(vg);
    }
  }
  reg('valve', valveGroup, [0, 1.9, 0], 1);

  // ----- 火花塞 -----
  const plugGroup = new THREE.Group();
  const ceramic = M(0xe8e6df, 0.35, 0.1);
  const tipM = M(0xb8bec6, 0.3, 0.95);
  for (const z of ZPOS) {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.42, 14), ceramic);
    body.position.set(0, DECK + 0.55, z);
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.095, 0.12, 6), tipM);
    hex.position.set(0, DECK + 0.38, z);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.18, 10), tipM);
    tip.position.set(0, DECK + 0.29, z);
    plugGroup.add(body, hex, tip);
  }
  reg('plug', plugGroup, [0, 4.6, 0], 1);

  // ----- 曲轴(含飞轮/皮带轮/链轮) -----
  const crank = new THREE.Group();
  const cm = M(0xb8bec6, 0.32, 0.95);
  const shaftGeo = new THREE.CylinderGeometry(0.17, 0.17, HALFLEN * 2 + 1.2, 22);
  const mainShaft = new THREE.Mesh(shaftGeo, cm);
  mainShaft.rotation.x = Math.PI / 2; crank.add(mainShaft);
  for (let j = 0; j < 4; j++) {
    for (const dz of [-0.26, 0.26]) {
      const web = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.62, 0.24), cm);
      web.position.set(0, 0.08, ZPOS[j] + dz); crank.add(web);
    }
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 18), cm);
    pin.rotation.x = Math.PI / 2; pin.position.set(0, R, ZPOS[j]); crank.add(pin);
  }
  const fwM = M(0x55606b, 0.45, 0.85);
  const flywheel = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, 0.2, 40), fwM);
  flywheel.rotation.x = Math.PI / 2; flywheel.position.z = -HALFLEN - 0.55;
  const fwRing = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.07, 10, 48), M(0x39424c, 0.5, 0.8));
  fwRing.position.z = -HALFLEN - 0.55;
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.34, 20), cm);
  hub.rotation.x = Math.PI / 2; hub.position.z = -HALFLEN - 0.55;
  crank.add(flywheel, fwRing, hub);
  const pulley = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.16, 32), fwM);
  pulley.rotation.x = Math.PI / 2; pulley.position.z = HALFLEN + 0.78;
  const pulleyGroove = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.045, 8, 36), M(0x2b2f34, 0.5, 0.8));
  pulleyGroove.position.z = HALFLEN + 0.78;
  crank.add(pulley, pulleyGroove);
  const crankSP = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 26), cm);
  crankSP.rotation.x = Math.PI / 2; crankSP.position.z = HALFLEN + 0.5;
  crank.add(crankSP);
  reg('crank', crank, [0, -0.55, 0], 1);
  reg('flywheel', new THREE.Group(), [0, 0, 0], 0); // 占位(飞轮随曲轴)
  delete parts.flywheel;

  // ----- 活塞 ×4 / 连杆 ×4 -----
  const pistons = [], rods = [];
  const pistonMat = M(0xd8dce0, 0.35, 0.85);
  const ringMat = M(0x23262b, 0.4, 0.9);
  const rodMat = M(0x9aa2ab, 0.4, 0.9);
  for (let j = 0; j < 4; j++) {
    const pg = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(BORE - 0.015, BORE - 0.015, 0.52, 28), pistonMat);
    for (const ry of [0.2, 0.13]) {
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(BORE + 0.004, BORE + 0.004, 0.028, 28), ringMat);
      ring.position.y = ry; pg.add(ring);
    }
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.62, 14), ringMat);
    pin.rotation.x = Math.PI / 2; pin.position.y = -0.05;
    pg.add(body, pin);
    pg.userData.j = j;
    root.add(pg);
    pg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.part = 'piston'; } });
    pistons.push(pg);

    const rg = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.13, L - 0.34, 0.09), rodMat);
    beam.position.y = L / 2;
    const bigEnd = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.075, 12, 26), rodMat);
    bigEnd.rotation.y = Math.PI / 2;
    const smallEnd = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.055, 12, 22), rodMat);
    smallEnd.rotation.y = Math.PI / 2; smallEnd.position.y = L;
    rg.add(beam, bigEnd, smallEnd);
    rg.userData.j = j;
    root.add(rg);
    rg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.part = 'rod'; } });
    rods.push(rg);
  }

  // ----- 进气歧管 -----
  const intake = new THREE.Group();
  const imM = M(0x31435a, 0.55, 0.4);
  const plenum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 5.6, 22), imM);
  plenum.rotation.x = Math.PI / 2; plenum.position.set(-2.05, DECK + 0.42, 0);
  const capF = new THREE.Mesh(new THREE.SphereGeometry(0.42, 22, 16), imM);
  capF.position.set(-2.05, DECK + 0.42, 2.8);
  const capB = capF.clone(); capB.position.z = -2.8;
  const throttle = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.5, 18), M(0x23262b, 0.45, 0.7));
  throttle.rotation.x = Math.PI / 2; throttle.position.set(-2.05, DECK + 0.42, 3.15);
  intake.add(plenum, capF, capB, throttle);
  const runnerCurve = zj => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.05, DECK + 0.42, zj * 0.92),
    new THREE.Vector3(-1.5, DECK + 0.42, zj),
    new THREE.Vector3(-1.05, DECK + 0.5, zj),
    new THREE.Vector3(-0.82, DECK + 0.32, zj),
  ]);
  for (const z of ZPOS) {
    const tube = new THREE.Mesh(new THREE.TubeGeometry(runnerCurve(z), 32, 0.17, 14), imM);
    intake.add(tube);
  }
  reg('intake', intake, [-2.6, 0, 0], 1);

  // ----- 排气歧管 -----
  const exhaust = new THREE.Group();
  const exM = M(0x74503c, 0.6, 0.6);
  for (const z of ZPOS) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.85, DECK + 0.3, z),
      new THREE.Vector3(1.5, DECK + 0.15, z),
      new THREE.Vector3(1.95, DECK - 0.7, z * 0.9),
      new THREE.Vector3(2.1, DECK - 1.6, z * 0.7),
    ]);
    exhaust.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.15, 14), exM));
  }
  const collector = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 4.4, 18), exM);
  collector.rotation.x = Math.PI / 2; collector.position.set(2.1, DECK - 1.7, -0.5);
  exhaust.add(collector);
  reg('exhaust', exhaust, [2.6, 0, 0], 1);

  // ----- 油底壳 -----
  const pan = new THREE.Group();
  const pm = M(0x2b2f34, 0.55, 0.7);
  const panTop = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.3, HALFLEN * 2), pm);
  panTop.position.y = -0.9;
  const sump = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.55, 3.4), pm);
  sump.position.set(0, -1.3, -0.8);
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.1, 10), M(0x8f959c, 0.4, 0.9));
  drain.position.set(0.45, -1.6, -0.8);
  pan.add(panTop, sump, drain);
  reg('pan', pan, [0, -1.5, 0], 1);

  // ----- 正时链 -----
  const belt = new THREE.Group();
  const pts = [];
  const arc = (cx, cy, r, a0, a1, n) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  arc(0, 0, 0.52, -Math.PI / 2, Math.PI / 3, 10);          // 曲轴链轮右侧
  pts.push([0.415, 3.19]);
  arc(CAM_X, CAM_Y, 0.275, -Math.PI / 3, 2 * Math.PI / 3, 10); // 右凸轮链轮
  pts.push([-0.145, CAM_Y + 0.238]);
  arc(-CAM_X, CAM_Y, 0.275, Math.PI / 3, 7 * Math.PI / 6, 10); // 左凸轮链轮
  pts.push([-0.415, 3.19]);
  arc(0, 0, 0.52, 5 * Math.PI / 6, -Math.PI / 2, 12);      // 曲轴链轮左侧
  const curve = new THREE.CatmullRomCurve3(
    pts.map(([x, y]) => new THREE.Vector3(x, y, HALFLEN + 0.62)), true, 'catmullrom', 0.1);
  const chain = new THREE.Mesh(new THREE.TubeGeometry(curve, 220, 0.032, 8, true), M(0x1c1e22, 0.5, 0.7));
  belt.add(chain);
  reg('belt', belt, [0, 0, 2.6], 1);

  // 曲轴链轮归属曲轴组(随转)
  // (crankSP 已加入 crank)

  // ----- 标签锚点(挂进对应零件组,爆炸时跟随) -----
  const anchors = [];
  const addAnchor = (label, group, x, y, z) => {
    const o = new THREE.Object3D(); o.position.set(x, y, z);
    o.userData.label = label; group.add(o); anchors.push(o);
  };
  addAnchor('缸体', block, 0.8, DECK - 0.6, -3.0);
  addAnchor('缸盖', head, 0.75, DECK + 0.6, -3.2);
  addAnchor('活塞', pistons[0], 0.5, 0.2, ZPOS[0]);
  addAnchor('连杆', rods[3], 0.3, L * 0.5, ZPOS[3]);
  addAnchor('曲轴', crank, 0.2, -0.35, -2.2);
  addAnchor('凸轮轴', camGroup, -CAM_X, CAM_Y + 0.12, 1.4);
  addAnchor('进气歧管', intake, -2.05, DECK + 0.9, -1.2);
  addAnchor('排气歧管', exhaust, 2.1, DECK - 0.9, 1.2);
  addAnchor('油底壳', pan, 0.8, -1.3, 1.0);
  addAnchor('飞轮', crank, 0, 1.05, -HALFLEN - 0.55);
  addAnchor('正时链条', belt, 0.5, CAM_Y - 0.6, HALFLEN + 0.62);
  addAnchor('火花塞', plugGroup, 0, DECK + 0.62, 2.4);

  // ---------- 运动学更新 ----------
  const valveLifts = [];
  for (let j = 0; j < 4; j++) valveLifts.push([0, 0]);

  function update(theta, explodeT) {
    // 曲轴
    crank.rotation.z = theta;
    const t = explodeT;
    const off = (p) => [p.dir.x * p.dist * t, p.dir.y * p.dist * t, p.dir.z * p.dist * t];

    const [bx, by, bz] = off(parts.crank); // 曲轴爆炸偏移
    crank.position.set(bx, by, bz);

    // 凸轮轴 2:1
    camGroup.rotation.z = theta / 2;
    const [cx2, cy2, cz2] = off(parts.cam);
    camGroup.position.set(cx2, cy2, cz2);

    // 活塞 + 连杆
    for (let j = 0; j < 4; j++) {
      const th = theta + PHASE[j];
      const pinX = -R * Math.sin(th), pinY = R * Math.cos(th);
      const dy = Math.sqrt(Math.max(L * L - pinX * pinX, 0.0001));
      const wristY = pinY + dy;
      const po = parts.pistonOffset || [0, 1.35, 0];
      pistons[j].position.set(0 + (t > 0 ? 0 : 0), wristY + 1.35 * t, ZPOS[j]);
      rods[j].position.set(pinX, pinY + 0.75 * t, ZPOS[j] + by * 0); // 连杆随曲轴爆炸量略升
      rods[j].position.y = pinY + by + 0.75 * t;
      rods[j].rotation.z = Math.atan2(-(-pinX), dy) * -1; // 见下方推导:α = atan2(dx? )
      rods[j].rotation.z = Math.atan2(-(0 - pinX), dy);
    }

    // 气门升程
    let vi = 0;
    valveGroup.children.forEach((vg, idx) => {
      const j = Math.floor(idx / 2);
      const camAng = theta / 2 + FIRE[j] / 2 + (vg.userData.isIntake ? 0 : Math.PI / 2);
      const s = Math.sin(camAng);
      const lift = (vg.userData.isIntake ? Math.max(0, s) : Math.max(0, -s)) ** 3 * MAXLIFT;
      vg.position.y = DECK + 0.48 + 1.9 * t - lift;
      vg.userData.spring.scale.y = 1 - lift * 2.2;
      vg.userData.spring.position.y = 0.18 + lift * 0.5;
    });

    // 其余零件爆炸偏移
    for (const name of ['block', 'head', 'gasket', 'intake', 'exhaust', 'pan', 'belt']) {
      const p = parts[name]; if (!p) continue;
      const [ox, oy, oz] = off(p);
      p.group.position.set(ox, oy, oz);
    }
    // 火花塞(归在 plug 组)
    {
      const p = parts['plug'];
      const [ox, oy, oz] = off(p);
      p.group.position.set(ox, oy, oz);
    }
  }

  return { root, parts, mats, pistons, rods, crank, camGroup, valveGroup, anchors, update };
}
