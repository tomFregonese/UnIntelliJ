import { existsSync } from 'node:fs';
import * as path from 'node:path';

export /** The closest Maven wrapper (mvnw) from the project up to the workspace folder; it is run from its own directory. */
function findWrapper(dir: string, stop: string | undefined): { cwd: string; wrapper: boolean } {
  for (let current = dir; ; current = path.dirname(current)) {
    if (existsSync(path.join(current, 'mvnw')) || existsSync(path.join(current, 'mvnw.cmd'))) {
      return { cwd: current, wrapper: true };
    }
    if (!stop || current === stop || path.dirname(current) === current || !current.startsWith(stop)) {
      return { cwd: dir, wrapper: false };
    }
  }
}

/** `./mvnw` (or `.\\mvnw.cmd` on Windows) when the project has a wrapper, else `mvn`. */
export function wrapperCommand(wrapper: boolean, platform: NodeJS.Platform = process.platform): string {
  return wrapper ? (platform === 'win32' ? '.\\mvnw.cmd' : './mvnw') : 'mvn';
}
