/**
 * Islands Dark / Islands Light palettes. Values are copied from intellij-community
 * (Apache 2.0, see NOTICE): `platform/platform-resources/src/themes/islands/ManyIslands{Dark,Light}.theme.json`
 * for the UI (named colors quoted in comments) and the `Islands Dark` (`IslandSchemeDark.xml`) /
 * `Light` (`expUI/expUI_lightScheme.xml`) editor color schemes.
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
  /** Toolbar buttons, tabs, status bar widgets (IntelliJ `toolbar-bg-hovered`). */
  hover: string;
  /** List and tree rows (IntelliJ `selection-bg-hovered`). */
  listHover: string;
  /** Selected editor tab (IntelliJ `tab-selected-*`): background and frame, focused and not. */
  tabSelected: string;
  tabSelectedBorder: string;
  tabInactiveSelected: string;
  tabInactiveSelectedBorder: string;
  /** Selected tool window button in the stripes (IntelliJ `ToolWindow.Button.selected*`). */
  stripeSelected: string;
  stripeSelectedForeground: string;
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
    frame: '#26282C',
    island: '#191A1C',
    popup: '#26282C',
    border: '#26282C',
    popupBorder: '#33353B',
    inputBorder: '#40434A',
    foreground: '#D1D3D9',
    secondaryForeground: '#9FA2A8',
    disabledForeground: '#4C4F56',
    iconForeground: '#C3C5CB',
    accent: '#3871E1',
    accentHover: '#2F5EB9',
    accentForeground: '#FFFFFF',
    hover: '#FFFFFF17',
    selection: '#2A4371',
    inactiveSelection: '#33353B',
    matchHighlight: '#538AF9',
    link: '#71A1FE',
    error: '#F57E84',
    warning: '#D59637',
    info: '#538AF9',
    success: '#6DB083',
    scrollbar: '#FFFFFF26',
    scrollbarHover: '#FFFFFF4D',
    scrollbarActive: '#FFFFFF66',
    listHover: '#FFFFFF10',
    tabSelected: '#233558',
    tabSelectedBorder: '#2E4D89',
    tabInactiveSelected: '#26282C',
    tabInactiveSelectedBorder: '#40434A',
    stripeSelected: '#3871E1',
    stripeSelectedForeground: '#FFFFFF',
  },
  editor: {
    background: '#191A1C',
    foreground: '#BCBEC4',
    caret: '#CED0D6',
    caretRow: '#1F2024',
    selection: '#214283',
    inactiveSelection: '#21428399',
    lineNumber: '#4B5059',
    activeLineNumber: '#A1A3AB',
    indentGuide: '#323438',
    activeIndentGuide: '#4E5157',
    whitespace: '#6F737A40',
    identifierUnderCaret: '#373B39',
    identifierUnderCaretWrite: '#402F33',
    searchResult: '#114957',
    searchResultHighlight: '#11495799',
    bracketMatch: '#43454A',
    errorUnderline: '#FA6675',
    warningUnderline: '#F2C55C',
    infoUnderline: '#548AF7',
    inlayBackground: '#393B40',
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
    modified: '#70AEFF',
    deleted: '#6F737A',
    untracked: '#E88F89',
    ignored: '#D69A6B',
    conflict: '#DE6A66',
    renamed: '#70AEFF',
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
    frame: '#E9EAEE',
    island: '#FFFFFF',
    popup: '#FFFFFF',
    border: '#E9EAEE',
    popupBorder: '#D1D3D9',
    inputBorder: '#D1D3D9',
    foreground: '#000000',
    secondaryForeground: '#5F6269',
    disabledForeground: '#9FA2A8',
    iconForeground: '#73767C',
    accent: '#3871E1',
    accentHover: '#2F5EB9',
    accentForeground: '#FFFFFF',
    hover: '#00000012',
    selection: '#D0DFFE',
    inactiveSelection: '#E9EAEE',
    matchHighlight: '#2F5EB9',
    link: '#2F5EB9',
    error: '#C54E58',
    warning: '#A56906',
    info: '#3871E1',
    success: '#338555',
    scrollbar: '#00000030',
    scrollbarHover: '#00000045',
    scrollbarActive: '#00000060',
    listHover: '#00000008',
    tabSelected: '#E3EBFE',
    tabSelectedBorder: '#A7C5FF',
    tabInactiveSelected: '#E9EAEE',
    tabInactiveSelectedBorder: '#D1D3D9',
    stripeSelected: '#3871E1',
    stripeSelectedForeground: '#FFFFFF',
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
    activeIndentGuide: '#AEB3C2',
    whitespace: '#D3D5DB',
    identifierUnderCaret: '#EDEBFC',
    identifierUnderCaretWrite: '#FCE8F4',
    searchResult: '#FCD47E',
    searchResultHighlight: '#FCD47E99',
    bracketMatch: '#93D9D9',
    errorUnderline: '#F50000',
    warningUnderline: '#E6A100',
    infoUnderline: '#3574F0',
    inlayBackground: '#00000012',
    inlayForeground: '#5F6269',
    gutterAdded: '#7FC784',
    gutterModified: '#88ADF7',
    gutterDeleted: '#767A8A',
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
    markupEntity: '#174BE6',
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
    modified: '#0033B3',
    deleted: '#6C707E',
    untracked: '#B23247',
    ignored: '#8C4F00',
    conflict: '#DE1B2E',
    renamed: '#0033B3',
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
