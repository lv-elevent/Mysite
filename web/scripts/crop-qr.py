# 裁切微信个人二维码：只保留二维码本体，去掉头像 / 昵称 / 地区 / 底部提示文字。
#
# 为什么要裁：
#   1. 原图 730×1080 竖版，直接塞进面板的方形框里，码体只占一小块，扫不出来；
#   2. 原图带昵称「拾巷」和地区，放公网属于不必要的个人信息暴露。
#
# 定位方式：微信码是绿色（#07C160 系），头像和底部灰字都不是绿色，
#   所以按「绿色像素的包围盒」找码体最稳，不用手写坐标。
#
# 用法：python scripts/crop-qr.py <输入图> <输出图>

import sys
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else 'public/images/qr.jpg'
DST = sys.argv[2] if len(sys.argv) > 2 else 'public/images/qr.png'

# 码体四周留白，按码体边长的比例算 —— 二维码规范要求静默区至少 4 个模块宽，
# 这里留 6% 保证任何扫码器都能识别。
PAD_RATIO = 0.06


def is_qr_green(r: int, g: int, b: int) -> bool:
    """微信绿：绿通道高，且明显高于红蓝。灰度字（r≈g≈b）会被排除。"""
    return g > 110 and (g - r) > 40 and (g - b) > 40


def main() -> None:
    img = Image.open(SRC).convert('RGB')
    w, h = img.size
    px = img.load()

    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            if is_qr_green(r, g, b):
                if x < min_x:
                    min_x = x
                if x > max_x:
                    max_x = x
                if y < min_y:
                    min_y = y
                if y > max_y:
                    max_y = y

    if max_x < 0:
        raise SystemExit('没找到绿色像素，二维码定位失败')

    box_w = max_x - min_x + 1
    box_h = max_y - min_y + 1
    print(f'原图 {w}x{h} → 码体包围盒 ({min_x},{min_y})-({max_x},{max_y}) = {box_w}x{box_h}')

    # 码体取正方形边长（取宽高较大者），再补静默区
    side = max(box_w, box_h)
    pad = round(side * PAD_RATIO)
    side += pad * 2

    # 以码体中心为基准向外扩成正方形；越界部分用白色填充
    cx = (min_x + max_x) / 2
    cy = (min_y + max_y) / 2
    left = round(cx - side / 2)
    top = round(cy - side / 2)

    canvas = Image.new('RGB', (side, side), (255, 255, 255))
    crop = img.crop((left, top, left + side, top + side))
    canvas.paste(crop, (0, 0))

    # 输出 512 方图：面板里最大显示约 160px，2x 屏下 320px 足够，512 留足余量
    out = canvas.resize((512, 512), Image.LANCZOS)
    # 二维码只有绿 / 白两色，量化到 8 色调色板能把体积压掉一个数量级，
    # 且不像 JPEG 那样在码点边缘产生压缩伪影（伪影会降低扫码识别率）。
    out = out.convert('P', palette=Image.ADAPTIVE, colors=8)
    out.save(DST, optimize=True)
    print(f'输出 {DST} 512x512')


if __name__ == '__main__':
    main()
