/**
 * package.json texts as `%key%` placeholders, with package.nls.json (English) and
 * package.nls.fr.json (French). VS Code picks the file from its display language: command titles,
 * view names and setting descriptions follow VS Code's language, not `unintellij.appearance.language`.
 * Pure: no `vscode` import (used by `npm run gen` and the unit tests).
 */
import { translate } from './i18n';

export interface Localized<T> {
  value: T;
  en: Record<string, string>;
  fr: Record<string, string>;
}

type Json = Record<string, unknown>;

/** Replaces the texts of `contributes` by `%key%` placeholders and returns both bundles. */
export function localizeContributions(contributes: Json): Localized<Json> {
  const en: Record<string, string> = {};
  const fr: Record<string, string> = {};
  const key = (id: string, text: string): string => {
    en[id] = text;
    fr[id] = translate(text, 'fr');
    return `%${id}%`;
  };
  const value = structuredClone(contributes);

  for (const command of (value.commands as Json[] | undefined) ?? []) {
    command.title = key(`command.${command.command as string}`, command.title as string);
    if (command.category) {
      command.category = key('command.category', command.category as string);
    }
  }
  for (const [location, containers] of Object.entries((value.viewsContainers as Record<string, Json[]> | undefined) ?? {})) {
    for (const container of containers) {
      container.title = key(`viewContainer.${location}.${container.id as string}`, container.title as string);
    }
  }
  for (const views of Object.values((value.views as Record<string, Json[]> | undefined) ?? {})) {
    for (const view of views) {
      view.name = key(`view.${view.id as string}`, view.name as string);
    }
  }
  for (const section of (value.configuration as Json[] | undefined) ?? []) {
    section.title = key(`config.${section.id as string}`, section.title as string);
    for (const [id, property] of Object.entries(section.properties as Record<string, Json>)) {
      property.markdownDescription = key(`config.${id}.description`, property.markdownDescription as string);
      if (Array.isArray(property.enumDescriptions)) {
        property.enumDescriptions = (property.enumDescriptions as string[]).map((text, i) => key(`config.${id}.enum.${i}`, text));
      }
    }
  }
  for (const color of (value.colors as Json[] | undefined) ?? []) {
    color.description = key(`color.${color.id as string}`, color.description as string);
  }
  return { value, en, fr };
}
