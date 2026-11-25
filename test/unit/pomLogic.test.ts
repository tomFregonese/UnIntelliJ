import { describe, expect, it } from 'vitest';
import { dependencyLabel, mavenArgs, parsePom, pluginPrefix, splitCommandLine } from '../../src/maven/pomLogic';

const pom = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <modelVersion>4.0.0</modelVersion>
  <!-- <artifactId>commented</artifactId> -->
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.4</version>
    <relativePath/>
  </parent>
  <groupId>com.example</groupId>
  <artifactId>demo</artifactId>
  <name>Demo &amp; Co</name>
  <packaging>pom</packaging>
  <properties>
    <java.version>21</java.version>
    <mapstruct.version>1.6.2</mapstruct.version>
  </properties>
  <modules><module>api</module><module>web</module></modules>
  <dependencies>
    <dependency><groupId>org.mapstruct</groupId><artifactId>mapstruct</artifactId><version>\${mapstruct.version}</version></dependency>
    <dependency><groupId>org.junit.jupiter</groupId><artifactId>junit-jupiter</artifactId><scope>test</scope></dependency>
  </dependencies>
  <build><plugins>
    <plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin>
    <plugin><artifactId>maven-surefire-plugin</artifactId><version>3.2.5</version></plugin>
  </plugins></build>
  <profiles>
    <profile><id>dev</id><activation><activeByDefault>true</activeByDefault></activation></profile>
    <profile><id>prod</id></profile>
  </profiles>
</project>`;

describe('pom.xml', () => {
  const parsed = parsePom(pom);

  it('reads coordinates, inheriting the version from the parent', () => {
    expect(parsed).toMatchObject({ groupId: 'com.example', artifactId: 'demo', version: '3.3.4', name: 'Demo & Co', packaging: 'pom', modules: ['api', 'web'] });
  });

  it('resolves property references in dependencies', () => {
    expect(parsed.dependencies.map(dependencyLabel)).toEqual([{ label: 'org.mapstruct:mapstruct:1.6.2' }, { label: 'org.junit.jupiter:junit-jupiter', description: 'test' }]);
  });

  it('lists plugins with their goal prefix and profiles', () => {
    expect(parsed.plugins.map((p) => p.prefix)).toEqual(['spring-boot', 'surefire']);
    expect(parsed.plugins[1].groupId).toBe('org.apache.maven.plugins');
    expect(parsed.profiles).toEqual([{ id: 'dev', activeByDefault: true }, { id: 'prod', activeByDefault: false }]);
  });

  it('rejects files that are not poms', () => {
    expect(() => parsePom('<settings/>')).toThrow();
  });
});

describe('Maven command line', () => {
  it('adds pom, offline, skip tests and profiles after the goals', () => {
    expect(mavenArgs({ executable: 'mvn', goals: ['clean', 'install'], pomFile: 'api/pom.xml', offline: true, skipTests: true, profiles: ['dev', '!prod'] })).toEqual(['clean', 'install', '-f', 'api/pom.xml', '-o', '-DskipTests', '-Pdev,!prod']);
    expect(mavenArgs({ executable: 'mvn', goals: ['test'], pomFile: 'pom.xml' })).toEqual(['test']);
  });

  it('splits a typed goal line and finds plugin prefixes', () => {
    expect(splitCommandLine('spring-boot:run -Dspring-boot.run.arguments="--a --b"')).toEqual(['spring-boot:run', '-Dspring-boot.run.arguments=--a --b']);
    expect(pluginPrefix('maven-compiler-plugin')).toBe('compiler');
    expect(pluginPrefix('jacoco-maven-plugin')).toBe('jacoco');
  });
});
