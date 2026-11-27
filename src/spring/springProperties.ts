import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import * as vscode from 'vscode';
import { t } from '../i18n/i18n';
import { INTEGRATIONS } from '../integrations';
import {
  Context,
  describe,
  isDeprecated,
  METADATA_FILES,
  MetadataIndex,
  propertiesContext,
  propertiesKeyAt,
  remainder,
  shortType,
  SpringMetadata,
  SpringProperty,
  valueText,
  yamlContext,
  yamlInsertion,
  yamlKeyAt,
} from './metadata';
import { readZipEntries } from './zip';

interface JavaApi {
  serverMode?: string;
  getClasspaths?(uri: string, options: { scope: 'runtime' | 'test' }): Promise<{ classpaths: string[]; modulepaths: string[] }>;
  onDidClasspathUpdate?: vscode.Event<vscode.Uri>;
}

const SELECTOR: vscode.DocumentFilter[] = [
  { scheme: 'file', pattern: '**/{application,bootstrap}*.properties' },
  { scheme: 'file', pattern: '**/{application,bootstrap}*.yml' },
  { scheme: 'file', pattern: '**/{application,bootstrap}*.yaml' },
];

/** How long a completion waits for the metadata the first time, before answering without it. */
const FIRST_WAIT_MS = 4000;

/**
 * IntelliJ's Spring Boot support for application.properties / application.yml, for when Spring
 * Boot Tools (VMware) is not installed: completion of keys and values, documentation on hover and
 * Ctrl+click to the @ConfigurationProperties class. Keys come from the Spring configuration
 * metadata of the project's classpath, given by the Java extension (Red Hat).
 */
