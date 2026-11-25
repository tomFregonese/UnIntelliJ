import { describe, expect, it } from 'vitest';
import * as path from 'node:path';
import { appRootCandidates, block, checksum, checksumKey, injectBlock, patchedVersion, removeBlock, updateChecksum } from '../../src/islandsPlus/patchLogic';

const html = '<!DOCTYPE html>\n<html>\n<head></head>\n<body></body>\n<script src="./workbench.js" type="module"></script>\n</html>\n';

describe('workbench.html patching', () => {
  it('injects the block after VS Code scripts and reports its version', () => {
    const patched = injectBlock(html, 3);
    expect(patched.indexOf('workbench.js')).toBeLessThan(patched.indexOf('unintellij-islands.js'));
    expect(patched.trimEnd().endsWith('</html>')).toBe(true);
    expect(patchedVersion(patched)).toBe(3);
    expect(patchedVersion(html)).toBeUndefined();
  });

  it('is idempotent and replaces an older block', () => {
    const twice = injectBlock(injectBlock(html, 1), 2);
    expect(twice.match(/UNINTELLIJ-ISLANDS-START/g)).toHaveLength(1);
    expect(patchedVersion(twice)).toBe(2);
  });

  it('removes the block exactly', () => {
    expect(removeBlock(injectBlock(html))).toBe(html);
    expect(removeBlock(html)).toBe(html);
  });

  it('references assets next to workbench.html only (CSP self)', () => {
    expect(block()).toMatch(/href="\.\/unintellij-islands\.css"/);
    expect(block()).toMatch(/src="\.\/unintellij-islands\.js"/);
  });
});

describe('checksums', () => {
  it('uses unpadded base64 SHA-256 like VS Code', () => {
    expect(checksum('abc')).toBe('ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0');
  });

  it('updates only an existing checksum and keeps the indentation', () => {
    const product = '{\n\t"nameShort": "Code",\n\t"checksums": {\n\t\t"vs/code/electron-browser/workbench/workbench.html": "old"\n\t}\n}\n';
    const updated = updateChecksum(product, 'vs/code/electron-browser/workbench/workbench.html', 'new');
    expect(JSON.parse(updated).checksums['vs/code/electron-browser/workbench/workbench.html']).toBe('new');
    expect(updated).toContain('\n\t"nameShort"');
    expect(updated.endsWith('\n')).toBe(true);
    expect(updateChecksum(product, 'other', 'x')).toBe(product);
  });

  it('derives the checksum key from the path under out/', () => {
    expect(checksumKey('out/vs/code/electron-browser/workbench/workbench.html')).toBe('vs/code/electron-browser/workbench/workbench.html');
  });
});

describe('uninstall hook', () => {
  it('finds the app folder next to the executable on every OS', () => {
    const p = path.posix;
    const win = appRootCandidates('/vs/Code.exe', p.join, p.dirname, () => ['1a2b3c']);
    expect(win).toContain('/vs/resources/app');
    expect(win).toContain('/vs/1a2b3c/resources/app');
    const mac = appRootCandidates('/Applications/Code.app/Contents/MacOS/Code', p.join, p.dirname, () => []);
    expect(mac).toContain('/Applications/Code.app/Contents/Resources/app');
  });
});
