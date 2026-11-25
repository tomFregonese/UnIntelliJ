import { describe, expect, it } from 'vitest';
import { eclipseProjectName, junitMavenArgs, m2eArgs, parseLaunch, resolveVariables, vmArgsWithProfile } from '../../src/run/eclipseLaunch';

const javaApp = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<launchConfiguration type="org.eclipse.jdt.launching.localJavaApplication">
  <listAttribute key="org.eclipse.debug.core.MAPPED_RESOURCE_PATHS"><listEntry value="/backend/src/main/java/com/acme/App.java"/></listAttribute>
  <mapAttribute key="org.eclipse.debug.core.environmentVariables"><mapEntry key="DB_URL" value="jdbc:postgresql://localhost/app"/></mapAttribute>
  <stringAttribute key="org.eclipse.jdt.launching.MAIN_TYPE" value="com.acme.App"/>
  <stringAttribute key="org.eclipse.jdt.launching.PROGRAM_ARGUMENTS" value="--port=8081"/>
  <stringAttribute key="org.eclipse.jdt.launching.PROJECT_ATTR" value="backend"/>
  <stringAttribute key="org.eclipse.jdt.launching.VM_ARGUMENTS" value="-Xmx1g&#10;-Dconfig=\${workspace_loc:/backend/conf}/app.yml"/>
  <stringAttribute key="org.eclipse.jdt.launching.WORKING_DIRECTORY" value="\${workspace_loc:backend}"/>
</launchConfiguration>`;

const maven = `<launchConfiguration type="org.eclipse.m2e.Maven2LaunchConfigurationType">
  <stringAttribute key="M2_GOALS" value="clean install"/>
  <stringAttribute key="M2_PROFILES" value="dev, local"/>
  <booleanAttribute key="M2_SKIP_TESTS" value="true"/>
  <booleanAttribute key="M2_OFFLINE" value="false"/>
  <listAttribute key="M2_PROPERTIES"><listEntry value="env=dev"/></listAttribute>
  <stringAttribute key="org.eclipse.jdt.launching.WORKING_DIRECTORY" value="\${project_loc:backend}"/>
</launchConfiguration>`;

const context = {
  projectDir: (name: string) => (name === 'backend' ? '/repo/backend' : undefined),
  workspace: '/repo',
  project: 'backend',
  env: { HOME: '/home/me' },
  systemProperties: { 'user.home': '/home/me' },
};

describe('Eclipse launch configurations', () => {
  it('reads a Java application', () => {
    const launch = parseLaunch('Backend', javaApp);
    expect(launch).toMatchObject({ kind: 'java', mainType: 'com.acme.App', project: 'backend', programArgs: '--port=8081', env: { DB_URL: 'jdbc:postgresql://localhost/app' } });
    expect(launch.vmArgs).toBe('-Xmx1g\n-Dconfig=${workspace_loc:/backend/conf}/app.yml');
  });

  it('resolves Eclipse variables and reports unknown ones', () => {
    expect(resolveVariables('${workspace_loc:/backend/conf}/app.yml', context)).toEqual({ value: '/repo/backend/conf/app.yml', unsupported: [] });
    expect(resolveVariables('${project_loc} ${env_var:HOME} ${system_property:user.home}', context).value).toBe('/repo/backend /home/me /home/me');
    expect(resolveVariables('${string_prompt:Port}', context).unsupported).toEqual(['${string_prompt:Port}']);
  });

  it('turns an m2e launch into Maven arguments', () => {
    const launch = parseLaunch('Build', maven);
    expect(launch.kind).toBe('maven');
    expect(m2eArgs(launch)).toEqual(['clean', 'install', '-Pdev,local', '-DskipTests', '-Denv=dev']);
  });

  it('runs JUnit launches with Surefire', () => {
    const launch = parseLaunch('AppTest', `<launchConfiguration type="org.eclipse.jdt.junit.launchconfig"><stringAttribute key="org.eclipse.jdt.launching.MAIN_TYPE" value="com.acme.AppTest"/><stringAttribute key="org.eclipse.jdt.junit.TESTNAME" value="starts"/></launchConfiguration>`);
    expect(junitMavenArgs(launch)).toEqual(['test', '-Dtest=com.acme.AppTest#starts', '-Dsurefire.failIfNoSpecifiedTests=false']);
  });

  it('reads remote debug, Spring Boot profiles, unsupported types and .project names', () => {
    const remote = parseLaunch('Attach', `<launchConfiguration type="org.eclipse.jdt.launching.remoteJavaApplication"><mapAttribute key="org.eclipse.jdt.launching.CONNECT_MAP"><mapEntry key="hostname" value="localhost"/><mapEntry key="port" value="5005"/></mapAttribute></launchConfiguration>`);
    expect(remote).toMatchObject({ kind: 'remote', host: 'localhost', port: 5005 });
    const boot = parseLaunch('Boot', `<launchConfiguration type="org.springframework.ide.eclipse.boot.launch"><stringAttribute key="spring.boot.profile" value="dev"/><stringAttribute key="org.eclipse.jdt.launching.VM_ARGUMENTS" value="-Xmx512m"/></launchConfiguration>`);
    expect(vmArgsWithProfile(boot)).toBe('-Xmx512m -Dspring.profiles.active=dev');
    expect(parseLaunch('Tomcat', '<launchConfiguration type="org.eclipse.jst.server.tomcat.core.launchConfigurationType"/>').kind).toBe('unsupported');
    expect(eclipseProjectName('<?xml version="1.0"?><projectDescription><name>backend</name><comment/></projectDescription>')).toBe('backend');
  });
});
