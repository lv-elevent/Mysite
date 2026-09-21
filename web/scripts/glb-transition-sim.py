# 模拟 Scene.tsx 的相机过渡：把 glb 烘焙曲线喂进实际公式，逐帧算出真实轨迹。
#
# 为什么需要它：
#   - 运行时相机状态拿不到（R3F 没把 store 挂到 canvas 上，只有 __reactFiber）
#   - 无头 Chrome 的 Page.startScreencast 抓不到 WebGL 图层（只出黑帧）
#   - 循环 captureScreenshot 单次 300ms+，而缓动时间常数只有 0.43s，抓不到开头那几百毫秒
# 所以直接把 glb 曲线按 Scene.tsx 的公式算一遍，是唯一能逐帧看清轨迹的办法。
#
# 复刻的公式（Scene.tsx useFrame）：
#   a = 1 - damping^dt
#   frameSmooth += (frameTarget - frameSmooth) * a
#   pullSmooth  += (pullTarget  - pullSmooth)  * a
#   camPos/camQuat = glb 相机在第 frame 帧的世界变换（act.time = frame/24）
#   focus = 由 s = frame/FRAMES_PER_NODE - 1 在 focus 锚点间插值
#   camera.position   = focus + (camPos - focus) * pullSmooth
#   camera.quaternion = camQuat            （鼠标视差归零时 paraQuat = 单位四元数）
#
# 输出四样东西，用来判断「硬切」：
#   1) 相机每步位移 / 每步转角
#   2) 画面里焦点（主体）的屏幕像素位移
#   3) 主体在画面里的高度像素数（硬切的特征是它在一两帧内突变）
#   4) 累计进度分布（看运动是不是全挤在开头）
#
# ⚠️ glb 的坑（踩过一次，别再踩）：
#   - 关键帧时间从 1/24 开始，不是 0；`act.time = frame/24` 落在 keyframe[f-1]
#   - scale 通道只有 2 个关键帧，translation/rotation 有 350 个 —— 每个通道必须
#     各用各的 times，共用一个 times 会静默串位，表现为「相机完全不动」
#
# 用法：python scripts/glb-transition-sim.py <glb> [目标帧] [起始帧] [damping] [fps] [pullback] [模式]
#   模式 frame（默认）= 现状：相机沿帧轴滑行（一阶缓动）
#   模式 shot         = 方案：在出发/目标机位之间直接插值（位置 lerp + 朝向 slerp）
#   模式 pairs        = 只打印各机位之间的行程表，用来定过渡时长

import json
import math
import struct
import sys

GLB = sys.argv[1] if len(sys.argv) > 1 else 'public/models/me.glb'
TARGET_FRAME = float(sys.argv[2]) if len(sys.argv) > 2 else 200.0
START_FRAME = float(sys.argv[3]) if len(sys.argv) > 3 else 0.0
DAMPING = float(sys.argv[4]) if len(sys.argv) > 4 else 0.1
FPS = float(sys.argv[5]) if len(sys.argv) > 5 else 60.0
PULLBACK = float(sys.argv[6]) if len(sys.argv) > 6 else 1.7
MODE = sys.argv[7] if len(sys.argv) > 7 else 'frame'

# 模型 group 的变换（Scene.tsx Man2 的 <group position scale>）
GROUP_T = (0.0, 0.4, -0.7)
GROUP_S = 2.25

FOCUS_POINTS = ['focus-1', 'focus-2', 'focus-3', 'focus-4', 'focus-5']
FRAMES_PER_NODE = 50
RESUME_FRAMES = len(FOCUS_POINTS) * FRAMES_PER_NODE
START_ANCHORS = ('focus-start', 'focus-0')
CLIP_FPS = 24.0  # Scene.tsx 的 FPS 常量

COMPONENT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
TYPE_N = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


# ---------- glb 读取 ----------

def load_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, _version, length = struct.unpack('<4sII', data[:12])
    if magic != b'glTF':
        raise SystemExit('不是合法的 glb 文件')
    chunks = {}
    off = 12
    while off + 8 <= length:
        clen, ctype = struct.unpack('<II', data[off:off + 8])
        chunks[ctype] = data[off + 8:off + 8 + clen]
        off += 8 + clen
    gltf = json.loads(chunks[0x4E4F534A].decode('utf-8'))
    return gltf, chunks.get(0x004E4942, b'')


