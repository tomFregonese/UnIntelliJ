/**
 * Maven `pom.xml` reading and Maven command lines for the Maven tool window. Pure: no `vscode`
 * import. Only the pom itself is read (no effective pom, no parent download): what IntelliJ shows
 * before importing is enough for running goals.
 */

export interface XmlElement {
  name: string;
  children: XmlElement[];
  text: string;
}

/** Small tolerant XML reader (elements and text; attributes, comments, CDATA and prolog are skipped). */
export function parseXml(xml: string): XmlElement {
  const root: XmlElement = { name: '#document', children: [], text: '' };
  const stack: XmlElement[] = [root];
  const pattern = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/\s*([\w.:-]+)\s*>|<\s*([\w.:-]+)((?:\s+[\w.:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const match of xml.matchAll(pattern)) {
    const current = stack[stack.length - 1];
    if (match[1] !== undefined) {
      current.text += match[1];
    } else if (match[2]) {
      if (stack.length > 1 && current.name === match[2].replace(/^.*:/, '')) {
        stack.pop();
      }
    } else if (match[3]) {
      const element: XmlElement = { name: match[3].replace(/^.*:/, ''), children: [], text: '' };
      current.children.push(element);
      if (!match[5]) {
        stack.push(element);
      }
    } else if (match[6]) {
      current.text += decodeEntities(match[6]);
    }
  }
  return root;
}

function decodeEntities(text: string): string {
  return text.replace(/&(lt|gt|amp|quot|apos);/g, (_, e: string) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[e]!);
}

function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((c) => c.name === name);
}

function children(element: XmlElement | undefined, name: string): XmlElement[] {
  return element?.children.filter((c) => c.name === name) ?? [];
}

function text(element: XmlElement | undefined, name: string): string | undefined {
  const value = child(element, name)?.text.trim();
  return value ? value : undefined;
}

export interface Dependency {
  groupId: string;
  artifactId: string;
  version?: string;
  scope: string;
  optional: boolean;
}

export interface Plugin {
  groupId: string;
  artifactId: string;
  version?: string;
  /** Goal prefix (`spring-boot` for spring-boot-maven-plugin). */
  prefix: string;
}

export interface Profile {
  id: string;
  activeByDefault: boolean;
}

export interface Pom {
  groupId?: string;
  artifactId: string;
  version?: string;
  name?: string;
  packaging: string;
  parent?: { groupId?: string; artifactId?: string; version?: string };
  modules: string[];
  dependencies: Dependency[];
  plugins: Plugin[];
  profiles: Profile[];
}

/** Reads a pom.xml; `${property}` references are resolved from its properties and project coordinates. */
export function parsePom(xml: string): Pom {
  const project = child(parseXml(xml), 'project');
  if (!project) {
    throw new Error('Not a Maven pom: no <project> element');
  }
  const parent = child(project, 'parent');
  const properties: Record<string, string> = {};
  for (const property of child(project, 'properties')?.children ?? []) {
    properties[property.name] = property.text.trim();
  }
  const coordinates = {
    groupId: text(project, 'groupId') ?? text(parent, 'groupId'),
    artifactId: text(project, 'artifactId') ?? '',
    version: text(project, 'version') ?? text(parent, 'version'),
  };
  for (const [key, value] of Object.entries(coordinates)) {
    if (value) {
      properties[`project.${key}`] = value;
      properties[`pom.${key}`] = value;
    }
  }
  if (parent) {
    properties['project.parent.version'] = text(parent, 'version') ?? '';
  }
  const resolve = (value: string | undefined): string | undefined => {
    let result = value;
    // A few passes for properties defined from other properties.
    for (let i = 0; i < 5 && result?.includes('${'); i++) {
      result = result.replace(/\$\{([^}]+)\}/g, (whole, key: string) => properties[key] ?? whole);
    }
    return result;
  };
  const build = child(project, 'build');
  return {
    ...coordinates,
    groupId: resolve(coordinates.groupId),
    version: resolve(coordinates.version),
    name: resolve(text(project, 'name')),
    packaging: text(project, 'packaging') ?? 'jar',
    parent: parent && { groupId: text(parent, 'groupId'), artifactId: text(parent, 'artifactId'), version: text(parent, 'version') },
    modules: children(child(project, 'modules'), 'module').map((m) => m.text.trim()).filter(Boolean),
    dependencies: children(child(project, 'dependencies'), 'dependency').map((d) => ({
      groupId: resolve(text(d, 'groupId')) ?? '',
      artifactId: resolve(text(d, 'artifactId')) ?? '',
      version: resolve(text(d, 'version')),
      scope: text(d, 'scope') ?? 'compile',
      optional: text(d, 'optional') === 'true',
    })),
    plugins: children(child(build, 'plugins'), 'plugin').map((p) => {
      const artifactId = resolve(text(p, 'artifactId')) ?? '';
      return { groupId: resolve(text(p, 'groupId')) ?? 'org.apache.maven.plugins', artifactId, version: resolve(text(p, 'version')), prefix: pluginPrefix(artifactId) };
    }),
    profiles: children(child(project, 'profiles'), 'profile').map((p) => ({
      id: text(p, 'id') ?? '',
      activeByDefault: text(child(p, 'activation'), 'activeByDefault') === 'true',
    })),
  };
}

