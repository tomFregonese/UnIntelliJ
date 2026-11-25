/**
 * Eclipse launch configurations (`*.launch` files committed in the repository): reading and
 * translation to VS Code. Nothing is written back; Eclipse keeps working with the same files.
 * Pure: no `vscode` import.
 */
import { parseXml, XmlElement } from '../xml';

export type EclipseLaunchKind = 'java' | 'remote' | 'maven' | 'junit' | 'unsupported';

export interface EclipseLaunch {
  /** File name without `.launch`: Eclipse's configuration name. */
  name: string;
  kind: EclipseLaunchKind;
  /** Eclipse type id, shown for unsupported types. */
  type: string;
  project?: string;
  mainType?: string;
  programArgs?: string;
  vmArgs?: string;
  workingDir?: string;
  env: Record<string, string>;
  /** Maven (m2e) */
  goals?: string;
  profiles?: string;
  offline?: boolean;
  skipTests?: boolean;
  properties?: string[];
  /** JUnit: test method, or container (package / folder) when no class. */
  testMethod?: string;
  testContainer?: string;
  /** Remote Java Application */
  host?: string;
  port?: number;
  /** Spring Boot launch (Spring Tools for Eclipse) */
  springProfile?: string;
}

const TYPES: Record<string, EclipseLaunchKind> = {
  'org.eclipse.jdt.launching.localJavaApplication': 'java',
  'org.springframework.ide.eclipse.boot.launch': 'java',
  'org.eclipse.jdt.launching.remoteJavaApplication': 'remote',
  'org.eclipse.m2e.Maven2LaunchConfigurationType': 'maven',
  'org.eclipse.jdt.junit.launchconfig': 'junit',
};

function attributes(root: XmlElement): Map<string, XmlElement> {
  const map = new Map<string, XmlElement>();
  for (const element of root.children) {
    if (element.attributes.key) {
      map.set(element.attributes.key, element);
    }
  }
  return map;
}

export function parseLaunch(name: string, xml: string): EclipseLaunch {
  const root = parseXml(xml).children.find((c) => c.name === 'launchConfiguration');
  if (!root) {
    throw new Error('Not an Eclipse launch configuration');
  }
  const type = root.attributes.type ?? '';
  const attrs = attributes(root);
  const str = (key: string): string | undefined => {
    const value = attrs.get(key)?.attributes.value;
    return value === undefined || value === '' ? undefined : value;
  };
  const bool = (key: string): boolean => attrs.get(key)?.attributes.value === 'true';
  const list = (key: string): string[] => attrs.get(key)?.children.map((c) => c.attributes.value ?? '').filter(Boolean) ?? [];
  const env: Record<string, string> = {};
  for (const entry of attrs.get('org.eclipse.debug.core.environmentVariables')?.children ?? []) {
    if (entry.attributes.key) {
      env[entry.attributes.key] = entry.attributes.value ?? '';
    }
  }
  const connect: Record<string, string> = {};
  for (const entry of attrs.get('org.eclipse.jdt.launching.CONNECT_MAP')?.children ?? []) {
    if (entry.attributes.key) {
      connect[entry.attributes.key] = entry.attributes.value ?? '';
    }
  }
  const kind = TYPES[type] ?? 'unsupported';
  return {
    name,
    kind,
    type,
    project: str('org.eclipse.jdt.launching.PROJECT_ATTR'),
    mainType: str('org.eclipse.jdt.launching.MAIN_TYPE'),
    programArgs: str('org.eclipse.jdt.launching.PROGRAM_ARGUMENTS'),
    vmArgs: str('org.eclipse.jdt.launching.VM_ARGUMENTS'),
    workingDir: str('org.eclipse.jdt.launching.WORKING_DIRECTORY'),
    env,
    goals: str('M2_GOALS'),
    profiles: str('M2_PROFILES'),
    offline: bool('M2_OFFLINE'),
    skipTests: bool('M2_SKIP_TESTS'),
    properties: list('M2_PROPERTIES'),
    testMethod: str('org.eclipse.jdt.junit.TESTNAME'),
    testContainer: str('org.eclipse.jdt.junit.CONTAINER'),
    host: connect.hostname,
    port: connect.port ? Number(connect.port) : undefined,
    springProfile: str('spring.boot.profile'),
  };
}

