#!/usr/bin/env python3
"""
Swap a photo on the site, or rebuild the responsive renditions.

TO REPLACE A PHOTO
  1. Drop your new image into assets/img/ named after the one you are
     replacing, in any format:   spec-hair.jpg   (or .png / .jpeg / .webp)
  2. Run:   python rebuild-images.py

It crops your photo to the shape that slot already uses (square for the
specialty tiles, 16:9 for heroes, and so on), converts it to WebP, rebuilds
every smaller rendition, corrects the width/height/srcset in the HTML, and
moves the file you dropped in to _source-images/ for safekeeping.

Cropping is from the centre. If that cuts the subject badly, crop your photo
to roughly the right shape yourself before dropping it in.

    --check   report what would change, write nothing

Needs Pillow:  pip install Pillow
"""
import os
import re
import sys
import glob
import shutil

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is not installed.  Run:  pip install Pillow")

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(ROOT, 'assets', 'img')
# Your dropped-in originals are moved here, not deleted. Not referenced by
# the site — safe to exclude from a deploy, keep it for re-cropping later.
ORIGINALS = os.path.join(ROOT, '_source-images')
CHECK = '--check' in sys.argv

# Quality per role, matched to how large the image is displayed.
def quality_for(width):
    if width >= 1200: return 62      # full-bleed heroes
    if width >= 800:  return 68      # destination cards, feature images
    return 74                        # tiles, thumbnails


DROP_IN_EXTS = ('.jpg', '.jpeg', '.png', '.tif', '.tiff', '.bmp', '.avif')


HERO_MAX = 1600


def html_pages():
    return sorted(glob.glob(os.path.join(ROOT, '*.html')))


def hero_images():
    """Images that sit inside a .hero-slide. A hero is cropped by CSS to
    whatever shape the viewport happens to be, so its stored aspect ratio is
    not a spec — forcing a drop-in to match it just throws pixels away."""
    heroes = set()
    pat = re.compile(r'<div class="hero-slide[^"]*"[^>]*>\s*<img[^>]*src="/?assets/img/([^"]+)"', re.S)
    for page in html_pages():
        heroes |= set(pat.findall(open(page, encoding='utf-8').read()))
    return {os.path.splitext(h)[0] for h in heroes}


def wanted_by_markup():
    """Every /assets/img/*.webp the pages ask for, with the size each <img>
    declares. This is the source of truth when the old files have been deleted:
    it tells us the shape and width a slot expects."""
    want = {}
    for page in html_pages():
        s = open(page, encoding='utf-8').read()
        for tag in re.findall(r'<img\b[^>]*>', s):
            src = re.search(r'src="/?assets/img/([^"]+)"', tag)
            if not src:
                continue
            w = re.search(r'width="(\d+)"', tag)
            h = re.search(r'height="(\d+)"', tag)
            if w and h:
                want.setdefault(src.group(1), (int(w.group(1)), int(h.group(1))))
            for cand, cw in re.findall(r'/?assets/img/([^\s",]+\.webp)\s+(\d+)w', tag):
                want.setdefault(cand, (int(cw), None))
    return want


def crop_to(im, aspect):
    """Centre-crop to the given width/height ratio."""
    w, h = im.size
    if abs(w / h - aspect) < 0.01:
        return im
    if w / h > aspect:                      # too wide — trim the sides
        nw = int(round(h * aspect))
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = int(round(w / aspect))             # too tall — trim top and bottom
    y = (h - nh) // 2
    return im.crop((0, y, w, y + nh))


def adopt_drop_ins():
    """A file named <base>.<ext> next to an existing <base>.webp replaces it,
    keeping the shape and width the layout already expects."""
    done = []
    for f in sorted(os.listdir(IMG)):
        base, ext = os.path.splitext(f)
        if ext.lower() not in DROP_IN_EXTS or re.search(r'-\d+$', base):
            continue
        target = os.path.join(IMG, base + '.webp')
        want = wanted_by_markup()

        # Read the drop-in fully and let the file handle close. Pillow keeps the
        # file open lazily, and on Windows that blocks moving it afterwards.
        with Image.open(os.path.join(IMG, f)) as _im:
            src_size = _im.size
            if _im.mode in ('P', 'LA', 'RGBA'):
                rgba = _im.convert('RGBA')
                new = Image.new('RGB', rgba.size, (250, 247, 241))
                new.paste(rgba, mask=rgba.split()[-1])   # flatten onto cream
            else:
                new = _im.convert('RGB')

        if base in hero_images():
            # Keep the photographer's framing; CSS does the final crop.
            aspect, width = src_size[0] / src_size[1], min(src_size[0], HERO_MAX)
        elif os.path.exists(target):
            with Image.open(target) as old:
                aspect, width = old.size[0] / old.size[1], old.size[0]
        elif base + '.webp' in want and want[base + '.webp'][1]:
            # Old file already deleted — take the shape the markup expects.
            w, h = want[base + '.webp']
            aspect, width = w / h, w
        else:
            # Not a replacement — the logo, favicon and OG image live here as
            # PNG/JPG by design. Leave them alone and say nothing.
            continue
        out = crop_to(new, aspect)
        if out.width > width:
            out = out.resize((width, round(out.height * width / out.width)), Image.LANCZOS)
        if CHECK:
            done.append(f'{f}  -> would become {base}.webp at {out.width}x{out.height}')
            continue
        out.save(target, 'WEBP', quality=quality_for(out.width), method=6)
        # Keep the original rather than deleting it. If the crop or sizing comes
        # out wrong, the file you dropped in is still recoverable.
        os.makedirs(ORIGINALS, exist_ok=True)
        keep = os.path.join(ORIGINALS, f)
        n = 1
        while os.path.exists(keep):
            stem, e = os.path.splitext(f)
            keep = os.path.join(ORIGINALS, f'{stem}-{n}{e}')
            n += 1
        shutil.move(os.path.join(IMG, f), keep)
        done.append(f'{f} {src_size[0]}x{src_size[1]}  ->  {base}.webp '
                    f'{out.width}x{out.height}  {os.path.getsize(target)//1024}KB')
    return done


