/**
 * Islands Dark / Islands Light palettes, modeled on IntelliJ's New UI (Int UI) colors
 * and its default "Dark" / "Light" editor color schemes.
 *
 * Pure data: no `vscode` import. Themes in `themes/` are generated from this file
 * (`npm run gen:themes`).
 */

export interface UiPalette {
  /** Window frame around the islands: title bar, tool window stripes, status bar. */
  frame: string;
  /** Island background: editor, tool windows, panel. */
  island: string;
  /** Popups, menus, completion, dialogs. */
  popup: string;
  /** Subtle separators inside islands. */
  border: string;
  /** Borders of popups and inputs. */
  popupBorder: string;
  inputBorder: string;
  foreground: string;
  secondaryForeground: string;
  disabledForeground: string;
  iconForeground: string;
  accent: string;
  accentHover: string;
  accentForeground: string;
  hover: string;
  /** Focused list/tree selection. */
  selection: string;
  /** Unfocused list/tree selection. */
  inactiveSelection: string;
  /** Matched characters in lists (Search Everywhere, completion). */
  matchHighlight: string;
  link: string;
  error: string;
  warning: string;
  info: string;
  success: string;
  scrollbar: string;
  scrollbarHover: string;
  scrollbarActive: string;
}

export interface EditorPalette {
  background: string;
  foreground: string;
  caret: string;
  caretRow: string;
  selection: string;
  inactiveSelection: string;
  lineNumber: string;
  activeLineNumber: string;
  indentGuide: string;
  activeIndentGuide: string;
  whitespace: string;
  /** "Identifier under caret" (read access). */
  identifierUnderCaret: string;
  /** "Identifier under caret" (write access). */
  identifierUnderCaretWrite: string;
  searchResult: string;
  searchResultHighlight: string;
  bracketMatch: string;
  errorUnderline: string;
  warningUnderline: string;
  infoUnderline: string;
  inlayBackground: string;
  inlayForeground: string;
  gutterAdded: string;
  gutterModified: string;
  gutterDeleted: string;
  diffInsertedLine: string;
  diffInsertedText: string;
  diffRemovedLine: string;
  diffRemovedText: string;
}

export interface SyntaxPalette {
  text: string;
  keyword: string;
  string: string;
  number: string;
  comment: string;
  docComment: string;
  docTag: string;
  functionDeclaration: string;
  /** Function/method calls in JS/TS (Java calls stay plain text, as in IntelliJ). */
  functionCall: string;
  field: string;
  annotation: string;
  typeParameter: string;
  escape: string;
  regexp: string;
  label: string;
  markupTag: string;
  markupAttribute: string;
  markupAttributeValue: string;
  markupEntity: string;
  cssProperty: string;
  cssSelector: string;
  jsonKey: string;
  yamlKey: string;
  mdHeading: string;
  mdLink: string;
  mdCode: string;
  invalid: string;
}

export interface VcsPalette {
  added: string;
  modified: string;
  deleted: string;
  untracked: string;
  ignored: string;
  conflict: string;
  renamed: string;
}

