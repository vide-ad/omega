#!/usr/bin/env python3
"""Generate the PWA icons with nothing but zlib + struct.

A solid dark square with a lighter rounded square in the middle and a small
accent bar — enough to be recognisable on an iPhone home screen. Run from
anywhere: `python3 apps/web/scripts/gen-icons.py`.
"""
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'icons')

BG = (0x12, 0x14, 0x18)        # app background
MID = (0x2A, 0x2F, 0x3A)       # lighter inner square
ACCENT = (0x4F, 0xD1, 0x8B)    # green accent (matches --accent in styles.css)


def png(width, height, rows):
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def icon(size, maskable_padding):
    rows = []
    pad = int(size * maskable_padding)
    inner0, inner1 = pad, size - pad
    r = int((inner1 - inner0) * 0.18)          # corner radius of the inner square
    bar_y0, bar_y1 = int(size * 0.66), int(size * 0.72)
    bar_x0, bar_x1 = int(size * 0.32), int(size * 0.68)
    for y in range(size):
        row = []
        for x in range(size):
            col = BG
            if inner0 <= x < inner1 and inner0 <= y < inner1:
                # rounded corners
                cx = min(max(x, inner0 + r), inner1 - 1 - r)
                cy = min(max(y, inner0 + r), inner1 - 1 - r)
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    col = MID
            if bar_x0 <= x < bar_x1 and bar_y0 <= y < bar_y1:
                col = ACCENT
            row.extend(col)
        rows.append(row)
    return png(size, size, rows)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, size, padding in (
        ('icon-192.png', 192, 0.16),
        ('icon-512.png', 512, 0.16),
        ('apple-touch-icon.png', 180, 0.16),
    ):
        with open(os.path.join(OUT, name), 'wb') as f:
            f.write(icon(size, padding))
        print('wrote', name)


if __name__ == '__main__':
    main()
