/** Messages between the Data Sources window and the extension. Pure. */
import type { DataSource } from './dataSourceLogic';

export interface DataSourcesModel {
  sources: DataSource[];
  /** Ids of the sources with a stored password. */
  withPassword: string[];
  selected?: string;
}

export type ToDataSourcesWebview =
  | { type: 'model'; model: DataSourcesModel }
  | { type: 'testResult'; ok: boolean; message: string };

export type FromDataSourcesWebview =
  | { type: 'ready' }
  /** passwords: new value, null = remove, absent = keep. */
  | { type: 'save'; sources: DataSource[]; passwords: Record<string, string | null>; close: boolean }
  | { type: 'test'; source: DataSource; password?: string }
  | { type: 'cancel' };