export interface TerminalPalette {
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface ThemePalette {
  label: string;
  type: 'dark' | 'light';
  ui: UiPalette;
  editor: EditorPalette;
  syntax: SyntaxPalette;
  vcs: VcsPalette;
  terminal: TerminalPalette;
}

export const ISLANDS_DARK: ThemePalette = {
  label: 'Islands Dark',
  type: 'dark',
  ui: {
    frame: '#131417',
    island: '#1E1F22',
    popup: '#2B2D30',
    border: '#2B2D30',
    popupBorder: '#43454A',
    inputBorder: '#4E5157',
    foreground: '#DFE1E5',
    secondaryForeground: '#868A91',
    disabledForeground: '#6F737A',
    iconForeground: '#CED0D6',
    accent: '#3574F0',
    accentHover: '#366ACE',
    accentForeground: '#FFFFFF',
    hover: '#2B2D30',
    selection: '#2E436E',
    inactiveSelection: '#393B40',
    matchHighlight: '#548AF7',
    link: '#548AF7',
    error: '#DB5C5C',
    warning: '#D6AE58',
    info: '#548AF7',
    success: '#5FAD65',
    scrollbar: '#4E515780',
    scrollbarHover: '#5A5D63A0',
    scrollbarActive: '#6F737AC0',
  },
  editor: {
    background: '#1E1F22',
    foreground: '#BCBEC4',
    caret: '#CED0D6',
    caretRow: '#26282E',
    selection: '#214283',
    inactiveSelection: '#21428399',
    lineNumber: '#4B5059',
    activeLineNumber: '#A1A3AB',
    indentGuide: '#313438',
    activeIndentGuide: '#4E5157',
    whitespace: '#3C3F45',
    identifierUnderCaret: '#373B39',
    identifierUnderCaretWrite: '#402F33',
    searchResult: '#2D543F',
    searchResultHighlight: '#2D543F99',
    bracketMatch: '#43454A',
    errorUnderline: '#F75464',
    warningUnderline: '#F2C55C',
    infoUnderline: '#548AF7',
    inlayBackground: '#2B2D30',
    inlayForeground: '#868A91',
    gutterAdded: '#549159',
    gutterModified: '#375FAD',
    gutterDeleted: '#868A91',
    diffInsertedLine: '#29443680',
    diffInsertedText: '#3D6B4A80',
    diffRemovedLine: '#484A4A80',
    diffRemovedText: '#5E626680',
  },
  syntax: {
    text: '#BCBEC4',
    keyword: '#CF8E6D',
    string: '#6AAB73',
    number: '#2AACB8',
    comment: '#7A7E85',
    docComment: '#5F826B',
    docTag: '#67A37C',
    functionDeclaration: '#56A8F5',
    functionCall: '#56A8F5',
    field: '#C77DBB',
    annotation: '#B3AE60',
    typeParameter: '#16BAAC',
    escape: '#CF8E6D',
    regexp: '#42C3D4',
    label: '#BCBEC4',
    markupTag: '#D5B778',
    markupAttribute: '#BABABA',
    markupAttributeValue: '#6AAB73',
    markupEntity: '#CF8E6D',
    cssProperty: '#BABABA',
    cssSelector: '#D5B778',
    jsonKey: '#C77DBB',
    yamlKey: '#CF8E6D',
    mdHeading: '#CF8E6D',
    mdLink: '#548AF7',
    mdCode: '#6AAB73',
    invalid: '#F75464',
  },
  vcs: {
    added: '#73BD79',
    modified: '#6C9CFC',
    deleted: '#868A91',
    untracked: '#D1675A',
    ignored: '#9E814A',
    conflict: '#DB5C5C',
    renamed: '#6C9CFC',
  },
  terminal: {
    black: '#1E1F22',
    red: '#F0524F',
    green: '#5C962C',
    yellow: '#A68A0D',
    blue: '#3993D4',
    magenta: '#A771BF',
    cyan: '#00A3A3',
    white: '#808080',
    brightBlack: '#595959',
    brightRed: '#FF4050',
    brightGreen: '#4FC414',
    brightYellow: '#E5BF00',
    brightBlue: '#1FB0FF',
    brightMagenta: '#ED7EED',
    brightCyan: '#00E5E5',
    brightWhite: '#FFFFFF',
  },
};

export const ISLANDS_LIGHT: ThemePalette = {
  label: 'Islands Light',
  type: 'light',
  ui: {
    frame: '#EBECF0',
    island: '#FFFFFF',
    popup: '#FFFFFF',
    border: '#EBECF0',
    popupBorder: '#DFE1E5',
    inputBorder: '#C9CCD6',
    foreground: '#000000',
    secondaryForeground: '#6C707E',
    disabledForeground: '#A8ADBD',
    iconForeground: '#6C707E',
    accent: '#3574F0',
    accentHover: '#315FBD',
    accentForeground: '#FFFFFF',
    hover: '#F7F8FA',
    selection: '#D4E2FF',
    inactiveSelection: '#DFE1E5',
    matchHighlight: '#3574F0',
    link: '#2A65DB',
    error: '#E55230',
    warning: '#C27D04',
    info: '#3574F0',
    success: '#208A3C',
    scrollbar: '#C9CCD680',
    scrollbarHover: '#A8ADBDA0',
    scrollbarActive: '#818594C0',
  },
  editor: {
    background: '#FFFFFF',
    foreground: '#080808',
    caret: '#000000',
    caretRow: '#F5F8FE',
    selection: '#A6D2FF',
    inactiveSelection: '#A6D2FF99',
    lineNumber: '#AEB3C2',
    activeLineNumber: '#767A8A',
    indentGuide: '#EBECF0',
    activeIndentGuide: '#C9CCD6',
    whitespace: '#D3D5DB',
    identifierUnderCaret: '#EDEBFC',
    identifierUnderCaretWrite: '#FCE8F4',
    searchResult: '#F5D273',
    searchResultHighlight: '#F5D27399',
    bracketMatch: '#C9DEF5',
    errorUnderline: '#F50000',
    warningUnderline: '#E6A100',
    infoUnderline: '#3574F0',
    inlayBackground: '#EBECF0',
    inlayForeground: '#6C707E',
    gutterAdded: '#9BCC9E',
    gutterModified: '#8FAEEB',
    gutterDeleted: '#A8ADBD',
    diffInsertedLine: '#E1F0E380',
    diffInsertedText: '#BEE6C480',
    diffRemovedLine: '#EBECF080',
    diffRemovedText: '#D6D8DE80',
  },
  syntax: {
    text: '#080808',
    keyword: '#0033B3',
    string: '#067D17',
    number: '#1750EB',
    comment: '#8C8C8C',
    docComment: '#8C8C8C',
    docTag: '#8C8C8C',
    functionDeclaration: '#00627A',
    functionCall: '#00627A',
    field: '#871094',
    annotation: '#9E880D',
    typeParameter: '#007E8A',
    escape: '#0037A6',
    regexp: '#264EFF',
    label: '#080808',
    markupTag: '#0033B3',
    markupAttribute: '#174AD4',
    markupAttributeValue: '#067D17',
    markupEntity: '#0033B3',
    cssProperty: '#174AD4',
    cssSelector: '#0033B3',
    jsonKey: '#871094',
    yamlKey: '#0033B3',
    mdHeading: '#0033B3',
    mdLink: '#2A65DB',
    mdCode: '#067D17',
    invalid: '#F50000',
  },
  vcs: {
    added: '#067D17',
    modified: '#0A50A1',
    deleted: '#6C707E',
    untracked: '#B33E3A',
    ignored: '#9E880D',
    conflict: '#E55230',
    renamed: '#0A50A1',
  },
  terminal: {
    black: '#000000',
    red: '#F50000',
    green: '#00AB00',
    yellow: '#C99E00',
    blue: '#0040CC',
    magenta: '#A919C2',
    cyan: '#00A3A3',
    white: '#808080',
    brightBlack: '#595959',
    brightRed: '#FF4040',
    brightGreen: '#00C800',
    brightYellow: '#E5BF00',
    brightBlue: '#3381FF',
    brightMagenta: '#D26DE5',
    brightCyan: '#00C8C8',
    brightWhite: '#FFFFFF',
  },
};

export const PALETTES = [ISLANDS_DARK, ISLANDS_LIGHT] as const;
