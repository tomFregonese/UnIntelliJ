import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { findPackageScripts, startConfiguration } from '../run/configurations';
import { detectJsRunner, javaRunnables, jsTestCommand, jsTests, mavenTestCommand, packageScripts, Runnable } from './discovery';

/** What a gutter item runs. */
type Action =
  | { kind: 'script'; packageJson: vscode.Uri; script: string }
  | { kind: 'javaTest'; file: vscode.Uri; className: string; method?: string }
  | { kind: 'javaMain'; file: vscode.Uri; className: string; springBoot: boolean }
  | { kind: 'jsTest'; file: vscode.Uri; names?: string[] };

const JS_TEST_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/;

/** Nearest ancestor directory of `file` containing `marker`, up to the workspace folder. */
function findUp(file: vscode.Uri, marker: string): string | undefined {
  const root = vscode.workspace.getWorkspaceFolder(file)?.uri.fsPath ?? path.parse(file.fsPath).root;
  for (let dir = path.dirname(file.fsPath); dir.startsWith(root); dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, marker))) {
      return dir;
    }
    if (dir === path.dirname(dir)) {
      break;
    }
  }
  return undefined;
}

/** Runs a shell command as a task in the Run panel; resolves with its exit code. */
function runTask(name: string, cwd: string, command: string, folder: vscode.WorkspaceFolder | undefined): Promise<number | undefined> {
  const task = new vscode.Task({ type: 'unintellij-run', command }, folder ?? vscode.TaskScope.Workspace, name, 'UnIntelliJ', new vscode.ShellExecution(command, { cwd }));
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true };
  return new Promise((resolve, reject) => {
    vscode.tasks.executeTask(task).then((execution) => {
      const listener = vscode.tasks.onDidEndTaskProcess((e) => {
        if (e.execution === execution) {
          listener.dispose();
          resolve(e.exitCode);
        }
      });
    }, reject);
  });
}

/**
 * IntelliJ's green ▶ in the gutter, through VS Code's Testing API (the only way to get a clickable
 * icon left of a line, with Run / Debug and ✓ / ✗ after a run): package.json scripts, Java tests and
 * main classes, TypeScript/JavaScript tests.
 */
export class GutterRunner implements vscode.Disposable {
  private readonly controller = vscode.tests.createTestController('unintellij.gutter', 'UnIntelliJ');
  private readonly actions = new WeakMap<vscode.TestItem, Action>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly disposables: vscode.Disposable[] = [this.controller];

