import * as vscode from 'vscode';

export interface RecentFile {
  uri: string;
  edited: boolean;
}

export interface RecentLocation {
  uri: string;
  line: number;
  character: number;
  /** Text of the line when it was visited, shown in Recent Locations. */
  text: string;
  edited: boolean;
}

const FILES_KEY = 'history.recentFiles';
const LOCATIONS_KEY = 'history.recentLocations';
const MAX_FILES = 50;
const MAX_LOCATIONS = 50;
/** A caret move farther than this from the last recorded location records a new one. */
const LOCATION_DISTANCE = 10;

/**
 * IntelliJ-like navigation history, per workspace: recently opened files (most recent first) and
 * recently visited/edited code locations.
 */
export class NavigationHistory implements vscode.Disposable {
  private recentFiles: RecentFile[];
  private recentLocations: RecentLocation[];
  private readonly disposables: vscode.Disposable[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly state: vscode.Memento) {
    this.recentFiles = state.get<RecentFile[]>(FILES_KEY, []);
    this.recentLocations = state.get<RecentLocation[]>(LOCATIONS_KEY, []);
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && isFile(editor.document.uri)) {
          this.touchFile(editor.document.uri, false);
          this.recordLocation(editor, false);
        }
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        if (isFile(event.textEditor.document.uri) && event.kind !== vscode.TextEditorSelectionChangeKind.Command) {
          this.recordLocation(event.textEditor, false);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        const editor = vscode.window.activeTextEditor;
        if (event.contentChanges.length > 0 && editor?.document === event.document && isFile(event.document.uri)) {
          this.touchFile(event.document.uri, true);
          this.recordLocation(editor, true);
        }
      }),
      vscode.workspace.onDidDeleteFiles((event) => {
        const deleted = new Set(event.files.map((f) => f.toString()));
        this.recentFiles = this.recentFiles.filter((f) => !deleted.has(f.uri));
        this.recentLocations = this.recentLocations.filter((l) => !deleted.has(l.uri));
        this.scheduleSave();
      }),
    );
    const active = vscode.window.activeTextEditor;
    if (active && isFile(active.document.uri)) {
      this.touchFile(active.document.uri, false);
    }
  }

  files(editedOnly = false): RecentFile[] {
    return this.recentFiles.filter((f) => !editedOnly || f.edited);
  }

  locations(editedOnly = false): RecentLocation[] {
    return this.recentLocations.filter((l) => !editedOnly || l.edited);
  }

  private touchFile(uri: vscode.Uri, edited: boolean): void {
    const key = uri.toString();
    const existing = this.recentFiles.find((f) => f.uri === key);
    this.recentFiles = [{ uri: key, edited: edited || (existing?.edited ?? false) }, ...this.recentFiles.filter((f) => f.uri !== key)].slice(0, MAX_FILES);
    this.scheduleSave();
  }

  private recordLocation(editor: vscode.TextEditor, edited: boolean): void {
    const position = editor.selection.active;
    const key = editor.document.uri.toString();
    const last = this.recentLocations[0];
    const location: RecentLocation = {
      uri: key,
      line: position.line,
      character: position.character,
      text: editor.document.lineAt(position.line).text.trim().slice(0, 200),
      edited,
    };
    if (last && last.uri === key && Math.abs(last.line - position.line) <= LOCATION_DISTANCE) {
      // Same area: update in place, keeping the "edited" flag once set.
      this.recentLocations[0] = { ...location, edited: edited || last.edited };
    } else {
      this.recentLocations = [location, ...this.recentLocations].slice(0, MAX_LOCATIONS);
    }
    this.scheduleSave();
  }

  private scheduleSave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.save(), 1000);
  }

  private async save(): Promise<void> {
    await this.state.update(FILES_KEY, this.recentFiles);
    await this.state.update(LOCATIONS_KEY, this.recentLocations);
  }

  dispose(): void {
    clearTimeout(this.saveTimer);
    void this.save();
    this.disposables.forEach((d) => d.dispose());
  }
}

function isFile(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' || uri.scheme === 'vscode-remote' || uri.scheme === 'untitled';
}
