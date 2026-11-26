import * as vscode from 'vscode';
import { getSetting } from '../config/settings';
import { ActionEntry, collectActions } from './actions';
import { excludedGlobs } from './excludes';
import { fileIconPath } from './fileIcons';
import { FileIndex, IndexedFile } from './fileIndex';
import { NavigationHistory } from './history';
import { matchFile, matchName, parseQuery, ParsedQuery, rank } from './matcher';
import { searchText } from './ripgrep';
import { symbolIconPath } from './symbolIcons';
import { t } from '../i18n/i18n';

export const TABS = ['all', 'classes', 'files', 'symbols', 'actions', 'text'] as const;
export type TabId = (typeof TABS)[number];
const TAB_LABELS: Record<TabId, string> = { all: 'All', classes: 'Classes', files: 'Files', symbols: 'Symbols', actions: 'Actions', text: 'Text' };

export const VISIBLE_CONTEXT_KEY = 'unintellij.searchEverywhereVisible';

const CLASS_KINDS = new Set([vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Enum, vscode.SymbolKind.Struct]);
const LIMITS = { all: 5, tab: 100, text: 200 };

export interface SearchItem extends vscode.QuickPickItem {
  open?(toSide: boolean): Thenable<unknown>;
  /** Rows acting on the popup itself (load more, include non-project items): it stays open. */
  run?(): void;
}

const OPEN_TO_SIDE: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('split-horizontal'), tooltip: t('Open to the Side') };

/** Opens `uri`, optionally at a position, in the active or side editor group. */
export async function openLocation(uri: vscode.Uri, toSide: boolean, position?: vscode.Position, length = 0): Promise<void> {
  const selection = position ? new vscode.Range(position, position.translate(0, length)) : undefined;
  await vscode.window.showTextDocument(uri, { viewColumn: toSide ? vscode.ViewColumn.Beside : vscode.ViewColumn.Active, selection, preview: false });
}

export function renderTabs(active: TabId, includeNonProject: boolean): string {
  const tabs = TABS.map((tab) => (tab === active ? `[${t(TAB_LABELS[tab])}]` : t(TAB_LABELS[tab]))).join('   ');
  return `${tabs}${includeNonProject ? '   · Including non-project items' : ''}`;
}