export class SpringProperties implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  /** Metadata per workspace folder, rebuilt when the classpath changes. */
  private readonly indexes = new Map<string, Promise<MetadataIndex | undefined>>();
  /** Parsed metadata per jar or file, by path and modification time. */
  private readonly files = new Map<string, { mtime: number; metadata: SpringMetadata[] }>();
  private classpathListener: vscode.Disposable | undefined;

  constructor(private readonly log: vscode.LogOutputChannel) {
    this.disposables.push(
      vscode.languages.registerCompletionItemProvider(SELECTOR, { provideCompletionItems: (d, p) => this.complete(d, p) }, '.', '=', ':', ' '),
      vscode.languages.registerHoverProvider(SELECTOR, { provideHover: (d, p) => this.hover(d, p) }),
      vscode.languages.registerDefinitionProvider(SELECTOR, { provideDefinition: (d, p) => this.definition(d, p) }),
      vscode.workspace.onDidOpenTextDocument((d) => this.prefetch(d)),
      vscode.workspace.onDidSaveTextDocument((d) => /(^|[\\/])(pom\.xml|build\.gradle(\.kts)?)$/.test(d.fileName) && this.indexes.clear()),
    );
    vscode.workspace.textDocuments.forEach((d) => this.prefetch(d));
  }

  /** Off when Spring Boot Tools provides the same (and more). */
  private get enabled(): boolean {
    return !vscode.extensions.getExtension(INTEGRATIONS.springBoot.extensionId);
  }

  private prefetch(document: vscode.TextDocument): void {
    if (this.enabled && vscode.languages.match(SELECTOR, document) > 0) {
      void this.index(document.uri);
    }
  }

  private index(uri: vscode.Uri): Promise<MetadataIndex | undefined> {
    const folder = vscode.workspace.getWorkspaceFolder(uri)?.uri.toString() ?? '';
    let index = this.indexes.get(folder);
    if (!index) {
      index = this.build(uri).then((built) => {
        if (!built) {
          this.indexes.delete(folder); // Java not ready yet: try again next time.
        }
        return built;
      });
      this.indexes.set(folder, index);
    }
    return index;
  }

  private async build(uri: vscode.Uri): Promise<MetadataIndex | undefined> {
    const java = vscode.extensions.getExtension<JavaApi>(INTEGRATIONS.java.extensionId);
    if (!java) {
      return undefined;
    }
    const api = java.isActive ? java.exports : await java.activate();
    if (!this.classpathListener && api.onDidClasspathUpdate) {
      this.classpathListener = api.onDidClasspathUpdate(() => this.indexes.clear());
    }
    let classpath: string[];
    try {
      classpath = (await api.getClasspaths!(uri.toString(), { scope: 'test' })).classpaths;
    } catch (error) {
      this.log.info(`Spring properties: no classpath yet (${error instanceof Error ? error.message : String(error)}; Java mode ${api.serverMode ?? '?'})`);
      return undefined;
    }
    const started = Date.now();
    // The project's own metadata first (target/classes, src/main/resources), then its dependencies.
    const sources = (await Promise.all([...classpath].sort((a, b) => Number(a.endsWith('.jar')) - Number(b.endsWith('.jar'))).map((entry) => this.read(entry)))).flat();
    const index = new MetadataIndex(sources);
    this.log.info(`Spring properties: ${index.size} keys from ${classpath.length} classpath entries in ${Date.now() - started} ms`);
    return index;
  }

  /** Metadata of one classpath entry (a jar or a classes folder), cached until it changes. */
  private async read(entry: string): Promise<SpringMetadata[]> {
    try {
      const { mtimeMs, isDirectory } = await stat(entry).then((s) => ({ mtimeMs: s.mtimeMs, isDirectory: s.isDirectory() }));
      const cached = this.files.get(entry);
      if (cached?.mtime === mtimeMs) {
        return cached.metadata;
      }
      const contents = isDirectory
        ? await Promise.all(METADATA_FILES.map((f) => readFile(join(entry, f)).catch(() => undefined)))
        : [...(await readZipEntries(entry, METADATA_FILES)).values()];
      const metadata = contents.flatMap((c) => {
        try {
          return c ? [JSON.parse(c.toString('utf8')) as SpringMetadata] : [];
        } catch {
          return [];
        }
      });
      this.files.set(entry, { mtime: mtimeMs, metadata });
      return metadata;
    } catch {
      return [];
    }
  }

  /** The index, waiting a little for it the first time; undefined when Spring support is off. */
  private async ready(uri: vscode.Uri): Promise<MetadataIndex | undefined> {
    if (!this.enabled) {
      return undefined;
    }
    return Promise.race([this.index(uri), new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), FIRST_WAIT_MS))]);
  }

  private context(document: vscode.TextDocument, position: vscode.Position): Context | undefined {
    const before = document.lineAt(position.line).text.slice(0, position.character);
    return isYaml(document) ? yamlContext(lines(document), position.line, before) : propertiesContext(before);
  }

  private async complete(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[] | undefined> {
    const context = this.context(document, position);
    const index = context && (await this.ready(document.uri));
    if (!context || !index) {
      return undefined;
    }
    const range = new vscode.Range(position.line, context.start, position.line, position.character);
    if (context.kind === 'value') {
      return index.values(context.key).map((hint) => {
        const item = new vscode.CompletionItem(valueText(hint.value), vscode.CompletionItemKind.Value);
        item.range = range;
        item.documentation = hint.description && new vscode.MarkdownString(hint.description);
        return item;
      });
    }
    if (!isYaml(document)) {
      return index.properties.map((property) => this.keyItem(property, property.name, `${property.name}=`, range));
    }
    return index.properties.flatMap((property) => {
      const rest = remainder(property.name, context.parents);
      return rest ? [this.keyItem(property, rest.join('.'), new vscode.SnippetString(yamlInsertion(rest).replace(/[$}\\]/g, '\\$&') + '$0'), range)] : [];
    });
  }

  private keyItem(property: SpringProperty, label: string, insertText: string | vscode.SnippetString, range: vscode.Range): vscode.CompletionItem {
    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Property);
    item.insertText = insertText;
    item.range = range;
    item.detail = property.type && shortType(property.type);
    item.documentation = new vscode.MarkdownString(describe(property, labels()));
    if (isDeprecated(property)) {
      item.tags = [vscode.CompletionItemTag.Deprecated];
      item.sortText = `~${label}`;
    }
    if (!property.type?.startsWith('java.util.Map<')) {
      // After the key, offer its values right away (IntelliJ does).
      item.command = { command: 'editor.action.triggerSuggest', title: '' };
    }
    return item;
  }

  private keyAt(document: vscode.TextDocument, position: vscode.Position): { key: string; start: number; end: number } | undefined {
    return isYaml(document) ? yamlKeyAt(lines(document), position.line, position.character) : propertiesKeyAt(document.lineAt(position.line).text, position.character);
  }

  private async hover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
    const at = this.keyAt(document, position);
    const found = at && (await this.ready(document.uri))?.find(at.key);
    if (!at || !found) {
      return undefined;
    }
    return new vscode.Hover(new vscode.MarkdownString(describe(found.property, labels())), new vscode.Range(position.line, at.start, position.line, at.end));
  }

  /** Ctrl+click on a key: the class that declares it (its @ConfigurationProperties), like IntelliJ. */
  private async definition(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Location[] | undefined> {
    const at = this.keyAt(document, position);
    const found = at && (await this.ready(document.uri))?.find(at.key);
    const sourceType = found?.property.sourceType;
    if (!found || !sourceType) {
      return undefined;
    }
    const className = sourceType.replace(/\$/g, '.');
    const simpleName = className.slice(className.lastIndexOf('.') + 1);
    const symbols = (await vscode.commands.executeCommand<vscode.SymbolInformation[]>('vscode.executeWorkspaceSymbolProvider', simpleName)) ?? [];
    const named = symbols.filter((s) => s.name === simpleName);
    const [type] = [...named.filter((s) => `${s.containerName}.${s.name}` === className), ...named];
    if (!type) {
      return undefined;
    }
    // On the field that holds the value (`server.port` → `port`), like IntelliJ; else on the class.
    const field = camelCase(found.property.name.slice(found.property.name.lastIndexOf('.') + 1));
    const members = (await vscode.commands.executeCommand<vscode.DocumentSymbol[]>('vscode.executeDocumentSymbolProvider', type.location.uri)) ?? [];
    const owner = findSymbol(members, (s) => s.name === simpleName && s.kind === vscode.SymbolKind.Class);
    const member = owner && findSymbol(owner.children, (s) => s.kind === vscode.SymbolKind.Field && s.name.split(/[\s:]/)[0] === field);
    return [new vscode.Location(type.location.uri, member?.selectionRange ?? owner?.selectionRange ?? type.location.range)];
  }

  dispose(): void {
    this.classpathListener?.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

function findSymbol(symbols: readonly vscode.DocumentSymbol[], match: (s: vscode.DocumentSymbol) => boolean): vscode.DocumentSymbol | undefined {
  for (const symbol of symbols) {
    const found = match(symbol) ? symbol : findSymbol(symbol.children ?? [], match);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/** `context-path` → `contextPath`. */
function camelCase(segment: string): string {
  return segment.replace(/[-_]+([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function isYaml(document: vscode.TextDocument): boolean {
  return /\.ya?ml$/i.test(document.fileName);
}

function lines(document: vscode.TextDocument): string[] {
  return document.getText().split(/\r?\n/);
}

function labels(): { default: string; deprecated: string; use: string } {
  return { default: t('Default'), deprecated: t('Deprecated'), use: t('Use {0}.') };
}
