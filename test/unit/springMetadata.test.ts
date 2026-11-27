import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  canonical,
  describe as describeProperty,
  MetadataIndex,
  propertiesContext,
  propertiesKeyAt,
  remainder,
  shortType,
  yamlContext,
  yamlInsertion,
  yamlKeyAt,
  yamlParents,
} from '../../src/spring/metadata';
import { readZipEntries } from '../../src/spring/zip';

const index = new MetadataIndex([
  {
    properties: [
      { name: 'server.port', type: 'java.lang.Integer', description: 'Server HTTP port.', defaultValue: 8080 },
      { name: 'server.servlet.context-path', type: 'java.lang.String' },
      { name: 'spring.main.lazy-initialization', type: 'java.lang.Boolean', defaultValue: false },
      { name: 'logging.level', type: 'java.util.Map<java.lang.String,java.lang.String>' },
      { name: 'spring.jpa.hibernate.ddl-auto', type: 'java.lang.String' },
      { name: 'server.old', type: 'java.lang.String', deprecation: { reason: 'Gone.', replacement: 'server.new' } },
    ],
    hints: [
      { name: 'logging.level.values', values: [{ value: 'debug' }, { value: 'info' }] },
      { name: 'spring.jpa.hibernate.ddl-auto', values: [{ value: 'none', description: 'Disable DDL handling.' }, { value: 'update' }] },
    ],
  },
  { properties: [{ name: 'server.port', type: 'java.lang.String', description: 'Shadowed by the first source.' }] },
]);

describe('MetadataIndex', () => {
  it('finds keys with relaxed binding, the first source winning', () => {
    expect(index.find('server.port')?.property.description).toBe('Server HTTP port.');
    expect(index.find('server.servlet.contextPath')?.property.name).toBe('server.servlet.context-path');
    expect(index.find('SERVER_SERVLET_CONTEXT_PATH')).toBeUndefined(); // env var form: dots are underscores
    expect(index.size).toBe(6);
  });

  it('resolves keys below a Map property', () => {
    expect(index.find('logging.level.com.example.app')).toMatchObject({ property: { name: 'logging.level' }, mapKey: 'com.example.app' });
    expect(index.find('server.port.extra')).toBeUndefined();
  });

  it('offers hinted values, booleans, and Map values', () => {
    expect(index.values('spring.jpa.hibernate.ddl-auto').map((v) => v.value)).toEqual(['none', 'update']);
    expect(index.values('spring.main.lazy-initialization').map((v) => v.value)).toEqual([true, false]);
    expect(index.values('logging.level.org.hibernate').map((v) => v.value)).toEqual(['debug', 'info']);
    expect(index.values('server.port')).toEqual([]);
  });

  it('canonicalizes keys', () => {
    expect(canonical('spring.datasource.hikari.maximumPoolSize')).toBe(canonical('spring.datasource.hikari.maximum-pool-size'));
    expect(canonical('my.list[0].name')).toBe('my.list.name');
  });
});

describe('documentation', () => {
  it('shortens types and describes properties', () => {
    expect(shortType('java.util.Map<java.lang.String,java.util.List<java.lang.Integer>>')).toBe('Map<String,List<Integer>>');
    const text = describeProperty(index.find('server.old')!.property);
    expect(text).toContain('**Deprecated**: Gone. Use `server.new`.');
    expect(describeProperty(index.find('server.port')!.property)).toContain('Default: `8080`');
  });
});

describe('.properties', () => {
  it('tells keys from values', () => {
    expect(propertiesContext('  server.po')).toMatchObject({ kind: 'key', prefix: 'server.po', start: 2 });
    expect(propertiesContext('server.port = 80')).toMatchObject({ kind: 'value', key: 'server.port', prefix: '80', start: 14 });
    expect(propertiesContext('spring.jpa.hibernate.ddl-auto:')).toMatchObject({ kind: 'value', key: 'spring.jpa.hibernate.ddl-auto', prefix: '' });
    expect(propertiesContext('# server.port')).toBeUndefined();
  });

  it('finds the key under the cursor', () => {
    expect(propertiesKeyAt('server.port=8080', 3)).toEqual({ key: 'server.port', start: 0, end: 11 });
    expect(propertiesKeyAt('server.port=8080', 13)).toBeUndefined();
    expect(propertiesKeyAt('# comment', 2)).toBeUndefined();
  });
});

describe('YAML', () => {
  const yaml = ['spring:', '  jpa:', '    hibernate:', '      ddl-auto: up', '  main:', '    ', 'server:', '  port: 8080', '---', '  '];

  it('computes the enclosing keys', () => {
    expect(yamlParents(yaml, 3, 6)).toEqual(['spring', 'jpa', 'hibernate']);
    expect(yamlParents(yaml, 5, 4)).toEqual(['spring', 'main']);
    expect(yamlParents(yaml, 7, 2)).toEqual(['server']);
    expect(yamlParents(yaml, 9, 2)).toEqual([]); // a new document starts after ---
  });

  it('tells keys from values', () => {
    expect(yamlContext(yaml, 5, '    la')).toMatchObject({ kind: 'key', prefix: 'la', parents: ['spring', 'main'], indent: 4 });
    expect(yamlContext(yaml, 3, '      ddl-auto: up')).toMatchObject({ kind: 'value', key: 'spring.jpa.hibernate.ddl-auto', prefix: 'up', start: 16 });
    expect(yamlContext(yaml, 0, '# spring')).toBeUndefined();
  });

  it('finds the full key under the cursor', () => {
    expect(yamlKeyAt(yaml, 3, 8)).toEqual({ key: 'spring.jpa.hibernate.ddl-auto', start: 6, end: 14 });
    expect(yamlKeyAt(yaml, 7, 9)).toBeUndefined();
  });

  it('builds nested keys below the parents', () => {
    expect(remainder('spring.jpa.hibernate.ddl-auto', ['spring'])).toEqual(['jpa', 'hibernate', 'ddl-auto']);
    expect(remainder('spring.main.lazy-initialization', ['spring.main'])).toEqual(['lazy-initialization']);
    expect(remainder('server.port', ['spring'])).toBeUndefined();
    expect(remainder('server.port', ['server', 'port'])).toBeUndefined();
    expect(yamlInsertion(['jpa', 'hibernate', 'ddl-auto'])).toBe('jpa:\n  hibernate:\n    ddl-auto: ');
  });
});

describe('readZipEntries', () => {
  it('reads stored and deflated entries without extracting the archive', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'unintellij-zip-')), 'test.jar');
    writeFileSync(path, zip([{ name: 'a.txt', data: 'stored', deflate: false }, { name: 'META-INF/m.json', data: '{"x":1}', deflate: true }]));
    const found = await readZipEntries(path, ['META-INF/m.json', 'a.txt', 'missing']);
    expect(found.get('META-INF/m.json')?.toString()).toBe('{"x":1}');
    expect(found.get('a.txt')?.toString()).toBe('stored');
    expect(found.has('missing')).toBe(false);
  });

  it('returns nothing for a file that is not a zip', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'unintellij-zip-')), 'bad.jar');
    writeFileSync(path, 'not a zip');
    expect((await readZipEntries(path, ['a'])).size).toBe(0);
  });
});

/** A minimal zip writer, for the test. */
function zip(entries: { name: string; data: string; deflate: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name);
    const raw = Buffer.from(entry.data);
    const data = entry.deflate ? deflateRawSync(raw) : raw;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(entry.deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(entry.deflate ? 8 : 0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