/** IntelliJ's Search Everywhere popup (double Shift). */
export class SearchEverywhere implements vscode.Disposable {
  private quickPick: vscode.QuickPick<SearchItem> | undefined;
  private tab: TabId = 'all';
  private includeNonProject = false;
  /** Non-project items switched on because the project had no result for the current text (IntelliJ). */
  private autoIncluded = false;
  /** "More" rows clicked for the current text: each loads one more page. */
  private pages = 0;
  private generation = 0;
  private cancellation: vscode.CancellationTokenSource | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private actions: ActionEntry[] | undefined;
  private readonly symbolCache = new Map<string, Promise<vscode.SymbolInformation[]>>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly fileIndex: FileIndex,
    private readonly history: NavigationHistory,
    private readonly log: vscode.LogOutputChannel,
  ) {}

  get visible(): boolean {
    return this.quickPick !== undefined;
  }

  get activeTab(): TabId {
    return this.tab;
  }

  /** Opens the popup on `tab`; when already open, switches tab or, for double Shift, toggles non-project items. */
  show(tab: TabId, initialValue?: string): void {
    if (this.quickPick) {
      if (tab === this.tab && tab === 'all') {
        this.includeNonProject = !this.includeNonProject;
      }
      this.switchTab(tab);
      return;
    }
    this.tab = tab;
    this.includeNonProject = getSetting('searchEverywhere.includeNonProjectItems');
    this.autoIncluded = false;
    this.pages = 0;
    this.actions = undefined;
    this.symbolCache.clear();

    const quickPick = vscode.window.createQuickPick<SearchItem>();
    this.quickPick = quickPick;
    quickPick.matchOnDescription = false;
    quickPick.matchOnDetail = false;
    // Results are already ranked; keep our order (exists at runtime, not yet in the typings).
    (quickPick as unknown as { sortByLabel: boolean }).sortByLabel = false;
    quickPick.placeholder = t('Type to search · Tab switches tabs · Shift Shift includes non-project items');
    if (initialValue !== undefined) {
      quickPick.value = initialValue;
    } else {
      const selection = vscode.window.activeTextEditor?.selection;
      const selected = selection && !selection.isEmpty && selection.isSingleLine ? vscode.window.activeTextEditor!.document.getText(selection) : '';
      quickPick.value = selected;
    }

    quickPick.onDidChangeValue(() => {
      this.resetPaging();
      this.scheduleUpdate();
    });
    quickPick.onDidAccept(() => {
      const item = quickPick.selectedItems[0] ?? quickPick.activeItems[0];
      if (item?.run) {
        item.run();
      } else if (item?.open) {
        quickPick.hide();
        void item.open(false);
      }
    });
    quickPick.onDidTriggerItemButton(({ item }) => {
      quickPick.hide();
      void item.open?.(true);
    });
    quickPick.onDidTriggerButton((button) => this.onButton(button));
    quickPick.onDidHide(() => {
      this.cancellation?.cancel();
      clearTimeout(this.timer);
      quickPick.dispose();
      this.quickPick = undefined;
      void vscode.commands.executeCommand('setContext', VISIBLE_CONTEXT_KEY, false);
    });

    void vscode.commands.executeCommand('setContext', VISIBLE_CONTEXT_KEY, true);
    this.refreshChrome();
    quickPick.show();
    this.scheduleUpdate(0);
  }

  switchTab(tab: TabId): void {
    this.tab = tab;
    this.pages = 0;
    this.refreshChrome();
    this.scheduleUpdate(0);
  }

  cycleTab(delta: 1 | -1): void {
    const index = TABS.indexOf(this.tab);
    this.switchTab(TABS[(index + delta + TABS.length) % TABS.length]);
  }

  private nonProjectButton(): vscode.QuickInputButton {
    return this.includeNonProject
      ? { iconPath: new vscode.ThemeIcon('library'), tooltip: t('Including non-project items (click to exclude)') }
      : { iconPath: new vscode.ThemeIcon('folder'), tooltip: t('Project items only (click to include non-project items)') };
  }

  private findInFilesButton: vscode.QuickInputButton = { iconPath: new vscode.ThemeIcon('search-view-icon'), tooltip: t('Open in Find Tool Window') };

  private refreshChrome(): void {
    if (!this.quickPick) {
      return;
    }
    this.quickPick.title = renderTabs(this.tab, this.includeNonProject);
    this.quickPick.buttons = this.tab === 'text' ? [this.nonProjectButton(), this.findInFilesButton] : [this.nonProjectButton()];
  }

  private onButton(button: vscode.QuickInputButton): void {
    if (button === this.findInFilesButton) {
      const query = this.quickPick?.value ?? '';
      this.quickPick?.hide();
      void vscode.commands.executeCommand('workbench.action.findInFiles', { query, triggerSearch: true });
      return;
    }
    this.setNonProject(!this.includeNonProject);
  }

  private setNonProject(include: boolean): void {
    this.includeNonProject = include;
    this.autoIncluded = false;
    this.pages = 0;
    this.refreshChrome();
    this.scheduleUpdate(0);
  }

  /** New text: back to the first page, and to project items if they were only added for the previous text. */
  private resetPaging(): void {
    this.pages = 0;
    if (this.autoIncluded) {
      this.autoIncluded = false;
      this.includeNonProject = false;
      this.refreshChrome();
    }
  }

  private scheduleUpdate(delay?: number): void {
    clearTimeout(this.timer);
    const wait = delay ?? (this.tab === 'text' ? 250 : this.tab === 'files' || this.tab === 'actions' ? 30 : 120);
    this.timer = setTimeout(() => void this.update(), wait);
  }

  private async update(): Promise<void> {
    const quickPick = this.quickPick;
    if (!quickPick) {
      return;
    }
    this.cancellation?.cancel();
    const cancellation = new vscode.CancellationTokenSource();
    this.cancellation = cancellation;
    const generation = ++this.generation;
    const raw = quickPick.value;
    const query = parseQuery(raw);
    quickPick.busy = true;
    try {
      let items = await this.itemsFor(this.tab, raw, query, cancellation.token);
      // IntelliJ: nothing in the project, so look in libraries and build output too.
      if (!this.includeNonProject && this.tab !== 'actions' && raw.trim() !== '' && !hasResults(items)) {
        this.includeNonProject = true;
        this.autoIncluded = true;
        items = await this.itemsFor(this.tab, raw, query, cancellation.token);
        if (!hasResults(items)) {
          this.includeNonProject = false;
          this.autoIncluded = false;
          items = await this.itemsFor(this.tab, raw, query, cancellation.token);
        }
      }
      if (generation !== this.generation || !this.quickPick) {
        return;
      }
      this.refreshChrome();
      const active = quickPick.activeItems[0];
      const activeIndex = active ? quickPick.items.indexOf(active) : -1;
      quickPick.items = [...items, ...this.footer(raw)].map((i) => ({ ...i, alwaysShow: true }));
      // After "More", stay where the user was instead of jumping back to the top.
      if (this.pages > 0 && activeIndex >= 0 && quickPick.items[activeIndex]) {
        quickPick.activeItems = [quickPick.items[activeIndex]];
      }
    } catch (error) {
      this.log.error(`Search Everywhere failed: ${String(error)}`);
    } finally {
      if (generation === this.generation) {
        quickPick.busy = false;
      }
    }
  }

  /** Last row: include libraries and build output, when they are not already searched. */
  private footer(raw: string): SearchItem[] {
    if (this.includeNonProject || this.tab === 'actions' || raw.trim() === '') {
      return [];
    }
    return [{ label: `$(library) ${t('Include non-project items')}`, description: t('compiled classes, libraries, build output'), run: () => this.setNonProject(true) }];
  }

  /** "More" row loading one more page of results. */
  private moreItem(): SearchItem {
    return {
      label: `$(ellipsis) ${t('More')}`,
      run: () => {
        this.pages++;
        this.scheduleUpdate(0);
      },
    };
  }

  /** Keeps `limit` items, adding a "More" row when there were more. */
  private paged(items: SearchItem[], limit: number): SearchItem[] {
    return items.length > limit ? [...items.slice(0, limit), this.moreItem()] : items;
  }

  /** Results without UI, with the configured "include non-project items" default. */
  search(tab: TabId, raw: string): Promise<SearchItem[]> {
    this.symbolCache.clear();
    this.includeNonProject = getSetting('searchEverywhere.includeNonProjectItems');
    return this.itemsFor(tab, raw, parseQuery(raw), new vscode.CancellationTokenSource().token);
  }

  private async itemsFor(tab: TabId, raw: string, query: ParsedQuery, token: vscode.CancellationToken): Promise<SearchItem[]> {
    const limit = LIMITS.tab * (this.pages + 1);
    switch (tab) {
      case 'files':
        return this.paged(await this.fileItems(query, limit + 1), limit);
      case 'classes':
        return this.paged(await this.symbolItems(query, true, limit + 1), limit);
      case 'symbols':
        return this.paged(await this.symbolItems(query, false, limit + 1), limit);
      case 'actions':
        return this.actionItems(raw, LIMITS.tab);
      case 'text':
        return this.textItems(raw, token);
      case 'all':
        return this.allItems(raw, query);
    }
  }

  private async allItems(raw: string, query: ParsedQuery): Promise<SearchItem[]> {
    if (raw.trim() === '') {
      return this.recentItems(query, 15);
    }
    // Each "More" adds 10 rows to every section, like IntelliJ's "... more" in the All tab.
    const limit = LIMITS.all + this.pages * 10;
    const [recent, classes, files, symbols] = await Promise.all([
      this.recentItems(query, limit),
      this.symbolItems(query, true, limit + 1),
      this.fileItems(query, 2 * limit + 4),
      this.symbolItems(query, false, limit + 1),
    ]);
    const recentUris = new Set(recent.map((r) => r.description + r.label));
    const shownClasses = classes.slice(0, limit);
    const sections: [string, SearchItem[]][] = [
      [t('Recent Files'), recent],
      [t('Classes'), this.paged(classes, limit)],
      [t('Files'), this.paged(files.filter((f) => !recentUris.has(f.description + f.label)), limit + 3)],
      [t('Symbols'), this.paged(symbols.filter((s) => !shownClasses.some((c) => c.label === s.label && c.description === s.description)), limit)],
      [t('Actions'), this.actionItems(raw, LIMITS.all)],
    ];
    return sections.flatMap(([label, items]) => (items.length === 0 ? [] : [{ label, kind: vscode.QuickPickItemKind.Separator }, ...items]));
  }

  private fileItem(file: IndexedFile, query: ParsedQuery): SearchItem {
    return {
      label: file.name,
      description: file.relativeDir,
      iconPath: fileIconPath(this.extensionUri, file.name),
      buttons: [OPEN_TO_SIDE],
      open: (toSide) =>
        openLocation(file.uri, toSide, query.line !== undefined ? new vscode.Position(Math.max(0, query.line - 1), Math.max(0, (query.column ?? 1) - 1)) : undefined),
    };
  }

  private async fileItems(query: ParsedQuery, limit: number): Promise<SearchItem[]> {
    if (query.name === '' && !query.path) {
      return [];
    }
    const files = await this.fileIndex.files(this.includeNonProject);
    return rank(files, (f) => matchFile(query, f.name, f.relativeDir)?.score, (f) => f.relativeDir + f.name, limit).map((f) => this.fileItem(f, query));
  }

  private async recentItems(query: ParsedQuery, limit: number): Promise<SearchItem[]> {
    const current = vscode.window.activeTextEditor?.document.uri.toString();
    const recent = this.history
      .files()
      .filter((f) => f.uri !== current)
      .map((f) => vscode.Uri.parse(f.uri))
      .map((uri) => {
        const relative = vscode.workspace.asRelativePath(uri, (vscode.workspace.workspaceFolders?.length ?? 0) > 1);
        const slash = relative.lastIndexOf('/');
        return { uri, name: relative.slice(slash + 1), relativeDir: slash >= 0 ? relative.slice(0, slash) : '' };
      });
    const matching = query.name === '' && !query.path ? recent : recent.filter((f) => matchFile(query, f.name, f.relativeDir));
    return matching.slice(0, limit).map((f) => this.fileItem(f, query));
  }

  private async symbolItems(query: ParsedQuery, classesOnly: boolean, limit: number): Promise<SearchItem[]> {
    if (query.name.length === 0) {
      return [];
    }
    const symbols = await this.workspaceSymbols(query.name);
    const multiRoot = (vscode.workspace.workspaceFolders?.length ?? 0) > 1;
    // Like IntelliJ, the Symbols tab includes classes too; only the Classes tab filters by kind.
    const candidates = symbols.filter(
      (s) => (!classesOnly || CLASS_KINDS.has(s.kind)) && (this.includeNonProject || isProjectFile(s.location.uri)),
    );
    const ranked = rank(candidates, (s) => matchName(query.name, s.name)?.score, (s) => s.name, limit);
    return ranked.map((s) => ({
      label: s.name,
      description: [s.containerName, vscode.workspace.asRelativePath(s.location.uri, multiRoot)].filter(Boolean).join(' — '),
      iconPath: symbolIconPath(this.extensionUri, s.kind),
      buttons: [OPEN_TO_SIDE],
      open: (toSide) => openLocation(s.location.uri, toSide, s.location.range.start),
    }));
  }

  /**
   * Language servers filter workspace symbols themselves and do not understand IntelliJ
   * abbreviations (`USvc`). Ask for the full query and for its first letter, then let our matcher
   * filter and rank. Results are cached for the lifetime of the popup.
   */
  private async workspaceSymbols(name: string): Promise<vscode.SymbolInformation[]> {
    const queries = [...new Set([name, name[0].toLowerCase()])];
    const results = await Promise.all(queries.map((q) => this.providerSymbols(q)));
    const seen = new Set<string>();
    return results.flat().filter((s) => {
      const key = `${s.name}|${s.location.uri.toString()}|${s.location.range.start.line}|${s.location.range.start.character}`;
      return !seen.has(key) && (seen.add(key), true);
    });
  }

  private providerSymbols(query: string): Promise<vscode.SymbolInformation[]> {
    let result = this.symbolCache.get(query);
    if (!result) {
      result = Promise.resolve(vscode.commands.executeCommand<vscode.SymbolInformation[] | undefined>('vscode.executeWorkspaceSymbolProvider', query)).then(
        (symbols) => symbols ?? [],
      );
      this.symbolCache.set(query, result);
      // Empty results are often "server still loading": do not cache them.
      void result.then((symbols) => symbols.length === 0 && this.symbolCache.delete(query));
    }
    return result;
  }

  private actionItems(raw: string, limit: number): SearchItem[] {
    this.actions ??= collectActions();
    const query = raw.trim();
    const ranked =
      query === ''
        ? this.actions.slice(0, limit)
        : rank(this.actions, (a) => bestWordMatch(query, a.searchText), (a) => a.label, limit);
    const items: SearchItem[] = ranked.map((a) => ({ label: a.label, description: a.description, open: () => a.run() }));
    if (this.tab === 'actions') {
      items.push({ label: t('All Commands…'), description: t('VS Code Command Palette'), open: () => vscode.commands.executeCommand('workbench.action.quickOpen', `>${query}`) });
    }
    return items;
  }

  private async textItems(raw: string, token: vscode.CancellationToken): Promise<SearchItem[]> {
    if (raw.length < 2) {
      return [];
    }
    const folders = vscode.workspace.workspaceFolders?.map((f) => f.uri) ?? [];
    const limit = LIMITS.text * (this.pages + 1);
    const matches = await searchText({
      query: raw,
      folders,
      excludeGlobs: excludedGlobs(this.includeNonProject),
      includeIgnored: this.includeNonProject,
      maxResults: limit + 1,
      token,
    });
    if (matches === undefined) {
      return [{ label: t('Text search is not available in this VS Code build'), description: t('Open in Find Tool Window'), open: () => vscode.commands.executeCommand('workbench.action.findInFiles', { query: raw, triggerSearch: true }) }];
    }
    const multiRoot = folders.length > 1;
    const items = matches.map((m): SearchItem => {
      const name = m.uri.path.slice(m.uri.path.lastIndexOf('/') + 1);
      return {
        label: m.text.trim().slice(0, 150),
        description: `${vscode.workspace.asRelativePath(m.uri, multiRoot)}:${m.line + 1}`,
        iconPath: fileIconPath(this.extensionUri, name),
        buttons: [OPEN_TO_SIDE],
        open: (toSide) => openLocation(m.uri, toSide, new vscode.Position(m.line, m.character), m.length),
      };
    });
    return this.paged(items, limit);
  }

  dispose(): void {
    this.quickPick?.dispose();
    this.cancellation?.dispose();
    clearTimeout(this.timer);
  }
}

/** Whether the items contain search results (not only actions, "More" or the popup's own rows). */
function hasResults(items: readonly SearchItem[]): boolean {
  let section = '';
  return items.some((item) => {
    if (item.kind === vscode.QuickPickItemKind.Separator) {
      section = item.label;
      return false;
    }
    return !item.run && section !== t('Actions') && !!item.open && item.label !== t('Text search is not available in this VS Code build');
  });
}

/** Matches a multi-word action query ("reformat code") against an action's words. */
function bestWordMatch(query: string, text: string): number | undefined {
  let total = 0;
  for (const word of query.split(/\s+/)) {
    const match = matchName(word, text) ?? matchName(word.toLowerCase(), text.toLowerCase());
    if (!match) {
      return undefined;
    }
    total += match.score;
  }
  return total;
}

function isProjectFile(uri: vscode.Uri): boolean {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  if (!folder) {
    return false;
  }
  const relative = uri.path.slice(folder.uri.path.length);
  return !/\/(node_modules|dist|target|build|out|\.angular)\//.test(relative);
}
