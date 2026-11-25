import * as vscode from 'vscode';

export const FILE_ICON_THEME = 'unintellij-file-icons';
export const PRODUCT_ICON_THEME = 'unintellij-product-icons';

const INITIALIZED_KEY = 'appearance.iconThemesInitialized';

/** On first activation, switches VS Code to the New UI file and product icon themes. */
export async function initializeIconThemes(state: vscode.Memento, log: vscode.LogOutputChannel): Promise<void> {
  if (state.get<boolean>(INITIALIZED_KEY)) {
    return;
  }
  const workbench = vscode.workspace.getConfiguration('workbench');
  for (const [key, value] of [
    ['iconTheme', FILE_ICON_THEME],
    ['productIconTheme', PRODUCT_ICON_THEME],
  ] as const) {
    if (workbench.get(key) !== value) {
      log.info(`Appearance: setting workbench.${key} = "${value}"`);
      await workbench.update(key, value, vscode.ConfigurationTarget.Global);
    }
  }
  await state.update(INITIALIZED_KEY, true);
}
