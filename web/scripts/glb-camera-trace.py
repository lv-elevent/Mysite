# 解出 me.glb 里烘焙的相机动画曲线，用于诊断「镜头不连贯」这类问题。
#
# 为什么需要它：相机状态在运行时拿不到（R3F 没把 store 挂到 canvas 上），
# 而无头 Chrome 的 Page.startScreencast 抓不到 WebGL 图层（只出黑帧），
# 循环 captureScreenshot 又太慢（单次 300ms+，而缓动时间常数只有 0.43s）。
# 直接读 glb 里的关键帧是唯一能看清轨迹的办法。
#
# glb 结构：12B 头（magic + version + length）+ JSON chunk + BIN chunk。
# 动画数据在 BIN 里，按 accessor → bufferView 解析。
#
# 用法：python scripts/glb-camera-trace.py <glb路径> [fps]

import json
import struct
import sys

PATH = sys.argv[1] if len(sys.argv) > 1 else 'public/models/me.glb'
FPS = float(sys.argv[2]) if len(sys.argv) > 2 else 24.0

COMPONENT = {5120: ('b', 1), 5121: ('B', 1), 5122: ('h', 2), 5123: ('H', 2), 5125: ('I', 4), 5126: ('f', 4)}
TYPE_N = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack('<4sII', data[:12])
    if magic != b'glTF':
        raise SystemExit('不是合法的 glb 文件')

    chunks = {}
    off = 12
    while off + 8 <= length:
        clen, ctype = struct.unpack('<II', data[off:off + 8])
        chunks[ctype] = data[off + 8:off + 8 + clen]
        off += 8 + clen
    # 0x4E4F534A = 'JSON'，0x004E4942 = 'BIN\0'
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
        out.append(vals[0] if n == 1 else vals)
    return out


def main():
    gltf, blob = load_glb(PATH)
    nodes = gltf.get('nodes', [])
    animations = gltf.get('animations', [])

    print(f'{PATH}: {len(nodes)} nodes / {len(animations)} animations')

    for ai, anim in enumerate(animations):
        print(f'\n=== animation[{ai}] {anim.get("name", "(无名)")} —— {len(anim["channels"])} channels ===')

        # 找出这个动画影响到的相机节点
        cam_nodes = set()
        for ch in anim['channels']:
            node = nodes[ch['target']['node']]
            if 'camera' in node:
                cam_nodes.add(ch['target']['node'])

        for ni in sorted(cam_nodes):
            node = nodes[ni]
            print(f'\n-- node[{ni}] {node.get("name")} (camera={node.get("camera")}) --')

            channels = [ch for ch in anim['channels'] if ch['target']['node'] == ni]
            for ch in channels:
                path = ch['target']['path']
                samp = anim['samplers'][ch['sampler']]
                times = read_accessor(gltf, blob, samp['input'])
                values = read_accessor(gltf, blob, samp['output'])
                interp = samp.get('interpolation', 'LINEAR')

                print(f'\n  {path}  关键帧 {len(times)} 个  插值={interp}')
                print(f'  时长 {times[0]:.3f}s → {times[-1]:.3f}s  ({(times[-1] - times[0]) * FPS:.0f} 帧 @{FPS:g}fps)')

                # 逐关键帧打印，并给出相邻帧的增量 —— 突变会体现为某一跳特别大
                prev = None
                for t, v in zip(times, values):
                    vv = v if isinstance(v, tuple) else (v,)
                    txt = '  '.join(f'{x:+.4f}' for x in vv)
                    if prev is None:
                        print(f'    t={t:6.3f}s  {txt}')
                    else:
                        d = max(abs(a - b) for a, b in zip(vv, prev))
                        flag = '   <== 大跳变' if d > 0.35 else ''
                        print(f'    t={t:6.3f}s  {txt}   Δmax={d:.4f}{flag}')
                    prev = vv

                # 采样密集度：如果关键帧很稀疏，中间靠插值，容易出现「滑过去」的观感
                if len(times) > 1:
                    gaps = [times[i + 1] - times[i] for i in range(len(times) - 1)]
                    print(f'    关键帧间隔：最小 {min(gaps):.3f}s / 最大 {max(gaps):.3f}s / 平均 {sum(gaps)/len(gaps):.3f}s')


if __name__ == '__main__':
    main()
