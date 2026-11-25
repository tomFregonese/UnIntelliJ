import * as vscode from 'vscode';
import fileIconTheme from '../../icons/file-icon-theme.json';

type Section = { fileNames: Record<string, string>; fileExtensions: Record<string, string>; file: string };
const theme = fileIconTheme as unknown as Section & { iconDefinitions: Record<string, { iconPath: string }>; light: Section };

/** Icon id for a file name, resolved like VS Code does: full name, then longest extension, then default. */
export function fileIconId(fileName: string, section: Section = theme): string {
  const lower = fileName.toLowerCase();
  if (section.fileNames[lower]) {
    return section.fileNames[lower];
  }
  const parts = lower.split('.');
  for (let i = 1; i < parts.length; i++) {
    const ext = parts.slice(i).join('.');
    if (section.fileExtensions[ext]) {
      return section.fileExtensions[ext];
    }
  }
  return section.file;
}

/** IntelliJ New UI icon of a file, for Quick Pick items. */
export function fileIconPath(extensionUri: vscode.Uri, fileName: string): { light: vscode.Uri; dark: vscode.Uri } {
  const toUri = (id: string) => vscode.Uri.joinPath(extensionUri, 'icons', theme.iconDefinitions[id].iconPath);
  return { dark: toUri(fileIconId(fileName)), light: toUri(fileIconId(fileName, theme.light)) };
}
