# 给截图叠加百分比网格，用于校准热点坐标。
#
# 热点坐标是「视口百分比」，肉眼对着原图估读误差很大（尤其是竖直方向）。
# 叠一层 5%/10% 的网格后，直接读格线就能定位到 1% 以内。
#
# 用法：python scripts/grid-overlay.py <输入图> <输出图>

import sys
from PIL import Image, ImageDraw

SRC = sys.argv[1]
DST = sys.argv[2]

img = Image.open(SRC).convert('RGB')
w, h = img.size
draw = ImageDraw.Draw(img, 'RGBA')

# 5% 细线
for i in range(1, 20):
    if i % 2 == 0:
        continue
    x = round(w * i / 20)
    y = round(h * i / 20)
    draw.line([(x, 0), (x, h)], fill=(255, 80, 80, 90), width=1)
    draw.line([(0, y), (w, y)], fill=(255, 80, 80, 90), width=1)

# 10% 粗线 + 百分比标注
for i in range(1, 10):
    x = round(w * i / 10)
    y = round(h * i / 10)
    draw.line([(x, 0), (x, h)], fill=(255, 40, 40, 190), width=2)
    draw.line([(0, y), (w, y)], fill=(255, 40, 40, 190), width=2)

    # 顶部标注 X%，左侧标注 Y%
    draw.text((x + 4, 4), f'{i * 10}', fill=(255, 255, 0))
    draw.text((4, y + 4), f'{i * 10}', fill=(255, 255, 0))

# 中线（50%）用青色，视觉参考更醒目
draw.line([(w // 2, 0), (w // 2, h)], fill=(0, 220, 255, 200), width=2)
draw.line([(0, h // 2), (w, h // 2)], fill=(0, 220, 255, 200), width=2)

img.save(DST)
print(f'{DST}  {w}x{h}  已叠加 5%/10% 网格')
