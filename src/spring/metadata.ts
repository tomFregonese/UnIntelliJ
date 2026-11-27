/**
 * Spring Boot configuration metadata (META-INF/spring-configuration-metadata.json, shipped in the
 * Spring jars and generated for the project's own @ConfigurationProperties) and the parsing of
 * application.properties / application.yml around the cursor. Pure: no `vscode` import.
 */

export interface SpringProperty {
  name: string;
  type?: string;
  description?: string;
  sourceType?: string;
  defaultValue?: unknown;
  deprecated?: boolean;
  deprecation?: { level?: string; reason?: string; replacement?: string };
}

export interface ValueHint {
  value: unknown;
  description?: string;
}

export interface SpringMetadata {
  properties?: SpringProperty[];
  hints?: { name: string; values?: ValueHint[] }[];
}

export const METADATA_FILES = ['META-INF/spring-configuration-metadata.json', 'META-INF/additional-spring-configuration-metadata.json'] as const;

/**
 * Spring's relaxed binding: `server.servlet.context-path`, `server.servlet.contextPath` and
 * `SERVER_SERVLET_CONTEXT_PATH` are the same key. List indexes (`[0]`) are ignored.
 */
export function canonical(key: string): string {
  return key
    .replace(/\[[^\]]*\]/g, '')
    .toLowerCase()
    .replace(/[-_]/g, '');
}

export function isDeprecated(property: SpringProperty): boolean {
  return property.deprecated === true || property.deprecation !== undefined;
}

export class MetadataIndex {
  /** Sorted by name, one per canonical name (the first source wins: the project before its jars). */
  readonly properties: readonly SpringProperty[];
  private readonly byKey = new Map<string, SpringProperty>();
  private readonly hints = new Map<string, ValueHint[]>();

