"""Generate placeholder PWA icons as minimal PNGs using pure Python (no Pillow needed)."""
import struct
import zlib
import os

def create_png(width, height, r, g, b, outpath):
    """Create a minimal solid-color PNG with a white circle in the center."""
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xffffffff)
        return struct.pack('>I', len(data)) + c + crc

    # IHDR
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    # IDAT: solid fill + white circle
    raw = []
    cx, cy = width // 2, height // 2
    radius = min(width, height) // 3
    for y in range(height):
        raw.append(0)  # filter none
        for x in range(width):
            dx, dy = x - cx, y - cy
            dist = (dx * dx + dy * dy) ** 0.5
            if dist <= radius:
                raw.extend([255, 255, 255])  # white circle
            elif dist <= radius + 3:
                # anti-aliased border
                raw.extend([r, g, b])
            else:
                raw.extend([r, g, b])  # background
    compressed = zlib.compress(bytearray(raw))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', compressed) + chunk(b'IEND', b'')
    with open(outpath, 'wb') as f:
        f.write(png)
    print(f'  Created {outpath} ({width}x{height})')

base = os.path.dirname(os.path.abspath(__file__))
# Green theme color #059669
r, g, b = 5, 150, 105

icons = [
    ('pwa-192x192.png', 192, 192),
    ('pwa-512x512.png', 512, 512),
    ('pwa-180x180.png', 180, 180),
    ('pwa-70x70.png', 70, 70),
    ('pwa-150x150.png', 150, 150),
    ('pwa-310x310.png', 310, 310),
    ('pwa-310x150.png', 310, 150),
    ('shortcut-courses.png', 96, 96),
    ('shortcut-assignments.png', 96, 96),
    ('shortcut-exams.png', 96, 96),
    ('shortcut-analytics.png', 96, 96),
]

for name, w, h in icons:
    create_png(w, h, r, g, b, os.path.join(base, name))

print(f'\nGenerated {len(icons)} PWA icons in {base}')