/** Messages between the database results panel and the extension. Pure. */

export interface ResultTab {
  id: string;
  title: string;
  /** Data source name and color, shown on the tab. */
  source: string;
  color?: string;
  sql: string;
  columns: string[];
  /** Display texts (formatted by the extension), at most MAX_ROWS. */
  rows: string[][];
  /** Rows returned or affected, as reported by the server. */
  rowCount: number | null;
  truncated: boolean;
  command: string;
  durationMs: number;
  error?: string;
  notices: string[];
  running: boolean;
  /** Set for "open table data": filter, sort and pages are applied server side. */
  table?: { where: string; orderBy: string; page: number; pageSize: number };
}

export interface ResultsModel {
  tabs: ResultTab[];
  active?: string;
}

export type ToResultsWebview = { type: 'model'; model: ResultsModel };

export type FromResultsWebview =
  | { type: 'ready' }
  | { type: 'select'; id: string }
  | { type: 'close'; id: string }
  | { type: 'exportCsv'; id: string }
  | { type: 'copy'; id: string }
  | { type: 'rerun'; id: string }
  | { type: 'cancel'; id: string }
  | { type: 'table'; id: string; where: string; orderBy: string; page: number };
