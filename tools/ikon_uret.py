"""Mizan uygulama ikonlarını üretir (yalnızca Python standart kütüphanesi).

Yeşil zemin üzerinde beyaz bir T: muhasebedeki T hesap.
Kullanım: python tools/ikon_uret.py
"""
import struct
import zlib
from pathlib import Path

KOK = Path(__file__).resolve().parent.parent
ZEMIN = (0x11, 0x69, 0x4E)
YAZI = (0xFF, 0xFF, 0xFF)


def png(yol, boyut, olcek=1.0):
    """olcek < 1 ise T küçülür (maskable ikonun güvenli alanı için)."""
    S = boyut
    c = S / 2

    def ic(x, y):
        # T'nin yatay ve dikey çubuğu; merkezden ölçeklenir
        rx = (x - c) / olcek + c
        ry = (y - c) / olcek + c
        yatay = 0.24 * S <= rx < 0.76 * S and 0.28 * S <= ry < 0.39 * S
        dikey = 0.445 * S <= rx < 0.555 * S and 0.28 * S <= ry < 0.76 * S
        return yatay or dikey

    satirlar = bytearray()
    for y in range(S):
        satirlar.append(0)
        for x in range(S):
            # 4 örnekle kenar yumuşatma
            n = sum(ic(x + dx, y + dy) for dx in (0.25, 0.75) for dy in (0.25, 0.75))
            t = n / 4
            satirlar.extend(round(ZEMIN[i] * (1 - t) + YAZI[i] * t) for i in range(3))

    def parca(tur, veri):
        return struct.pack('>I', len(veri)) + tur + veri + struct.pack('>I', zlib.crc32(tur + veri) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', S, S, 8, 2, 0, 0, 0)
    veri = b'\x89PNG\r\n\x1a\n' + parca(b'IHDR', ihdr) + parca(b'IDAT', zlib.compress(bytes(satirlar), 9)) + parca(b'IEND', b'')
    Path(yol).write_bytes(veri)
    print(yol, len(veri), 'bayt')


if __name__ == '__main__':
    d = KOK / 'icons'
    d.mkdir(exist_ok=True)
    png(d / 'icon-192.png', 192)
    png(d / 'icon-512.png', 512)
    png(d / 'icon-maskable-512.png', 512, olcek=0.8)
    png(d / 'apple-touch-icon.png', 180)
