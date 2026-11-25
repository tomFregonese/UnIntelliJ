import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildColorTheme, themeFileName } from '../../src/theme/build';
import { PALETTES } from '../../src/theme/palettes';

const root = join(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const HEX = /^#([0-9A-F]{6}|[0-9A-F]{8})$/;

function collectColors(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string' && value.startsWith('#')) {
    out.push(value);
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => collectColors(v, out));
  }
  return out;
}

describe.each(PALETTES.map((p) => [p.label, p] as const))('%s', (_label, palette) => {
  const theme = buildColorTheme(palette);

  it('is generated and up to date in themes/', () => {
    const onDisk = JSON.parse(readFileSync(join(root, 'themes', themeFileName(palette)), 'utf8'));
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(theme)));
  });

  it('is contributed in package.json with a matching id, label and type', () => {
    const contribution = pkg.contributes.themes.find((t: { label: string }) => t.label === palette.label);
    expect(contribution).toEqual({
      id: palette.label,
      label: palette.label,
      uiTheme: palette.type === 'dark' ? 'vs-dark' : 'vs',
      path: `./themes/${themeFileName(palette)}`,
    });
  });

  it('only uses uppercase #RRGGBB or #RRGGBBAA colors', () => {
    const invalid = collectColors(theme).filter((c) => !HEX.test(c));
    expect(invalid).toEqual([]);
  });

  it('gives every token rule a scope and a style', () => {
    for (const rule of theme.tokenColors) {
      expect(rule.scope.length).toBeGreaterThan(0);
      expect(Object.keys(rule.settings).length).toBeGreaterThan(0);
    }
  });

  it('separates the frame from the islands', () => {
    expect(theme.colors['titleBar.activeBackground']).toBe(palette.ui.frame);
    expect(theme.colors['editor.background']).toBe(palette.editor.background);
    expect(palette.ui.frame).not.toBe(palette.ui.island);
  });
});

describe('palettes', () => {
  it('have distinct labels and one dark and one light theme', () => {
    expect(new Set(PALETTES.map((p) => p.label)).size).toBe(PALETTES.length);
    expect(PALETTES.map((p) => p.type).sort()).toEqual(['dark', 'light']);
  });
});
