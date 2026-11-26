/** Islands+ patching of VS Code's workbench.html. Pure: no `vscode` import. */
import { createHash } from 'node:crypto';

/** Bump when the injected block or assets change, so existing patches are refreshed. */
export const PATCH_VERSION = 3;
export const ASSET_CSS = 'unintellij-islands.css';
export const ASSET_JS = 'unintellij-islands.js';
const START = '<!-- UNINTELLIJ-ISLANDS-START';
const END = '<!-- UNINTELLIJ-ISLANDS-END -->';

/** Status bar entry UnIntelliJ shows while it runs: without it, the injected script turns Islands+ off. */
export const ALIVE_ITEM = 'unintellij.alive';

/** Locations of workbench.html relative to VS Code's `appRoot`, newest layout first. */
export const WORKBENCH_CANDIDATES = [
  'out/vs/code/electron-browser/workbench/workbench.html',
  'out/vs/code/electron-sandbox/workbench/workbench.html',
  'out/vs/code/electron-sandbox/workbench/workbench.esm.html',
];

export function block(version = PATCH_VERSION): string {
  return [`${START} v${version} -->`, `<link rel="stylesheet" href="./${ASSET_CSS}">`, `<script src="./${ASSET_JS}"></script>`, END].join('\n');
}

/** Version of the Islands+ block in the HTML, or undefined when not patched. */
export function patchedVersion(html: string): number | undefined {
  const match = /<!-- UNINTELLIJ-ISLANDS-START v(\d+) -->/.exec(html);
  return match ? Number(match[1]) : undefined;
}

export function removeBlock(html: string): string {
  const start = html.indexOf(START);
  if (start < 0) {
    return html;
  }
  const end = html.indexOf(END, start);
  if (end < 0) {
    return html;
  }
  // injectBlock adds a newline on each side of the block: remove both so that removal is its exact inverse.
  const from = html[start - 1] === '\n' ? start - 1 : start;
  const to = end + END.length + (html[end + END.length] === '\n' ? 1 : 0);
  return html.slice(0, from) + html.slice(to);
}

/** Inserts (or replaces) the block right before `</html>`, after VS Code's own scripts. */
export function injectBlock(html: string, version = PATCH_VERSION): string {
  const clean = removeBlock(html);
  const close = clean.lastIndexOf('</html>');
  if (close < 0) {
    throw new Error('Unexpected workbench.html: no </html>');
  }
  return `${clean.slice(0, close)}\n${block(version)}\n${clean.slice(close)}`;
}

/** VS Code's checksum format: base64 SHA-256 without padding. */
export function checksum(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('base64').replace(/=+$/, '');
}

/** product.json with the checksum of `key` (path relative to `out/`) replaced, or unchanged when absent. */
export function updateChecksum(productJson: string, key: string, value: string): string {
  const product = JSON.parse(productJson) as { checksums?: Record<string, string> };
  if (!product.checksums || !(key in product.checksums)) {
    return productJson;
  }
  product.checksums[key] = value;
  const indent = /\n(\t| +)"/.exec(productJson)?.[1] ?? '\t';
  return `${JSON.stringify(product, null, indent)}${productJson.endsWith('\n') ? '\n' : ''}`;
}

/** Checksum key of a workbench file: its path relative to `out/`. */
export function checksumKey(relativePath: string): string {
  return relativePath.replace(/^out\//, '');
}

/**
 * Candidate `appRoot`s of the VS Code installation running `execPath` (used by the uninstall hook,
 * which runs in plain Node without the `vscode` API): Windows / Linux keep `resources/app` next to
 * the executable (Windows may add a version folder), macOS has it in `Contents/Resources/app`.
 */
export function appRootCandidates(execPath: string, join: (...parts: string[]) => string, dirname: (p: string) => string, subfolders: (dir: string) => string[]): string[] {
  const dir = dirname(execPath);
  return [join(dir, 'resources', 'app'), join(dir, '..', 'Resources', 'app'), ...subfolders(dir).map((sub) => join(dir, sub, 'resources', 'app'))];
}
