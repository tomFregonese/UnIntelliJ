/**
 * UnIntelliJ's display language (`unintellij.language`): English by default, French on demand.
 * The English text is the key: `t('Push…')` returns it unchanged in English and its translation
 * from fr.ts in French, so English strings stay readable in the code. `{0}`, `{1}`… are replaced by
 * the arguments. Pure: no `vscode` import (shared with the webviews).
 */
import { FR } from './fr';

export type Language = 'en' | 'fr';
export const LANGUAGES: readonly Language[] = ['en', 'fr'];

let current: Language = 'en';

export function setLanguage(language: Language): void {
  current = language;
}

export function language(): Language {
  return current;
}

export function format(text: string, args: readonly unknown[]): string {
  return text.replace(/\{(\d+)\}/g, (match, index: string) => (Number(index) < args.length ? String(args[Number(index)]) : match));
}

/** Translates an English UI text into the current language. */
export function t(text: string, ...args: unknown[]): string {
  const translated = current === 'fr' ? (FR[text] ?? text) : text;
  return format(translated, args);
}

/** Translation of `text` in a given language, without changing the current one (used by `npm run gen`). */
export function translate(text: string, target: Language): string {
  return target === 'fr' ? (FR[text] ?? text) : text;
}
