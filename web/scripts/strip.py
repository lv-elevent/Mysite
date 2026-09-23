# 把 cdp-transition.mjs 连拍出来的过渡截图拼成故事板（每帧标上时间）。
#
# 用法：python scripts/strip.py <过渡截图目录> [每帧宽度px] [每行帧数] [输出文件]
# 目录里需要 frames.json（由 cdp-transition.mjs 写）。

import json
import os
import sys

from PIL import Image, ImageDraw

DIR = sys.argv[1] if len(sys.argv) > 1 else 'shots/transition'
CELL_W = int(sys.argv[2]) if len(sys.argv) > 2 else 420
COLS = int(sys.argv[3]) if len(sys.argv) > 3 else 0  # 0 = 单行
OUT = sys.argv[4] if len(sys.argv) > 4 else os.path.join(DIR, 'strip.png')

meta = json.load(open(os.path.join(DIR, 'frames.json'), encoding='utf-8'))
frames = meta['frames']
if COLS <= 0:
    COLS = len(frames)

LABEL_H = 30
GAP = 6

ims = []
for f in frames:
    im = Image.open(os.path.join(DIR, f['name'])).convert('RGB')
    h = round(im.height * CELL_W / im.width)
    # 优先用 rel（相对「场景首帧」，与 cdp-intro 打印的推镜窗口同一坐标系）；
    # cdp-transition.mjs 写的 frames.json 没有 rel，退回绝对 ms。
    ims.append((f.get('rel', f['ms']), im.resize((CELL_W, h), Image.LANCZOS)))

cell_h = max(im.height for _, im in ims)
rows = (len(ims) + COLS - 1) // COLS
W = COLS * CELL_W + (COLS + 1) * GAP
H = rows * (cell_h + LABEL_H) + (rows + 1) * GAP
canvas = Image.new('RGB', (W, H), (18, 20, 22))
draw = ImageDraw.Draw(canvas)

for i, (ms, im) in enumerate(ims):
    r, c = divmod(i, COLS)
    x = GAP + c * (CELL_W + GAP)
    y = GAP + r * (cell_h + LABEL_H + GAP)
    # 带符号：t0（场景首帧）之前的帧是负数，那些帧遮罩还在，一眼能看出来
    draw.text((x + 6, y + 7), f'#{i}   {ms:+d} ms', fill=(235, 235, 235))
    canvas.paste(im, (x, y + LABEL_H))

canvas.save(OUT)
print(f'{len(ims)} 帧 / {rows}×{COLS} → {OUT}  ({canvas.width}×{canvas.height})')
