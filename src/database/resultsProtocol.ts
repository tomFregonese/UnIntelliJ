/** Messages between the database results panel and the extension. Pure. */

export interface ResultTab {
  id: string;
  title: string;
  /** Data source name and color, shown on the tab. */
  source: string;
  color?: string;
  sql: string;
  columns: string[];
  /** Display texts (formatted by the extension), null for SQL NULL, at most MAX_ROWS. */
  rows: (string | null)[][];
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
  /** Table data tabs: what the table editor needs to change the data. */
  edit?: EditState;
}

export type EditKind = 'text' | 'number' | 'boolean' | 'enum' | 'date' | 'timestamp' | 'time' | 'json';

export interface EditColumn {
  name: string;
  /** Full type, shown: `character varying(40)`, `timestamp(3) with time zone`. */
  type: string;
  /** Type without length / precision, for casts: `character varying`. */
  castType: string;
  kind: EditKind;
  /** timestamptz / timetz: values carry an offset. */
  tz: boolean;
  nullable: boolean;
  hasDefault: boolean;
  /** Generated or identity ALWAYS: never written. */
  readOnly: boolean;
  /** Part of the primary key. */
  key: boolean;
  enumValues?: string[];
}

export interface EditState {
  columns: EditColumn[];
  /** Why the data cannot be changed (view, read-only data source); undefined when it can. */
  readOnlyReason?: string;
  /** Changes when the rows are reloaded: pending changes of older rows are dropped. */
  version: number;
  submitting: boolean;
  /** Error of the last submit; pending changes are kept. */
  submitError?: string;
}

/** A pending change of the table editor. `values` maps column indexes to text values (null = NULL). */
export type RowChange =
  | { kind: 'update'; row: number; values: Record<number, string | null> }
  | { kind: 'insert'; values: Record<number, string | null> }
  | { kind: 'delete'; row: number };

export interface ResultsModel {
  tabs: ResultTab[];
  active?: string;
  /** Table editor tab in the editor area: a single tab, no tab strip (the editor tab is the tab). */
  single?: boolean;
}

export type ToResultsWebview = { type: 'model'; model: ResultsModel };

export type FromResultsWebview =
  | { type: 'ready' }
  | { type: 'select'; id: string }
  | { type: 'close'; id: string }
  | { type: 'exportCsv'; id: string }
  | { type: 'copy'; id: string }
  | { type: 'rerun'; id: string; pending?: number }
  | { type: 'cancel'; id: string }
  | { type: 'table'; id: string; where: string; orderBy: string; page: number; pending?: number }
  | { type: 'submit'; id: string; changes: RowChange[] };