def variants():
    """full-size file -> [its smaller companions]"""
    out = {}
    for f in sorted(os.listdir(IMG)):
        m = re.match(r'^(.+?)-(\d+)\.webp$', f)
        if not m:
            continue
        parent = m.group(1) + '.webp'
        if os.path.exists(os.path.join(IMG, parent)):
            out.setdefault(parent, []).append((f, int(m.group(2))))
    return out


def rebuild():
    rebuilt, skipped = [], []

    # Recreate any rendition the pages reference that is no longer on disk —
    # otherwise a deleted companion stays a 404 for every phone visitor.
    missing = {}
    for name, (w, _h) in sorted(wanted_by_markup().items()):
        if os.path.exists(os.path.join(IMG, name)):
            continue
        m = re.match(r'^(.+?)-(\d+)\.webp$', name)
        if not m:
            continue
        parent = os.path.join(IMG, m.group(1) + '.webp')
        if not os.path.exists(parent):
            continue
        src = Image.open(parent).convert('RGB')
        width = min(int(m.group(2)), src.width)
        if CHECK:
            missing[name] = f'{name}  MISSING — would rebuild from {m.group(1)}.webp'
            continue
        out = src.resize((width, round(src.height * width / src.width)), Image.LANCZOS)
        out.save(os.path.join(IMG, name), 'WEBP', quality=quality_for(src.width), method=6)
        missing[name] = f'{name}  RECREATED  {out.width}x{out.height}  {os.path.getsize(os.path.join(IMG, name))//1024}KB'
    rebuilt.extend(missing.values())

    for parent, kids in sorted(variants().items()):
        src = Image.open(os.path.join(IMG, parent)).convert('RGB')
        for name, width in sorted(kids, key=lambda k: -k[1]):
            path = os.path.join(IMG, name)
            cur = Image.open(path)
            target_h = round(src.height * width / src.width)

            # Already correct, and drawn from an image of this aspect? leave it.
            same_size = cur.size == (width, target_h)
            newer_parent = os.path.getmtime(os.path.join(IMG, parent)) > os.path.getmtime(path)
            if same_size and not newer_parent:
                skipped.append(name)
                continue
            if width >= src.width:
                skipped.append(name + '  (parent is smaller — nothing to downscale)')
                continue
            if CHECK:
                rebuilt.append(f'{name}  STALE  (parent {parent} is newer or sizes differ)')
                continue

            before = os.path.getsize(path)
            out = src.resize((width, target_h), Image.LANCZOS)
            out.save(path, 'WEBP', quality=quality_for(src.width), method=6)
            rebuilt.append(f'{name}  {width}x{target_h}  {before//1024}KB -> {os.path.getsize(path)//1024}KB')
    return rebuilt, skipped


def fix_markup():
    """Point width/height and srcset descriptors at the real pixel sizes."""
    changes = []
    for page in sorted(glob.glob(os.path.join(ROOT, '*.html'))):
        s = original = open(page, encoding='utf-8').read()
        for tag in re.findall(r'<img\b[^>]*>', s):
            m = re.search(r'src="/?assets/img/([^"]+)"', tag)
            if not m:
                continue
            path = os.path.join(IMG, m.group(1))
            if not os.path.exists(path):
                continue
            w, h = Image.open(path).size
            new = tag
            new = re.sub(r'width="\d+"', f'width="{w}"', new)
            new = re.sub(r'height="\d+"', f'height="{h}"', new)
            # the descriptor on the full-size candidate must match its real width
            new = re.sub(r'(/?assets/img/' + re.escape(m.group(1)) + r')\s+\d+w',
                         r'\g<1> ' + str(w) + 'w', new)
            if new != tag:
                s = s.replace(tag, new)
                changes.append(f'{os.path.basename(page)}: {m.group(1)} -> {w}x{h}')
        if s != original and not CHECK:
            open(page, 'w', encoding='utf-8').write(s)
    return changes


if __name__ == '__main__':
    adopted = adopt_drop_ins()
    if adopted:
        print(f'{"WOULD REPLACE" if CHECK else "REPLACED"} ({len(adopted)}):')
        for a in adopted:
            print('   ', a)
        print()
    rebuilt, skipped = rebuild()
    markup = fix_markup()
    label = 'WOULD REBUILD' if CHECK else 'REBUILT'
    print(f'{label} ({len(rebuilt)}):')
    for r in rebuilt:
        print('   ', r)
    if not rebuilt:
        print('    nothing — every rendition matches its full-size parent')
    if markup:
        print(f'\n{"WOULD FIX" if CHECK else "MARKUP FIXED"} ({len(markup)}):')
        for c in markup:
            print('   ', c)
    print(f'\nup to date: {len(skipped)} rendition(s)')
