/**
 * Finds what can be run from the gutter: package.json scripts, Java tests and main classes,
 * TypeScript/JavaScript describe/it blocks. Text based (fast, no language server needed).
 * Pure: no `vscode` import. Lines are 0-based.
 */
import { visit } from 'jsonc-parser';

export interface Runnable {
  id: string;
  label: string;
  line: number;
  /** Names from the outermost describe down to this block. */
  path: string[];
  children: Runnable[];
}

/** Line of each script in package.json `"scripts"`. */
export function packageScripts(text: string): { name: string; line: number }[] {
  const scripts: { name: string; line: number }[] = [];
  const path: string[] = [];
  let depth = 0;
  visit(text, {
    onObjectBegin: () => {
      depth++;
    },
    onObjectEnd: () => {
      depth--;
      path.length = Math.min(path.length, depth);
    },
    onObjectProperty: (property, _offset, _length, startLine) => {
      path.length = depth - 1;
      path.push(property);
      if (depth === 2 && path[0] === 'scripts') {
        scripts.push({ name: property, line: startLine });
      }
    },
  });
  return scripts;
}

const TEST_ANNOTATION = /@(Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate)\b/;

export interface JavaRunnables {
  /** Fully qualified name of the top-level class. */
  className: string;
  classLine: number;
  tests: { name: string; line: number }[];
  /** Line of `main` or of the `@SpringBootApplication` class, if any. */
  mainLine?: number;
}

/** Strips comments and string contents, keeping line breaks, so that regexes see only code. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\\n])*"/g, (match) => (match.startsWith('"') ? '""' : match.replace(/[^\n]/g, ' ')));
}

export function javaRunnables(text: string): JavaRunnables | undefined {
  const lines = codeOnly(text).split('\n');
  const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(text)?.[1];
  const classIndex = lines.findIndex((l) => /\b(class|record|enum|interface)\s+\w+/.test(l) && !/^\s*import\b/.test(l));
  if (classIndex < 0) {
    return undefined;
  }
  const simpleName = /\b(?:class|record|enum|interface)\s+(\w+)/.exec(lines[classIndex])![1];
  const result: JavaRunnables = { className: pkg ? `${pkg}.${simpleName}` : simpleName, classLine: classIndex, tests: [] };
  let pendingTest = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (TEST_ANNOTATION.test(line)) {
      pendingTest = true;
    }
    if (/@SpringBootApplication\b/.test(line) && result.mainLine === undefined) {
      result.mainLine = classIndex;
    }
    const method = /^\s*(?:(?:public|protected|private|static|final|synchronized|abstract|default)\s+)*(?:<[^>]+>\s+)?[\w.<>[\],?\s]+?\s+(\w+)\s*\(/.exec(line);
    if (method && !/\b(new|return|if|for|while|switch|catch)\b/.test(line.slice(0, method.index + method[0].length - method[1].length - 1))) {
      if (pendingTest) {
        result.tests.push({ name: method[1], line: i });
      }
      if (method[1] === 'main' && /\bstatic\b/.test(line) && /\bvoid\b/.test(line) && result.mainLine === undefined) {
        result.mainLine = i;
      }
      pendingTest = false;
    }
  }
  return result;
}

const JS_BLOCK = /^\s*(describe|fdescribe|xdescribe|it|fit|xit|test)(?:\.(?:only|skip|each\([^)]*\)))?\s*\(\s*(['"`])((?:\\.|(?!\2).)*)\2/;

/** describe / it / test blocks, nested by indentation-independent brace counting. */
export function jsTests(text: string): Runnable[] {
  const roots: Runnable[] = [];
  const stack: { node: Runnable; depth: number }[] = [];
  let depth = 0;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = JS_BLOCK.exec(line);
    if (match) {
      while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      const parent = stack[stack.length - 1]?.node;
      const name = match[3];
      const node: Runnable = { id: `${parent ? `${parent.id} ` : ''}${name}`, label: name, line: i, path: [...(parent?.path ?? []), name], children: [] };
      (parent ? parent.children : roots).push(node);
      if (match[1].endsWith('describe')) {
        stack.push({ node, depth });
      }
    }
    for (const char of line.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '')) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
      }
    }
  }
  return roots;
}

/** JS test runner used by the project, from package.json dependencies. */
export type JsRunner = 'vitest' | 'jest' | 'karma' | undefined;

export function detectJsRunner(packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }): JsRunner {
  const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
  if ('vitest' in deps) {
    return 'vitest';
  }
  if ('jest' in deps || 'jest-preset-angular' in deps) {
    return 'jest';
  }
  if ('karma' in deps || '@angular-devkit/build-angular' in deps) {
    return 'karma';
  }
  return undefined;
}

/** Escapes a test name for the `-t` regex filter of vitest / jest. */
export function testNamePattern(fullName: string): string {
  return `^${fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}

/**
 * Shell command that runs a JS test file, optionally filtered to one test or describe (`names`:
 * describe names down to the block). Vitest joins them with " > ", Jest with a space.
 */
export function jsTestCommand(runner: JsRunner, relativeFile: string, names?: readonly string[]): string | undefined {
  const quote = (s: string) => `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
  const filter = (separator: string) => (names && names.length > 0 ? ` -t ${quote(testNamePattern(names.join(separator)).replace(/\$$/, ''))}` : '');
  switch (runner) {
    case 'vitest':
      return `npx vitest run ${quote(relativeFile)}${filter(' > ')}`;
    case 'jest':
      return `npx jest ${quote(relativeFile)}${filter(' ')}`;
    case 'karma':
      // Karma cannot filter by name from the command line: the whole spec file runs.
      return `npx ng test --watch=false --include ${quote(relativeFile)}`;
    default:
      return undefined;
  }
}

/** Maven command for a test class or method, using the wrapper when present. */
export function mavenTestCommand(wrapper: boolean, windows: boolean, className: string, method?: string): string {
  const mvn = wrapper ? (windows ? '.\\mvnw.cmd' : './mvnw') : 'mvn';
  return `${mvn} -q test -Dtest=${className}${method ? `#${method}` : ''} -Dsurefire.failIfNoSpecifiedTests=false`;
}
