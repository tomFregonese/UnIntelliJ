#!/usr/bin/env python3
"""
Builds UnIntelliJ's icon themes from IntelliJ New UI icons.

Inputs:
  icons/sources.json                        mapping VS Code icons -> IntelliJ icons
  <intellij-community>/platform/icons/src/expui   SVG sources (Apache 2.0)

Outputs (committed, so building the extension does not need Python):
  icons/files/*.svg                    file/folder icons, light and dark variants
  icons/file-icon-theme.json           VS Code file icon theme
  icons/product-icons.woff             monochrome icon font
  icons/product-icon-theme.json        VS Code product icon theme
  icons/symbol-colors.json             symbolIcon.* colors per theme type, used by the color themes

Usage:
  python -m venv .venv && .venv/bin/pip install picosvg fonttools
  git clone --depth 1 --filter=blob:none --sparse https://github.com/JetBrains/intellij-community.git /tmp/ij
  git -C /tmp/ij sparse-checkout set platform/icons/src/expui
  .venv/bin/python scripts/build-icons.py /tmp/ij
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path
from picosvg.svg import SVG

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "icons"
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

UNITS_PER_EM = 1000
SVG_SIZE = 16
FIRST_CODEPOINT = 0xE000
FONT_ID = "unintellij-product-icons"
# Fills lighter than this (relative luminance) are background tints, dropped from monochrome glyphs.
LIGHT_FILL_LUMINANCE = 0.7

FORBIDDEN = re.compile(r"<script|\son\w+\s*=|(?:xlink:)?href\s*=\s*[\"'](?!#)|<foreignObject", re.IGNORECASE)


def fail(message: str) -> None:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(1)


def source_svg(expui: Path, name: str, dark: bool) -> Path:
    path = expui / f"{name}{'_dark' if dark else ''}.svg"
    if not path.exists():
        if dark:
            # Some icons only exist in one variant.
            return source_svg(expui, name, False)
        fail(f"missing icon {path}")
    text = path.read_text(encoding="utf-8")
    if FORBIDDEN.search(text):
        fail(f"refusing {path}: contains scripts, event handlers or external references")
    return path


# --- File icon theme -----------------------------------------------------------------------------

def build_file_icons(expui: Path, spec: dict) -> None:
    out = ICONS / "files"
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    definitions: dict[str, dict] = {}
    dark: dict = {"fileExtensions": {}, "fileNames": {}, "languageIds": {}, "folderNames": {}, "folderNamesExpanded": {}}
    light: dict = {"fileExtensions": {}, "fileNames": {}, "languageIds": {}, "folderNames": {}, "folderNamesExpanded": {}}

    def define(icon_id: str, source: str) -> tuple[str, str]:
        for is_dark in (True, False):
            name = f"{icon_id}{'' if is_dark else '_light'}"
            if name in definitions:
                continue
            shutil.copyfile(source_svg(expui, source, is_dark), out / f"{name}.svg")
            definitions[name] = {"iconPath": f"./files/{name}.svg"}
        return icon_id, f"{icon_id}_light"

    file_d, file_l = define("file", spec["defaults"]["file"])
    folder_d, folder_l = define("folder", spec["defaults"]["folder"])
    root_d, root_l = define("rootFolder", spec["defaults"]["rootFolder"])

    for icon_id, icon in spec["icons"].items():
        d, l = define(icon_id, icon["source"])
        for ext in icon.get("extensions", []):
            dark["fileExtensions"][ext] = d
            light["fileExtensions"][ext] = l
        for name in icon.get("fileNames", []):
            dark["fileNames"][name] = d
            light["fileNames"][name] = l
        for lang in icon.get("languageIds", []):
            dark["languageIds"][lang] = d
            light["languageIds"][lang] = l

    for icon_id, folder in spec["folders"].items():
        d, l = define(f"folder_{icon_id}", folder["source"])
        for name in folder["names"]:
            # IntelliJ uses the same icon for open and closed folders.
            dark["folderNames"][name] = dark["folderNamesExpanded"][name] = d
            light["folderNames"][name] = light["folderNamesExpanded"][name] = l

    theme = {
        "hidesExplorerArrows": False,
        "iconDefinitions": definitions,
        "file": file_d,
        "folder": folder_d,
        "folderExpanded": folder_d,
        "rootFolder": root_d,
        "rootFolderExpanded": root_d,
        **dark,
        "light": {
            "file": file_l,
            "folder": folder_l,
            "folderExpanded": folder_l,
            "rootFolder": root_l,
            "rootFolderExpanded": root_l,
            **light,
        },
    }
    write_json(ICONS / "file-icon-theme.json", theme)
    print(f"file icons: {len(definitions)} SVGs")


# --- Colors --------------------------------------------------------------------------------------

def parse_color(value: str | None) -> tuple[float, float, float] | None:
    if not value or not value.startswith("#"):
        return None
    hex_ = value[1:]
    if len(hex_) == 3:
        hex_ = "".join(c * 2 for c in hex_)
    if len(hex_) != 6:
        return None
    return tuple(int(hex_[i:i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def luminance(rgb: tuple[float, float, float]) -> float:
    def channel(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def is_light(color: str | None) -> bool:
    rgb = parse_color(color)
    return rgb is not None and luminance(rgb) > LIGHT_FILL_LUMINANCE


def chroma(color: str) -> float:
    rgb = parse_color(color)
    return max(rgb) - min(rgb) if rgb else -1


def main_color(path: Path) -> str:
    """The icon's accent color: the most saturated one. Background tints have low chroma."""
    colors = []
    for el in ET.parse(path).iter():
        for attr in ("stroke", "fill"):
            value = el.get(attr)
            if parse_color(value) and len(value) == 7:
                colors.append(value.upper())
    if not colors:
        fail(f"no color found in {path}")
    return max(colors, key=chroma)  # max() keeps the first one on ties