  constructor(sources: readonly SpringMetadata[]) {
    for (const source of sources) {
      for (const property of source.properties ?? []) {
        if (typeof property?.name === 'string' && !this.byKey.has(canonical(property.name))) {
          this.byKey.set(canonical(property.name), property);
        }
      }
      for (const hint of source.hints ?? []) {
        if (typeof hint?.name === 'string' && hint.values?.length && !this.hints.has(canonical(hint.name))) {
          this.hints.set(canonical(hint.name), hint.values);
        }
      }
    }
    this.properties = [...this.byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  get size(): number {
    return this.properties.length;
  }

  /**
   * The property a key sets. A key below a Map property (`logging.level.com.example`) resolves to
   * the Map property, with the rest as `mapKey`.
   */
  find(key: string): { property: SpringProperty; mapKey?: string } | undefined {
    const exact = this.byKey.get(canonical(key));
    if (exact) {
      return { property: exact };
    }
    const segments = key.split('.');
    for (let n = segments.length - 1; n > 0; n--) {
      const property = this.byKey.get(canonical(segments.slice(0, n).join('.')));
      if (property) {
        return property.type?.startsWith('java.util.Map<') ? { property, mapKey: segments.slice(n).join('.') } : undefined;
      }
    }
    return undefined;
  }

  /** Values to offer after `key=`: the metadata hints, else true/false for a boolean. */
  values(key: string): ValueHint[] {
    const found = this.find(key);
    if (!found) {
      return [];
    }
    const name = canonical(found.property.name);
    const hinted = found.mapKey === undefined ? this.hints.get(name) : this.hints.get(`${name}.values`);
    if (hinted) {
      return hinted;
    }
    const type = found.mapKey === undefined ? found.property.type : mapValueType(found.property.type);
    return type === 'java.lang.Boolean' || type === 'boolean' ? [{ value: true }, { value: false }] : [];
  }
}

function mapValueType(type: string | undefined): string | undefined {
  const match = /^java\.util\.Map<[^,<>]+,\s*(.+)>$/.exec(type ?? '');
  return match?.[1];
}

/** `java.util.List<java.lang.String>` → `List<String>`. */
export function shortType(type: string): string {
  return type.replace(/\b(?:[a-z_$][\w$]*\.)+([A-Z][\w$]*)/g, '$1');
}

export interface DescribeLabels {
  default: string;
  deprecated: string;
  /** `{0}` = the replacement property. */
  use: string;
}

/** Markdown documentation of a property (completion details and hover). */
export function describe(property: SpringProperty, labels: DescribeLabels = { default: 'Default', deprecated: 'Deprecated', use: 'Use {0}.' }): string {
  const lines = [`**${property.name}**`];
  if (property.type) {
    lines.push(`\`${shortType(property.type)}\``);
  }
  if (property.description) {
    lines.push(property.description);
  }
  if (property.defaultValue !== undefined) {
    lines.push(`${labels.default}: \`${Array.isArray(property.defaultValue) ? property.defaultValue.join(',') : String(property.defaultValue)}\``);
  }
  if (isDeprecated(property)) {
    const { reason, replacement } = property.deprecation ?? {};
    lines.push(`**${labels.deprecated}**${reason ? `: ${reason}` : ''}${replacement ? ` ${labels.use.replace('{0}', `\`${replacement}\``)}` : ''}`);
  }
  return lines.join('\n\n');
}

export type Context = { kind: 'key'; prefix: string; start: number; parents: string[]; indent: number } | { kind: 'value'; key: string; prefix: string; start: number };

/** What the cursor is on in a .properties line (`before` = the line up to the cursor). */
export function propertiesContext(before: string): Context | undefined {
  const indent = before.length - before.trimStart().length;
  if (/^[#!]/.test(before.trimStart())) {
    return undefined;
  }
  const separator = before.search(/[=:]/);
  if (separator < 0) {
    return { kind: 'key', prefix: before.slice(indent), start: indent, parents: [], indent };
  }
  const value = before.slice(separator + 1).trimStart();
  return { kind: 'value', key: before.slice(indent, separator).trim(), prefix: value, start: before.length - value.length };
}

/** The key of a .properties line and its columns, when `character` is on it. */
export function propertiesKeyAt(line: string, character: number): { key: string; start: number; end: number } | undefined {
  const match = /^(\s*)([^#!\s=:][^=:]*?)\s*(?:[=:]|$)/.exec(line);
  if (!match) {
    return undefined;
  }
  const start = match[1].length;
  const end = start + match[2].length;
  return character >= start && character <= end ? { key: match[2], start, end } : undefined;
}

const YAML_KEY = /^(\s*(?:-\s+)?)([^\s:#'"-][^:#]*?)\s*:(?:\s|$)/;

/** Keys of the YAML lines enclosing a line whose key starts at column `indent`. */
export function yamlParents(lines: readonly string[], line: number, indent: number): string[] {
  const parents: string[] = [];
  for (let i = line - 1; i >= 0 && indent > 0; i--) {
    if (/^(---|\.\.\.)\s*$/.test(lines[i])) {
      break;
    }
    const match = YAML_KEY.exec(lines[i]);
    if (match && match[1].length < indent) {
      parents.unshift(match[2]);
      indent = match[1].length;
    }
  }
  return parents;
}

/** What the cursor is on in an application.yml line (`before` = the line up to the cursor). */
export function yamlContext(lines: readonly string[], line: number, before: string): Context | undefined {
  if (/^\s*#/.test(before)) {
    return undefined;
  }
  const key = /^(\s*(?:-\s+)?)([^:#\s'"][^:#]*|)$/.exec(before);
  if (key) {
    const indent = key[1].length;
    return { kind: 'key', prefix: key[2], start: indent, parents: yamlParents(lines, line, indent), indent };
  }
  const value = /^(\s*(?:-\s+)?)([^:#]+):\s+(.*)$/.exec(before);
  if (value && !value[3].startsWith('#')) {
    const indent = value[1].length;
    return { kind: 'value', key: [...yamlParents(lines, line, indent), value[2].trim()].join('.'), prefix: value[3], start: before.length - value[3].length };
  }
  return undefined;
}

/** The full dotted key of a YAML line and the columns of its own key, when `character` is on it. */
export function yamlKeyAt(lines: readonly string[], line: number, character: number): { key: string; start: number; end: number } | undefined {
  const match = YAML_KEY.exec(lines[line]);
  if (!match) {
    return undefined;
  }
  const start = match[1].length;
  const end = start + match[2].length;
  if (character < start || character > end) {
    return undefined;
  }
  return { key: [...yamlParents(lines, line, start), match[2]].join('.'), start, end };
}

/**
 * The part of `name` below `parents` (YAML nesting), or undefined when `name` is elsewhere.
 * `parents` may use another spelling (relaxed binding) and dotted keys.
 */
export function remainder(name: string, parents: readonly string[]): string[] | undefined {
  const wanted = parents.flatMap((p) => p.split('.')).map(canonical);
  const segments = name.split('.');
  if (segments.length <= wanted.length || wanted.some((w, i) => canonical(segments[i]) !== w)) {
    return undefined;
  }
  return segments.slice(wanted.length);
}

/** YAML to insert for the remaining segments: nested keys, indented by `step` spaces per level. */
export function yamlInsertion(segments: readonly string[], step = 2): string {
  return segments.map((segment, i) => `${i === 0 ? '' : `\n${' '.repeat(step * i)}`}${segment}:`).join('') + ' ';
}

/** Turns a hint value into text, for completion. */
export function valueText(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