  constructor(private readonly log: vscode.LogOutputChannel) {
    this.controller.createRunProfile('Run', vscode.TestRunProfileKind.Run, (request, token) => this.run(request, token, false), true);
    this.controller.createRunProfile('Debug', vscode.TestRunProfileKind.Debug, (request, token) => this.run(request, token, true), true);
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((d) => this.schedule(d, 0)),
      vscode.workspace.onDidChangeTextDocument((e) => this.schedule(e.document, 500)),
      vscode.workspace.onDidCloseTextDocument((d) => this.controller.items.delete(d.uri.toString())),
    );
    vscode.workspace.textDocuments.forEach((d) => this.schedule(d, 0));
  }

  private schedule(document: vscode.TextDocument, delay: number): void {
    if (document.uri.scheme !== 'file') {
      return;
    }
    const key = document.uri.toString();
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.discover(document);
      }, delay),
    );
  }

  private item(id: string, label: string, uri: vscode.Uri, line: number, action: Action): vscode.TestItem {
    const item = this.controller.createTestItem(id, label, uri);
    item.range = new vscode.Range(line, 0, line, 0);
    this.actions.set(item, action);
    return item;
  }

  private discover(document: vscode.TextDocument): void {
    const uri = document.uri;
    const id = uri.toString();
    const base = path.basename(uri.fsPath);
    const text = document.getText();
    const children: vscode.TestItem[] = [];
    if (base === 'package.json') {
      for (const script of packageScripts(text)) {
        children.push(this.item(`${id}#script:${script.name}`, script.name, uri, script.line, { kind: 'script', packageJson: uri, script: script.name }));
      }
    } else if (document.languageId === 'java' || base.endsWith('.java')) {
      const java = javaRunnables(text);
      // Test Runner for Java draws its own ▶ on tests: avoid two icons on the same line.
      const javaTestExtension = vscode.extensions.getExtension('vscjava.vscode-java-test') !== undefined;
      if (java && java.tests.length > 0 && !javaTestExtension) {
        const cls = this.item(`${id}#class`, java.className.split('.').pop()!, uri, java.classLine, { kind: 'javaTest', file: uri, className: java.className });
        for (const test of java.tests) {
          cls.children.add(this.item(`${id}#test:${test.name}`, test.name, uri, test.line, { kind: 'javaTest', file: uri, className: java.className, method: test.name }));
        }
        children.push(cls);
      }
      if (java?.mainLine !== undefined) {
        const springBoot = /@SpringBootApplication\b/.test(text);
        children.push(this.item(`${id}#main`, `${java.className.split('.').pop()}.main()`, uri, java.mainLine, { kind: 'javaMain', file: uri, className: java.className, springBoot }));
      }
    } else if (JS_TEST_FILE.test(base)) {
      const add = (nodes: Runnable[], parent: vscode.TestItemCollection) => {
        for (const node of nodes) {
          const child = this.item(`${id}#js:${node.id}`, node.label, uri, node.line, { kind: 'jsTest', file: uri, names: node.path });
          add(node.children, child.children);
          parent.add(child);
        }
      };
      const file = this.controller.createTestItem(`${id}#file`, base, uri);
      add(jsTests(text), file.children);
      if (file.children.size > 0) {
        this.actions.set(file, { kind: 'jsTest', file: uri });
        file.children.forEach((c) => children.push(c));
      }
    }
    if (children.length === 0) {
      this.controller.items.delete(id);
      return;
    }
    const root = this.controller.items.get(id) ?? this.controller.createTestItem(id, vscode.workspace.asRelativePath(uri), uri);
    root.children.replace(children);
    this.controller.items.add(root);
  }

  private async run(request: vscode.TestRunRequest, token: vscode.CancellationToken, debug: boolean): Promise<void> {
    const run = this.controller.createTestRun(request);
    const queue: vscode.TestItem[] = [];
    if (request.include) {
      queue.push(...request.include);
    } else {
      this.controller.items.forEach((i) => i.children.forEach((c) => queue.push(c)));
    }
    for (const item of queue) {
      if (token.isCancellationRequested) {
        break;
      }
      const action = this.actions.get(item) ?? this.actions.get([...childrenOf(item)][0]);
      if (!action) {
        continue;
      }
      try {
        await this.execute(item, action, run, debug);
      } catch (error) {
        run.errored(item, new vscode.TestMessage(String(error instanceof Error ? error.message : error)));
      }
    }
    run.end();
  }

  private async execute(item: vscode.TestItem, action: Action, run: vscode.TestRun, debug: boolean): Promise<void> {
    const folder = vscode.workspace.getWorkspaceFolder(action.kind === 'script' ? action.packageJson : action.file);
    switch (action.kind) {
      case 'script': {
        // Like IntelliJ, runs the script as a (temporary) run configuration; no pass/fail state.
        const pkg = (await findPackageScripts()).find((p) => p.packageJson.toString() === action.packageJson.toString());
        if (!pkg) {
          throw new Error('package.json not found in the workspace');
        }
        await startConfiguration(
          { kind: 'npm', id: `npm:${pkg.packageJson.toString()}:${action.script}`, name: action.script, script: action.script, command: '', packageJson: pkg.packageJson, folder: pkg.folder, packageManager: pkg.packageManager },
          debug,
        );
        return;
      }
      case 'javaTest': {
        const dir = findUp(action.file, 'pom.xml');
        if (!dir) {
          throw new Error('No pom.xml found: install "Test Runner for Java" to run tests of other build tools.');
        }
        if (debug) {
          void vscode.window.showInformationMessage('Debugging Java tests needs the "Test Runner for Java" extension; running instead.');
        }
        const leaves = [...leavesOf(item)];
        leaves.forEach((l) => run.started(l));
        const command = mavenTestCommand(existsSync(path.join(dir, 'mvnw')), process.platform === 'win32', action.className, action.method);
        const code = await runTask(action.method ? `${action.className.split('.').pop()}.${action.method}` : action.className, dir, command, folder);
        leaves.forEach((l) => (code === 0 ? run.passed(l) : run.failed(l, new vscode.TestMessage(`Maven exited with code ${code}. See the Run panel for details.`))));
        return;
      }
      case 'javaMain': {
        if (vscode.extensions.getExtension('redhat.java') && vscode.extensions.getExtension('vscjava.vscode-java-debug')) {
          await vscode.debug.startDebugging(folder, { type: 'java', request: 'launch', name: action.className.split('.').pop()!, mainClass: action.className }, { noDebug: !debug });
          return;
        }
        const dir = findUp(action.file, 'pom.xml');
        if (action.springBoot && dir) {
          const mvn = existsSync(path.join(dir, 'mvnw')) ? (process.platform === 'win32' ? '.\\mvnw.cmd' : './mvnw') : 'mvn';
          void runTask(action.className.split('.').pop()!, dir, `${mvn} spring-boot:run`, folder);
          return;
        }
        throw new Error('Running Java applications needs "Language Support for Java" and "Debugger for Java".');
      }
      case 'jsTest': {
        const dir = findUp(action.file, 'package.json');
        if (!dir) {
          throw new Error('No package.json found for this test file.');
        }
        const runner = detectJsRunner(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')));
        const relative = path.relative(dir, action.file.fsPath).split(path.sep).join('/');
        const command = jsTestCommand(runner, relative, action.names);
        if (!command) {
          throw new Error('No test runner (Vitest, Jest or Karma) found in package.json.');
        }
        if (debug) {
          await vscode.debug.startDebugging(folder, { type: 'node-terminal', request: 'launch', name: item.label, command, cwd: dir });
          return;
        }
        const leaves = [...leavesOf(item)];
        leaves.forEach((l) => run.started(l));
        const code = await runTask(item.label, dir, command, folder);
        this.log.info(`Gutter run '${command}' exited with ${code}`);
        leaves.forEach((l) => (code === 0 ? run.passed(l) : run.failed(l, new vscode.TestMessage(`Exited with code ${code}. See the Run panel for details.`))));
        return;
      }
    }
  }

  dispose(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.disposables.forEach((d) => d.dispose());
  }
}

function* childrenOf(item: vscode.TestItem): Generator<vscode.TestItem> {
  const children: vscode.TestItem[] = [];
  item.children.forEach((c) => children.push(c));
  yield* children;
}

/** The item itself if it has no children, else its leaf descendants (results go on each). */
function* leavesOf(item: vscode.TestItem): Generator<vscode.TestItem> {
  if (item.children.size === 0) {
    yield item;
    return;
  }
  for (const child of childrenOf(item)) {
    yield* leavesOf(child);
  }
  yield item;
}
