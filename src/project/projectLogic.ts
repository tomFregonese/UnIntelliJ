/**
 * Project view rules (IntelliJ's Project tool window): modules, source/test/resource roots,
 * excluded folders, Java packages. Pure: no `vscode` import. Paths use '/' separators.
 */

export type ProjectMode = 'project' | 'packages' | 'files' | 'openFiles' | 'changedFiles';

export const PROJECT_MODES: { id: ProjectMode; label: string; description: string }[] = [
  { id: 'project', label: 'Project', description: 'Modules with their source roots' },
  { id: 'packages', label: 'Packages', description: 'Java packages' },
  { id: 'files', label: 'Project Files', description: 'All files, as on disk' },
  { id: 'openFiles', label: 'Open Files', description: 'Files open in the editor' },
  { id: 'changedFiles', label: 'Changed Files', description: 'Files with local changes' },
];

/** Build files that make a folder a module. */
export const MODULE_MARKERS = ['pom.xml', 'build.gradle', 'build.gradle.kts', 'package.json', 'angular.json'];

/** Folders IntelliJ marks as excluded (orange) in a typical Maven / Angular project. */
export const EXCLUDED_FOLDERS = new Set(['node_modules', 'target', 'dist', 'out', 'build', '.angular', '.idea', '.gradle', 'coverage']);

export type RootKind = 'source' | 'test' | 'resources' | 'testResources' | 'excluded' | undefined;

/** Kind of a folder from its path relative to its module (Maven / Angular conventions). */
export function rootKind(relativeToModule: string, name: string): RootKind {
  if (EXCLUDED_FOLDERS.has(name)) {
    return 'excluded';
  }
  switch (relativeToModule) {
    case 'src/main/java':
    case 'src/main/kotlin':
      return 'source';
    case 'src/test/java':
    case 'src/test/kotlin':
      return 'test';
    case 'src/main/resources':
      return 'resources';
    case 'src/test/resources':
      return 'testResources';
    default:
      // Angular: `src` of a module with angular.json is the source root.
      return undefined;
  }
}

/** Icon file (in icons/files) for a folder kind. */
export function folderIcon(kind: RootKind, isModule: boolean): string | undefined {
  if (isModule) {
    return 'rootFolder';
  }
  switch (kind) {
    case 'source':
      return 'folder_sourceRoot';
    case 'test':
      return 'folder_testRoot';
    case 'resources':
    case 'testResources':
      return 'folder_resourcesRoot';
    case 'excluded':
      return 'folder_excludeRoot';
    default:
      return undefined;
  }
}

/** IntelliJ order: folders first, then files, each alphabetical (case-insensitive). */
export function compareEntries(a: { name: string; directory: boolean }, b: { name: string; directory: boolean }): number {
  if (a.directory !== b.directory) {
    return a.directory ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
}

/** Path shown dimmed next to a module root, `~` for the home directory. */
export function displayPath(fsPath: string, home: string): string {
  const normalized = fsPath.replace(/\\/g, '/');
  const homeNormalized = home.replace(/\\/g, '/');
  return homeNormalized && normalized.startsWith(`${homeNormalized}/`) ? `~${normalized.slice(homeNormalized.length)}` : normalized;
}

/**
 * Java packages from source files relative to a source root (`com/acme/App.java`):
 * package name → files, sorted. Files at the root are in the default package ('').
 */
export function groupPackages(relativeFiles: readonly string[]): Map<string, string[]> {
  const packages = new Map<string, string[]>();
  for (const file of [...relativeFiles].sort()) {
    const slash = file.lastIndexOf('/');
    const pkg = slash < 0 ? '' : file.slice(0, slash).replace(/\//g, '.');
    const list = packages.get(pkg) ?? [];
    list.push(file);
    packages.set(pkg, list);
  }
  return new Map([...packages.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** Rejects names that cannot be created (IntelliJ shows the same kind of inline error). */
export function validateFileName(name: string): string | undefined {
  if (!name.trim()) {
    return 'Name cannot be empty';
  }
  if (/[<>:"|?*\\]/.test(name) || name.split('/').some((part) => part === '..')) {
    return 'Invalid characters in name';
  }
  return undefined;
}