export interface VariableContext {
  /** Directory of an Eclipse project by name (from its .project file), or undefined. */
  projectDir(name: string): string | undefined;
  /** Workspace root (Eclipse's workspace_loc). */
  workspace: string;
  /** The launch's own project, for `${project_loc}` / `${project_name}`. */
  project?: string;
  env: Record<string, string | undefined>;
  systemProperties: Record<string, string>;
}

/**
 * Replaces Eclipse string variables: ${workspace_loc[:/project/path]}, ${project_loc[:name]},
 * ${project_name}, ${env_var:NAME}, ${system_property:name}. Unknown ones are left as is and listed.
 */
export function resolveVariables(text: string, context: VariableContext): { value: string; unsupported: string[] } {
  const unsupported: string[] = [];
  const projectPath = (spec: string): string | undefined => {
    const [project, ...rest] = spec.replace(/^[/\\]/, '').split(/[/\\]/);
    const dir = context.projectDir(project);
    return dir === undefined ? undefined : [dir, ...rest].join('/');
  };
  const value = text.replace(/\$\{([\w.]+)(?::([^}]*))?\}/g, (whole, name: string, arg: string | undefined) => {
    let result: string | undefined;
    switch (name) {
      case 'workspace_loc':
        result = arg ? projectPath(arg) : context.workspace;
        break;
      case 'project_loc':
        result = arg ? projectPath(arg) : context.project ? context.projectDir(context.project) : undefined;
        break;
      case 'project_name':
        result = context.project;
        break;
      case 'env_var':
        result = arg ? (context.env[arg] ?? '') : undefined;
        break;
      case 'system_property':
        result = arg ? context.systemProperties[arg] : undefined;
        break;
    }
    if (result === undefined) {
      unsupported.push(whole);
      return whole;
    }
    return result;
  });
  return { value, unsupported };
}

/** Maven arguments of an m2e launch (goals, profiles, offline, skip tests, -Dkey=value). */
export function m2eArgs(launch: EclipseLaunch): string[] {
  const args = (launch.goals ?? '').split(/\s+/).filter(Boolean);
  if (launch.profiles?.trim()) {
    args.push(`-P${launch.profiles.trim().split(/[\s,]+/).join(',')}`);
  }
  if (launch.offline) {
    args.push('-o');
  }
  if (launch.skipTests) {
    args.push('-DskipTests');
  }
  for (const property of launch.properties ?? []) {
    args.push(`-D${property}`);
  }
  return args;
}

/** Maven Surefire arguments running a JUnit launch: class, class#method, or every test of the project. */
export function junitMavenArgs(launch: EclipseLaunch): string[] {
  if (!launch.mainType) {
    return ['test'];
  }
  return ['test', `-Dtest=${launch.mainType}${launch.testMethod ? `#${launch.testMethod.replace(/\(.*$/, '')}` : ''}`, '-Dsurefire.failIfNoSpecifiedTests=false'];
}

/** Name of the project declared in an Eclipse `.project` file. */
export function eclipseProjectName(xml: string): string | undefined {
  const description = parseXml(xml).children.find((c) => c.name === 'projectDescription');
  return description?.children.find((c) => c.name === 'name')?.text.trim() || undefined;
}

/** VM arguments with the Spring profile of a Spring Boot launch added, like Spring Tools does. */
export function vmArgsWithProfile(launch: EclipseLaunch): string | undefined {
  const profile = launch.springProfile ? `-Dspring.profiles.active=${launch.springProfile}` : '';
  return [launch.vmArgs ?? '', profile].filter(Boolean).join(' ') || undefined;
}