def read_accessor(gltf, blob, index):
    acc = gltf['accessors'][index]
    bv = gltf['bufferViews'][acc['bufferView']]
    fmt, size = COMPONENT[acc['componentType']]
    n = TYPE_N[acc['type']]
    base = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = bv.get('byteStride') or size * n
    out = []
    for k in range(acc['count']):
        vals = struct.unpack_from('<' + fmt * n, blob, base + k * stride)
        out.append(vals[0] if n == 1 else tuple(vals))
    return out


# ---------- 四元数 / 矩阵 ----------

def q_slerp(a, b, t):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    dot = ax * bx + ay * by + az * bz + aw * bw
    if dot < 0.0:
        bx, by, bz, bw = -bx, -by, -bz, -bw
        dot = -dot
    if dot > 0.9995:
        x = ax + (bx - ax) * t
        y = ay + (by - ay) * t
        z = az + (bz - az) * t
        w = aw + (bw - aw) * t
        n = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
        return (x / n, y / n, z / n, w / n)
    theta = math.acos(max(-1.0, min(1.0, dot)))
    sin_t = math.sin(theta)
    s0 = math.sin((1 - t) * theta) / sin_t
    s1 = math.sin(t * theta) / sin_t
    return (ax * s0 + bx * s1, ay * s0 + by * s1, az * s0 + bz * s1, aw * s0 + bw * s1)


def q_to_mat(q):
    x, y, z, w = q
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    return [
        [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy)],
        [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx)],
        [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy)],
    ]


def trs_matrix(t, q, s):
    m = q_to_mat(q)
    return [
        [m[0][0] * s[0], m[0][1] * s[1], m[0][2] * s[2], t[0]],
        [m[1][0] * s[0], m[1][1] * s[1], m[1][2] * s[2], t[1]],
        [m[2][0] * s[0], m[2][1] * s[1], m[2][2] * s[2], t[2]],
        [0.0, 0.0, 0.0, 1.0],
    ]


def mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def mat_apply(m, p):
    x, y, z = p
    return (
        m[0][0] * x + m[0][1] * y + m[0][2] * z + m[0][3],
        m[1][0] * x + m[1][1] * y + m[1][2] * z + m[1][3],
        m[2][0] * x + m[2][1] * y + m[2][2] * z + m[2][3],
    )


def q_angle(a, b):
    dot = abs(sum(x * y for x, y in zip(a, b)))
    return math.degrees(2 * math.acos(max(-1.0, min(1.0, dot))))


def q_conj(q):
    return (-q[0], -q[1], -q[2], q[3])


def dist3(a, b):
    return math.sqrt(sum((a[k] - b[k]) ** 2 for k in range(3)))


# ---------- 动画通道 ----------

class Channel:
    """单个 TRS 通道。每个通道有自己的 times —— 共用会串位。"""

    def __init__(self, times, values, kind):
        self.times = times
        self.values = values
        self.kind = kind  # 'v3' | 'q'

    def sample(self, t):
        ts = self.times
        n = len(ts)
        if n == 1 or t <= ts[0]:
            return self.values[0]
        if t >= ts[-1]:
            return self.values[-1]
        lo, hi = 0, n - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if ts[mid] <= t:
                lo = mid
            else:
                hi = mid
        span = ts[hi] - ts[lo]
        f = 0.0 if span <= 0 else (t - ts[lo]) / span
        a, b = self.values[lo], self.values[hi]
        if self.kind == 'q':
            return q_slerp(a, b, f)
        return tuple(a[k] + (b[k] - a[k]) * f for k in range(len(a)))


class Tracks:
    """所有动画通道，按节点分组。"""

    def __init__(self, gltf, blob):
        self.by_node = {}
        for anim in gltf.get('animations', []):
            for ch in anim['channels']:
                ni = ch['target']['node']
                path = ch['target']['path']
                samp = anim['samplers'][ch['sampler']]
                times = read_accessor(gltf, blob, samp['input'])
                values = read_accessor(gltf, blob, samp['output'])
                kind = 'q' if path == 'rotation' else 'v3'
                self.by_node.setdefault(ni, {})[path] = Channel(times, values, kind)

    def trs(self, node_index, fallback, t):
        ch = self.by_node.get(node_index)
        if not ch:
            return fallback
        return (
            ch['translation'].sample(t) if 'translation' in ch else fallback[0],
            ch['rotation'].sample(t) if 'rotation' in ch else fallback[1],
            ch['scale'].sample(t) if 'scale' in ch else fallback[2],
        )


