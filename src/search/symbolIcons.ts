import * as vscode from 'vscode';

/** Icon file (in icons/symbols/) for each symbol kind, from IntelliJ's New UI node icons. */
const KIND_ICONS: Partial<Record<vscode.SymbolKind, string>> = {
  [vscode.SymbolKind.Class]: 'class',
  [vscode.SymbolKind.Interface]: 'interface',
  [vscode.SymbolKind.Enum]: 'enum',
  [vscode.SymbolKind.EnumMember]: 'enumMember',
  [vscode.SymbolKind.Struct]: 'struct',
  [vscode.SymbolKind.Method]: 'method',
  [vscode.SymbolKind.Constructor]: 'constructor',
  [vscode.SymbolKind.Function]: 'function',
  [vscode.SymbolKind.Field]: 'field',
  [vscode.SymbolKind.Property]: 'property',
  [vscode.SymbolKind.Variable]: 'variable',
  [vscode.SymbolKind.Constant]: 'constant',
  [vscode.SymbolKind.TypeParameter]: 'typeParameter',
  [vscode.SymbolKind.Module]: 'module',
  [vscode.SymbolKind.Namespace]: 'namespace',
  [vscode.SymbolKind.Package]: 'package',
  [vscode.SymbolKind.Event]: 'event',
};

/**
 * Colored IntelliJ icon of a symbol kind. Quick Pick ignores ThemeIcon colors, so the SVGs are
 * used everywhere for a consistent look.
 */
export function symbolIconPath(extensionUri: vscode.Uri, kind: vscode.SymbolKind): { light: vscode.Uri; dark: vscode.Uri } {
  const name = KIND_ICONS[kind] ?? 'misc';
  return {
    dark: vscode.Uri.joinPath(extensionUri, 'icons', 'symbols', `${name}.svg`),
    light: vscode.Uri.joinPath(extensionUri, 'icons', 'symbols', `${name}_light.svg`),
  };
}
