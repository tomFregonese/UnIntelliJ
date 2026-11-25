import { execFile } from 'node:child_process';

export interface GitResult {
  stdout: string;
  stderr: string;
}

/**
 * Runs git for operations the Git extension API does not expose (rebase, branch rename,
 * force-with-lease, log graph…). Rejects with git's stderr on failure.
 */
export function runGit(gitPath: string, cwd: string, args: readonly string[], timeoutMs = 120_000): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    execFile(gitPath, args, { cwd, maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, env: { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' } }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
