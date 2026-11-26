import { describe, expect, it } from 'vitest';
import { recentProjects } from '../../src/project/recentProjects';

const uri = (path: string, scheme = 'file') => ({ scheme, path, fsPath: scheme === 'file' ? path : undefined, toString: () => `${scheme}://${path}` });

describe('recentProjects', () => {
  it('lists folders and workspaces with their name and a ~ path', () => {
    const projects = recentProjects([{ folderUri: uri('/Users/me/IdeaProjects/api') }, { workspace: { configPath: uri('/Users/me/work/all.code-workspace') } }, { folderUri: uri('/opt/other') }], '/Users/me');
    expect(projects.map((p) => [p.label, p.path, p.workspace])).toEqual([
      ['api', '~/IdeaProjects/api', false],
      ['all', '~/work/all.code-workspace', true],
      ['other', '/opt/other', false],
    ]);
  });

  it('shows remote projects with their host', () => {
    const [project] = recentProjects([{ folderUri: uri('/home/dev/app', 'vscode-remote'), remoteAuthority: 'ssh-remote+box' }], '/Users/me');
    expect(project).toMatchObject({ label: 'app', path: '[ssh-remote+box] /home/dev/app' });
  });

  it('does not take a home prefix that is only a name prefix', () => {
    expect(recentProjects([{ folderUri: uri('/Users/meow/x') }], '/Users/me')[0].path).toBe('/Users/meow/x');
  });
});
