import { afterEach, describe, expect, it } from 'vitest';
import { setLanguage, t } from '../../src/i18n/i18n';

describe('i18n', () => {
  afterEach(() => setLanguage('en'));

  it('returns English by default, with arguments', () => {
    expect(t('Delete {0}?', 'a.ts')).toBe('Delete a.ts?');
  });

  it('translates to French and keeps unknown texts', () => {
    setLanguage('fr');
    expect(t('Delete {0}?', 'a.ts')).toBe('Supprimer a.ts ?');
    expect(t('Something new')).toBe('Something new');
  });
});
