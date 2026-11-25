import { describe, expect, it } from 'vitest';
import {
  createChangelist,
  deleteChangelist,
  GIT_STATUS,
  initialChangelists,
  mergeChanges,
  moveToChangelist,
  planCommit,
  renameChangelist,
  setActiveChangelist,
  syncAssignments,
  toFileStatus,
} from '../../src/vcs/changesLogic';

describe('toFileStatus', () => {
  it('maps Git statuses to IntelliJ ones', () => {
    expect(toFileStatus(GIT_STATUS.MODIFIED)).toBe('M');
    expect(toFileStatus(GIT_STATUS.INDEX_ADDED)).toBe('A');
    expect(toFileStatus(GIT_STATUS.DELETED)).toBe('D');
    expect(toFileStatus(GIT_STATUS.INDEX_RENAMED)).toBe('R');
    expect(toFileStatus(GIT_STATUS.UNTRACKED)).toBe('U');
    expect(toFileStatus(GIT_STATUS.BOTH_MODIFIED)).toBe('C');
    expect(toFileStatus(GIT_STATUS.IGNORED)).toBeUndefined();
  });
});

describe('mergeChanges', () => {
  it('keeps one entry per file, "Added" winning over a later modification', () => {
    expect(
      mergeChanges([
        { path: '/r/b.ts', status: GIT_STATUS.MODIFIED, staged: false },
        { path: '/r/a.ts', status: GIT_STATUS.INDEX_ADDED, staged: true },
        { path: '/r/a.ts', status: GIT_STATUS.MODIFIED, staged: false },
        { path: '/r/ignored.log', status: GIT_STATUS.IGNORED, staged: false },
      ]),
    ).toEqual([
      { path: '/r/a.ts', status: 'A', staged: true },
      { path: '/r/b.ts', status: 'M', staged: false },
    ]);
  });
});

describe('planCommit', () => {
  const changes = mergeChanges([
    { path: 'a', status: GIT_STATUS.INDEX_MODIFIED, staged: true },
    { path: 'b', status: GIT_STATUS.MODIFIED, staged: false },
    { path: 'c', status: GIT_STATUS.UNTRACKED, staged: false },
    { path: 'd', status: GIT_STATUS.DELETED, staged: false },
  ]);

  it('stages checked files and unstages the others', () => {
    expect(planCommit(changes, new Set(['b', 'c', 'd']))).toEqual({ unstage: ['a'], stage: ['b', 'c', 'd'] });
  });

  it('keeps already staged checked files staged', () => {
    expect(planCommit(changes, new Set(['a']))).toEqual({ unstage: [], stage: ['a'] });
  });
});

describe('changelists', () => {
  it('put new changes in the active changelist and forget committed files', () => {
    let state = createChangelist(initialChangelists(), 'Feature', 'feature', true);
    state = syncAssignments(state, ['x', 'y']);
    expect(state.assignments).toEqual({ x: 'feature', y: 'feature' });
    state = setActiveChangelist(state, 'default');
    state = syncAssignments(state, ['y', 'z']);
    expect(state.assignments).toEqual({ y: 'feature', z: 'default' });
  });

  it('move, rename and delete', () => {
    let state = createChangelist(initialChangelists(), 'Feature', 'feature');
    state = syncAssignments(state, ['x', 'y']);
    state = moveToChangelist(state, ['y'], 'feature');
    expect(state.assignments.y).toBe('feature');
    state = renameChangelist(state, 'feature', 'Bugfix');
    expect(state.lists.map((l) => l.name)).toEqual(['Changes', 'Bugfix']);
    state = deleteChangelist(state, 'feature');
    expect(state.lists.map((l) => l.id)).toEqual(['default']);
    expect(state.assignments.y).toBe('default');
  });

  it('never deletes the last changelist and ignores unknown targets', () => {
    const state = initialChangelists();
    expect(deleteChangelist(state, 'default')).toBe(state);
    expect(moveToChangelist(state, ['x'], 'nope')).toBe(state);
  });

  it('deleting the active changelist activates another one', () => {
    let state = createChangelist(initialChangelists(), 'Feature', 'feature', true);
    state = deleteChangelist(state, 'feature');
    expect(state.activeId).toBe('default');
  });
});