# ---------- 主流程 ----------

def main():
    gltf, blob = load_glb(GLB)
    nodes = gltf['nodes']
    tracks = Tracks(gltf, blob)

    cam_node = next(i for i, n in enumerate(nodes) if 'camera' in n)

    parent = {}
    for i, n in enumerate(nodes):
        for c in n.get('children', []):
            parent[c] = i

    def static_local(i):
        n = nodes[i]
        return (
            tuple(n.get('translation', (0.0, 0.0, 0.0))),
            tuple(n.get('rotation', (0.0, 0.0, 0.0, 1.0))),
            tuple(n.get('scale', (1.0, 1.0, 1.0))),
        )

    group_m = trs_matrix(GROUP_T, (0.0, 0.0, 0.0, 1.0), (GROUP_S, GROUP_S, GROUP_S))

    def world_matrix(i, t, extra=None):
        """自底向上乘父链，动画通道按 t 采样；最后套 Scene.tsx 的 <group>"""
        chain = []
        cur = i
        while cur is not None:
            chain.append(cur)
            cur = parent.get(cur)
        m = [[1.0 if r == c else 0.0 for c in range(4)] for r in range(4)]
        for idx in reversed(chain):
            trs = tracks.trs(idx, static_local(idx), t)
            m = mat_mul(m, trs_matrix(*trs))
        return mat_mul(group_m, m)

    name_to_node = {n.get('name'): i for i, n in enumerate(nodes)}
    focus_idx = [name_to_node[n] for n in FOCUS_POINTS]
    start_idx = next((name_to_node[n] for n in START_ANCHORS if n in name_to_node), None)

    def focus_world(frame):
        """复刻 Scene.tsx：s = frame/FRAMES_PER_NODE - 1，在锚点间插值"""
        t = frame / CLIP_FPS
        M = len(FOCUS_POINTS)
        s = max(-1.0, min(float(M - 1), frame / FRAMES_PER_NODE - 1.0))
        if s < 0 and start_idx is not None:
            a = mat_apply(world_matrix(start_idx, t), (0, 0, 0))
            b = mat_apply(world_matrix(focus_idx[0], t), (0, 0, 0))
            w = max(0.0, min(1.0, s + 1.0))
            return tuple(a[k] + (b[k] - a[k]) * w for k in range(3))
        sc = max(0.0, min(float(M - 1), s))
        iA = int(math.floor(sc))
        iB = min(iA + 1, M - 1)
        f = sc - iA
        a = mat_apply(world_matrix(focus_idx[iA], t), (0, 0, 0))
        b = mat_apply(world_matrix(focus_idx[iB], t), (0, 0, 0))
        return tuple(a[k] + (b[k] - a[k]) * f for k in range(3))

    # 模型包围盒（glb 局部空间，取所有 mesh POSITION 的 min/max 并集）
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for mesh in gltf.get('meshes', []):
        for prim in mesh['primitives']:
            acc = gltf['accessors'][prim['attributes']['POSITION']]
            if 'min' not in acc:
                continue
            for k in range(3):
                lo[k] = min(lo[k], acc['min'][k])
                hi[k] = max(hi[k], acc['max'][k])

    # 相机 fov（glb 里是弧度）
    cam_def = gltf['cameras'][nodes[cam_node]['camera']]
    fov_y = cam_def['perspective']['yfov']
    aspect = 1440.0 / 900.0
    tan_half = math.tan(fov_y / 2)

    def project(p_world, cam_pos, cam_quat):
        """世界点 → 视口像素（1440×900）；three.js 相机看 -Z"""
        rel = tuple(p_world[k] - cam_pos[k] for k in range(3))
        inv = q_to_mat(q_conj(cam_quat))
        x = inv[0][0] * rel[0] + inv[0][1] * rel[1] + inv[0][2] * rel[2]
        y = inv[1][0] * rel[0] + inv[1][1] * rel[1] + inv[1][2] * rel[2]
        z = inv[2][0] * rel[0] + inv[2][1] * rel[1] + inv[2][2] * rel[2]
        if z >= -1e-4:
            return None
        ndc_x = (x / (-z)) / (tan_half * aspect)
        ndc_y = (y / (-z)) / tan_half
        return ((ndc_x + 1) * 0.5 * 1440.0, (1 - ndc_y) * 0.5 * 900.0)

    def subject_box(cam_pos, cam_quat, t):
        """模型 8 个包围盒角点投影 → 屏幕高度像素（主体在画面里多大）"""
        pts = []
        for i in range(8):
            local = (hi[0] if i & 1 else lo[0], hi[1] if i & 2 else lo[1], hi[2] if i & 4 else lo[2])
            # 包围盒在 glb 局部空间 → 经 man 的动画变换 → group
            w = mat_apply(world_matrix(25, t) if 25 in name_to_node.values() else group_m, local)
            p = project(w, cam_pos, cam_quat)
            if p:
                pts.append(p)
        if len(pts) < 2:
            return 0.0
        ys = [p[1] for p in pts]
        return max(ys) - min(ys)

    dt = 1.0 / FPS
    a = 1.0 - math.pow(DAMPING, dt)

    def cam_pose(frame):
        """glb 相机在第 frame 帧的世界姿态（= Scene.tsx 里 mixer.update(0) + decompose 的结果）"""
        t = frame / CLIP_FPS
        wm = world_matrix(cam_node, t)
        _tt, q, _ss = tracks.trs(cam_node, static_local(cam_node), t)
        return ((wm[0][3], wm[1][3], wm[2][3]), q)

    SHOTS = [cam_pose(f) for f in range(RESUME_FRAMES + 1)]

    def sample_shot(f):
        x = max(0.0, min(float(len(SHOTS) - 1), f))
        i = int(math.floor(x))
        j = min(i + 1, len(SHOTS) - 1)
        u = x - i
        pa, qa = SHOTS[i]
        pb, qb = SHOTS[j]
        return (tuple(pa[k] + (pb[k] - pa[k]) * u for k in range(3)), q_slerp(qa, qb, u))

    def smootherstep(x):
        """与 Scene.tsx 的 easeShot 保持一致：五次平滑 + t^0.7 前倾"""
        x = max(0.0, min(1.0, x))
        u = x ** 0.7
        return u * u * u * (u * (u * 6 - 15) + 10)

    if MODE == 'pairs':
        print('各机位之间的行程（位置距离 + 角度×0.06 折算），用来定过渡时长：')
        print(f'{"从":>5} {"到":>5} {"位移":>7} {"转角":>8} {"折算行程":>9}')
        for a_f in (0, 50, 100, 150, 200, 250):
            for b_f in (50, 100, 150, 200, 250):
                if b_f <= a_f:
                    continue
                pd = dist3(SHOTS[a_f][0], SHOTS[b_f][0])
                ad = q_angle(SHOTS[a_f][1], SHOTS[b_f][1])
                print(f'{a_f:5d} {b_f:5d} {pd:7.2f} {ad:7.1f}° {pd + ad*0.06:9.2f}')
        return

    print(f'{GLB}')
    print(f'相机节点 node[{cam_node}] / 模型局部包围盒 y {lo[1]:.3f}–{hi[1]:.3f}  z {lo[2]:.3f}–{hi[2]:.3f}')

    steps = []
    if MODE == 'shot':
        # 方案 B：在「出发机位」和「目标机位」之间直接插值（位置 lerp + 朝向 slerp），
        # 不再沿帧轴滑过中间所有机位。时长按行程定，缓动用 smootherstep（两端零速度）。
        ia, ib = int(START_FRAME), int(TARGET_FRAME)
        pd = dist3(SHOTS[ia][0], SHOTS[ib][0])
        ad = q_angle(SHOTS[ia][1], SHOTS[ib][1])
        travel = pd + ad * 0.06
        dur = max(0.55, min(1.9, 0.55 + travel * 0.075))
        print(f'【机位插值】{ia} → {ib}：位移 {pd:.2f} / 转角 {ad:.1f}° / 折算行程 {travel:.2f} → 时长 {dur:.2f}s')
        print(f'easeShot（五次平滑 + t^0.7 前倾）/ {FPS:g}fps / pullback {PULLBACK:g} → 1.0')
        print()
        k = 0.0
        pa, qa = SHOTS[ia]
        pb, qb = SHOTS[ib]
        for i in range(int(FPS * (dur + 0.8)) + 1):
            kk = smootherstep(k)
            frame = START_FRAME + (TARGET_FRAME - START_FRAME) * kk
            # 机位姿态：直接在两台机位之间插值（位置 lerp + 朝向 slerp）
            cpos = tuple(pa[j] + (pb[j] - pa[j]) * kk for j in range(3))
            cq = q_slerp(qa, qb, kk)
            pull = PULLBACK + (1.0 - PULLBACK) * kk
            focus = focus_world(frame)
            pos = tuple(focus[j] + (cpos[j] - focus[j]) * pull for j in range(3))
            steps.append({
                't': i * dt, 'frame': frame, 'pull': pull,
                'pos': pos, 'quat': cq, 'focus': focus,
                'dist': dist3(pos, focus),
                'fp': project(focus, pos, cq),
                'box': subject_box(pos, cq, frame / CLIP_FPS),
            })
            k = min(1.0, k + dt / dur)
    else:
        print(f'【帧轴滑行】目标帧 {TARGET_FRAME:g} ← 起始帧 {START_FRAME:g} / damping {DAMPING:g} / '
              f'{FPS:g}fps / pullback {PULLBACK:g}')
        print(f'缓动系数 a = {a:.5f}/帧 → 时间常数 {abs(1.0/math.log(1-a))/FPS:.3f}s（每步走 {a*100:.2f}%）')
        print()
        frame = START_FRAME
        pull = PULLBACK
        for i in range(int(FPS * 2.2) + 1):
            t = frame / CLIP_FPS
            wm = world_matrix(cam_node, t)
            cam_local_pos = (wm[0][3], wm[1][3], wm[2][3])
            _tt, cam_q, _ss = tracks.trs(cam_node, static_local(cam_node), t)
            focus = focus_world(frame)
            pos = tuple(focus[k] + (cam_local_pos[k] - focus[k]) * pull for k in range(3))
            steps.append({
                't': i * dt, 'frame': frame, 'pull': pull,
                'pos': pos, 'quat': cam_q, 'focus': focus,
                'dist': dist3(pos, focus),
                'fp': project(focus, pos, cam_q),
                'box': subject_box(pos, cam_q, t),
            })
            frame += (TARGET_FRAME - frame) * a
            pull += (1.0 - pull) * a

    hdr = (f'{"ms":>5} {"帧":>7} {"pull":>5} {"离焦点":>7} {"位移/步":>8} {"转角/步":>7} '
           f'{"焦点px/步":>9} {"主体高px":>9} {"画面占比":>7}')
    print(hdr)
    print('-' * len(hdr))

    for i, st in enumerate(steps):
        pv = steps[i - 1] if i > 0 else None
        dpos = dang = dpx = 0.0
        if pv:
            dpos = dist3(st['pos'], pv['pos'])
            dang = q_angle(st['quat'], pv['quat'])
            if st['fp'] and pv['fp']:
                dpx = math.hypot(st['fp'][0] - pv['fp'][0], st['fp'][1] - pv['fp'][1])
        ratio = st['box'] / 900.0 * 100
        mark = ''
        if pv and st['box'] > 0 and pv['box'] > 0:
            grow = st['box'] / pv['box']
            if grow > 1.35:
                mark = f'  <== 主体一步放大 {grow:.2f}×'
        print(f'{st["t"]*1000:5.0f} {st["frame"]:7.1f} {st["pull"]:5.2f} {st["dist"]:7.2f} '
              f'{dpos:8.4f} {dang:7.3f} {dpx:9.1f} {st["box"]:9.1f} {ratio:6.1f}%{mark}')

    total_move = sum(dist3(steps[i]['pos'], steps[i - 1]['pos']) for i in range(1, len(steps)))
    total_ang = sum(q_angle(steps[i]['quat'], steps[i - 1]['quat']) for i in range(1, len(steps)))
    print()
    print(f'全程 {len(steps)-1} 步：总位移 {total_move:.2f} 世界单位 / 总转角 {total_ang:.1f}°')
    print('累计进度（看运动是不是全挤在开头）：')
    for frac in (0.05, 0.1, 0.2, 0.3, 0.5, 0.75):
        k = int((len(steps) - 1) * frac)
        moved = sum(dist3(steps[i]['pos'], steps[i - 1]['pos']) for i in range(1, k + 1))
        ang = sum(q_angle(steps[i]['quat'], steps[i - 1]['quat']) for i in range(1, k + 1))
        print(f'  前 {steps[k]["t"]*1000:5.0f}ms：位移 {moved:6.2f}（{moved/max(total_move,1e-9)*100:5.1f}%）'
              f' / 转角 {ang:5.1f}°（{ang/max(total_ang,1e-9)*100:5.1f}%）')


if __name__ == '__main__':
    main()
