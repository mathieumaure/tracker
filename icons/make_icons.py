#!/usr/bin/env python3
"""Génère les icônes PNG de la PWA sans dépendance externe (zlib stdlib)."""
import struct, zlib, math

C1 = (0xb5, 0x17, 0x9e)  # haut-gauche
C2 = (0x72, 0x09, 0xb7)  # bas-droite
WHITE = (255, 255, 255)
PINK = (0xf7, 0xc5, 0xe8)

# cercles "fleur" en coordonnées 512
CIRCLES = [
    (256, 180, 46, WHITE),
    (180, 256, 46, WHITE),
    (332, 256, 46, WHITE),
    (218, 330, 46, WHITE),
    (294, 330, 46, WHITE),
    (256, 262, 34, PINK),
]

def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def blend(dst, src, alpha):
    return tuple(round(src[i] * alpha + dst[i] * (1 - alpha)) for i in range(3))

def render(size, rounded=True):
    s = 512
    scale = s / size
    radius = 112  # rayon des coins en repère 512
    px = bytearray()
    for y in range(size):
        row = bytearray()
        row.append(0)  # filtre PNG = 0
        for x in range(size):
            X, Y = x * scale, y * scale
            t = (X + Y) / (2 * s)
            color = lerp(C1, C2, t)
            a = 255
            if rounded:
                # alpha 0 hors du rectangle arrondi
                rx = min(X, s - X)
                ry = min(Y, s - Y)
                if rx < radius and ry < radius:
                    dx, dy = radius - rx, radius - ry
                    if math.hypot(dx, dy) > radius:
                        a = 0
            # cercles (anticrénelage simple par sur-échantillonnage léger)
            for cx, cy, cr, ccol in CIRCLES:
                d = math.hypot(X - cx, Y - cy)
                if d <= cr - 1:
                    color = ccol
                elif d <= cr + 1:
                    color = blend(color, ccol, (cr + 1 - d) / 2)
            row += bytes((color[0], color[1], color[2], a))
        px += row
    return png(size, size, bytes(px))

def png(w, h, raw):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)  # RGBA
    idat = zlib.compress(raw, 9)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")

def write(name, data):
    with open(name, "wb") as f:
        f.write(data)
    print("écrit", name, len(data), "octets")

write("icon-192.png", render(192, rounded=True))
write("icon-512.png", render(512, rounded=True))
write("icon-maskable.png", render(512, rounded=False))
