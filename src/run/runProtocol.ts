/** Messages between the Edit Configurations window and the extension. Pure. */
import type { NpmConfigData } from './runConfigLogic';

export interface PackageInfo {
  /** package.json URI, as stored in NpmConfigData.packageJson. */
  path: string;
  label: string;
  scripts: string[];
}

export interface LaunchInfo {
  id: string;
  name: string;
  type: string;
  folder: string;
}

export interface RunConfigsModel {
  configs: NpmConfigData[];
  packages: PackageInfo[];
  launches: LaunchInfo[];
  /** Configuration to select first. */
  selected?: string;
}

export type ToRunWebview = { type: 'model'; model: RunConfigsModel };

export type FromRunWebview =
  | { type: 'ready' }
  | { type: 'save'; configs: NpmConfigData[]; close: boolean }
  | { type: 'cancel' }
  | { type: 'openLaunch'; id: string };