/** Maven's goal prefix convention: maven-X-plugin → X, X-maven-plugin → X. */
export function pluginPrefix(artifactId: string): string {
  return artifactId.replace(/^maven-(.+)-plugin$/, '$1').replace(/^(.+)-maven-plugin$/, '$1');
}

/** IntelliJ's Lifecycle node (default and clean / site lifecycles, main phases only). */
export const LIFECYCLE = ['clean', 'validate', 'compile', 'test', 'package', 'verify', 'install', 'site', 'deploy'] as const;

/** Goals of common plugins, shown under Plugins (Maven only knows them from plugin descriptors). */
export const KNOWN_GOALS: Record<string, string[]> = {
  clean: ['clean'],
  compiler: ['compile', 'testCompile'],
  surefire: ['test'],
  failsafe: ['integration-test', 'verify'],
  resources: ['resources', 'testResources'],
  jar: ['jar', 'test-jar'],
  war: ['war', 'exploded'],
  install: ['install'],
  deploy: ['deploy'],
  site: ['site'],
  dependency: ['tree', 'analyze', 'resolve', 'copy-dependencies'],
  'spring-boot': ['run', 'start', 'stop', 'repackage', 'build-image', 'build-info'],
  quarkus: ['dev', 'build'],
  exec: ['exec', 'java'],
  jacoco: ['prepare-agent', 'report'],
  versions: ['display-dependency-updates', 'display-plugin-updates'],
  frontend: ['install-node-and-npm', 'npm'],
  flyway: ['migrate', 'info', 'clean'],
  liquibase: ['update', 'status'],
  checkstyle: ['check'],
  spotless: ['apply', 'check'],
  javadoc: ['javadoc'],
  source: ['jar'],
  assembly: ['single'],
  shade: ['shade'],
};

export interface MavenOptions {
  /** `mvn`, or the project's wrapper (`./mvnw`, `mvnw.cmd`). */
  executable: string;
  goals: readonly string[];
  /** pom.xml relative to the working directory, when not `pom.xml` itself. */
  pomFile?: string;
  offline?: boolean;
  skipTests?: boolean;
  /** Profiles explicitly enabled (`id`) or disabled (`!id`). */
  profiles?: readonly string[];
}

/** Arguments after the executable, IntelliJ order: goals, then -f, -o, -DskipTests, -P. */
export function mavenArgs(options: MavenOptions): string[] {
  const args = [...options.goals];
  if (options.pomFile && options.pomFile !== 'pom.xml') {
    args.push('-f', options.pomFile);
  }
  if (options.offline) {
    args.push('-o');
  }
  if (options.skipTests) {
    args.push('-DskipTests');
  }
  if (options.profiles && options.profiles.length > 0) {
    args.push(`-P${options.profiles.join(',')}`);
  }
  return args;
}

/** Splits "clean install -DskipTests" typed in Run Maven Goal into words (quotes keep spaces). */
export function splitCommandLine(line: string): string[] {
  return [...line.matchAll(/(?:"[^"]*"|'[^']*'|[^\s"'])+/g)].map((m) => m[0].replace(/"([^"]*)"|'([^']*)'/g, (_, d: string | undefined, q: string | undefined) => d ?? q ?? ''));
}

/** Display name of a project: <name>, else artifactId (IntelliJ). */
export function projectLabel(pom: Pom): string {
  return pom.name ?? pom.artifactId;
}

/** "groupId:artifactId:version" with the scope when not compile, as in IntelliJ's Dependencies node. */
export function dependencyLabel(dependency: Dependency): { label: string; description?: string } {
  const label = `${dependency.groupId}:${dependency.artifactId}${dependency.version ? `:${dependency.version}` : ''}`;
  const notes = [dependency.scope !== 'compile' ? dependency.scope : '', dependency.optional ? 'optional' : ''].filter(Boolean);
  return { label, description: notes.length > 0 ? notes.join(', ') : undefined };
}