def build_symbol_colors(expui: Path, spec: dict) -> None:
    colors = {
        variant: {key: main_color(source_svg(expui, src, variant == "dark")) for key, src in spec.items()}
        for variant in ("dark", "light")
    }
    write_json(ICONS / "symbol-colors.json", colors)
    print(f"symbol colors: {len(spec)} entries")


# --- Product icon font ---------------------------------------------------------------------------

def inherited(el: ET.Element, parents: dict, attr: str) -> str | None:
    while el is not None:
        if el.get(attr) is not None:
            return el.get(attr)
        style = el.get("style", "")
        match = re.search(rf"(?:^|;)\s*{attr}\s*:\s*([^;]+)", style)
        if match:
            return match.group(1).strip()
        el = parents.get(el)
    return None


def monochrome(path: Path) -> str:
    """Rewrites an icon as black-on-transparent: tints dropped, every visible color set to black."""
    tree = ET.parse(path)
    root = tree.getroot()
    parents = {child: parent for parent in root.iter() for child in parent}
    shapes = {f"{{{SVG_NS}}}{t}" for t in ("path", "rect", "circle", "ellipse", "line", "polyline", "polygon")}
    for el in list(root.iter()):
        if el.tag not in shapes:
            continue
        fill = inherited(el, parents, "fill")
        stroke = inherited(el, parents, "stroke")
        # SVG default fill is black when nothing is specified.
        keep_fill = fill is None or (fill != "none" and not is_light(fill))
        el.set("fill", "#000000" if keep_fill else "none")
        if stroke and stroke != "none":
            el.set("stroke", "#000000")
        if "style" in el.attrib:
            del el.attrib["style"]
    for el in root.iter():
        if el is not root and el.tag not in shapes:
            for attr in ("fill", "stroke"):
                if el.get(attr) not in (None, "none"):
                    el.set(attr, "#000000")
    return ET.tostring(root, encoding="unicode")


def glyph_from_svg(svg_text: str):
    pico = SVG.fromstring(svg_text).topicosvg()
    paths = []
    for shape in pico.shapes():
        p = pathops.Path()
        parse_path(shape.d, p.getPen())
        p.fillType = pathops.FillType.EVEN_ODD if shape.fill_rule == "evenodd" else pathops.FillType.WINDING
        paths.append(p)
    tt_pen = TTGlyphPen(None)
    scale = UNITS_PER_EM / SVG_SIZE
    # SVG is y-down from the top-left corner; fonts are y-up from the baseline.
    transform = TransformPen(Cu2QuPen(tt_pen, max_err=1.0, reverse_direction=True), (scale, 0, 0, -scale, 0, UNITS_PER_EM))
    if paths:
        result = pathops.Path()
        pathops.union(paths, result.getPen())
        result.draw(transform)
    return tt_pen.glyph()


def build_product_icons(expui: Path, spec: dict) -> None:
    sources = sorted(set(spec.values()))
    codepoints = {src: FIRST_CODEPOINT + i for i, src in enumerate(sources)}
    glyph_names = {src: "icon_" + re.sub(r"[^A-Za-z0-9]", "_", src) for src in sources}

    glyphs = {".notdef": TTGlyphPen(None).glyph()}
    for src in sources:
        # Product icons are colored by the theme, so the light variant's shapes are enough.
        glyphs[glyph_names[src]] = glyph_from_svg(monochrome(source_svg(expui, src, dark=False)))

    order = [".notdef"] + [glyph_names[s] for s in sources]
    fb = FontBuilder(UNITS_PER_EM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({codepoints[s]: glyph_names[s] for s in sources})
    fb.setupGlyf(glyphs)
    fb.setupHorizontalMetrics({name: (UNITS_PER_EM, 0) for name in order})
    fb.setupHorizontalHeader(ascent=UNITS_PER_EM, descent=0)
    fb.setupNameTable({"familyName": "UnIntelliJ Product Icons", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=UNITS_PER_EM, sTypoDescender=0, usWinAscent=UNITS_PER_EM, usWinDescent=0)
    fb.setupPost()
    fb.font.flavor = "woff"
    fb.font.save(str(ICONS / "product-icons.woff"))

    theme = {
        "fonts": [{
            "id": FONT_ID,
            "src": [{"path": "./product-icons.woff", "format": "woff"}],
            "weight": "normal",
            "style": "normal",
        }],
        "iconDefinitions": {
            icon_id: {"fontCharacter": f"\\{codepoints[src]:X}"} for icon_id, src in sorted(spec.items())
        },
    }
    write_json(ICONS / "product-icon-theme.json", theme)
    print(f"product icons: {len(spec)} icons, {len(sources)} glyphs")


def write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: build-icons.py <path to intellij-community checkout>")
    expui = Path(sys.argv[1]) / "platform" / "icons" / "src" / "expui"
    if not expui.is_dir():
        fail(f"{expui} not found (sparse-checkout platform/icons/src/expui)")
    spec = json.loads((ICONS / "sources.json").read_text(encoding="utf-8"))
    build_file_icons(expui, spec["fileIcons"])
    build_product_icons(expui, spec["productIcons"])
    build_symbol_colors(expui, spec["symbolColors"])


if __name__ == "__main__":
    main()
