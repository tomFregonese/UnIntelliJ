import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const icons = join(root, 'icons');
const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

const pkg = readJson(join(root, 'package.json'));
const sources = readJson(join(icons, 'sources.json'));
const fileTheme = readJson(join(icons, 'file-icon-theme.json'));
const productTheme = readJson(join(icons, 'product-icon-theme.json'));
const symbolColors = readJson(join(icons, 'symbol-colors.json'));

const ASSOCIATIONS = ['fileExtensions', 'fileNames', 'languageIds', 'folderNames', 'folderNamesExpanded'] as const;
const DEFAULTS = ['file', 'folder', 'folderExpanded', 'rootFolder', 'rootFolderExpanded'] as const;

describe('file icon theme', () => {
  it('is contributed in package.json', () => {
    expect(pkg.contributes.iconThemes).toEqual([
      { id: 'unintellij-file-icons', label: 'UnIntelliJ (New UI)', path: './icons/file-icon-theme.json' },
    ]);
  });

  it('points every definition to an existing SVG', () => {
    for (const { iconPath } of Object.values<{ iconPath: string }>(fileTheme.iconDefinitions)) {
      expect(existsSync(join(icons, iconPath)), iconPath).toBe(true);
    }
  });

  it('only references defined icons, for dark and light themes', () => {
    for (const section of [fileTheme, fileTheme.light]) {
      for (const key of DEFAULTS) {
        expect(fileTheme.iconDefinitions).toHaveProperty(section[key]);
      }
      for (const key of ASSOCIATIONS) {
        for (const id of Object.values<string>(section[key])) {
          expect(fileTheme.iconDefinitions).toHaveProperty(id);
        }
      }
    }
  });

  it('uses a light variant for every dark association', () => {
    for (const key of ASSOCIATIONS) {
      expect(Object.keys(fileTheme.light[key]).sort()).toEqual(Object.keys(fileTheme[key]).sort());
      for (const [name, id] of Object.entries<string>(fileTheme[key])) {
        expect(fileTheme.light[key][name]).toBe(`${id}_light`);
      }
    }
  });

  it('covers every extension and folder declared in sources.json', () => {
    for (const icon of Object.values<{ extensions?: string[] }>(sources.fileIcons.icons)) {
      for (const ext of icon.extensions ?? []) {
        expect(fileTheme.fileExtensions).toHaveProperty([ext]);
      }
    }
    for (const folder of Object.values<{ names: string[] }>(sources.fileIcons.folders)) {
      for (const name of folder.names) {
        expect(fileTheme.folderNames).toHaveProperty([name]);
      }
    }
  });

  it('ships only SVGs without scripts or external references', () => {
    for (const { iconPath } of Object.values<{ iconPath: string }>(fileTheme.iconDefinitions)) {
      const svg = readFileSync(join(icons, iconPath), 'utf8');
      expect(svg).not.toMatch(/<script|\son\w+\s*=|href\s*=\s*["'](?!#)|<foreignObject/i);
    }
  });
});

describe('product icon theme', () => {
  it('is contributed in package.json', () => {
    expect(pkg.contributes.productIconThemes).toEqual([
      { id: 'unintellij-product-icons', label: 'UnIntelliJ (New UI)', path: './icons/product-icon-theme.json' },
    ]);
  });

  it('uses the bundled font', () => {
    expect(productTheme.fonts).toHaveLength(1);
    expect(existsSync(join(icons, productTheme.fonts[0].src[0].path))).toBe(true);
  });

  it('maps every icon of sources.json to a private-use character', () => {
    expect(Object.keys(productTheme.iconDefinitions).sort()).toEqual(Object.keys(sources.productIcons).sort());
    for (const { fontCharacter } of Object.values<{ fontCharacter: string }>(productTheme.iconDefinitions)) {
      expect(fontCharacter).toMatch(/^\\E[0-9A-F]{3}$/);
    }
  });

  it('shares a glyph between icons that use the same source', () => {
    const bySource = new Map<string, string>();
    for (const [id, source] of Object.entries<string>(sources.productIcons)) {
      const char = productTheme.iconDefinitions[id].fontCharacter;
      expect(bySource.get(source) ?? char).toBe(char);
      bySource.set(source, char);
    }
  });
});

describe('symbol colors', () => {
  it('defines the same keys for dark and light themes', () => {
    expect(Object.keys(symbolColors.dark).sort()).toEqual(Object.keys(sources.symbolColors).sort());
    expect(Object.keys(symbolColors.light).sort()).toEqual(Object.keys(sources.symbolColors).sort());
  });

  it('are included in the generated color themes', () => {
    const dark = readJson(join(root, 'themes', 'islands-dark-color-theme.json'));
    const light = readJson(join(root, 'themes', 'islands-light-color-theme.json'));
    expect(dark.colors).toMatchObject(symbolColors.dark);
    expect(light.colors).toMatchObject(symbolColors.light);
  });
});
