import { describe, expect, it } from 'vitest';
import { matchFile, matchName, parseQuery, rank } from '../../src/search/matcher';

describe('parseQuery', () => {
  it('extracts line and column', () => {
    expect(parseQuery('UserService.ts:42')).toEqual({ name: 'UserService.ts', line: 42 });
    expect(parseQuery('app.ts:3:7')).toEqual({ name: 'app.ts', line: 3, column: 7 });
  });

  it('splits directory and name', () => {
    expect(parseQuery('app/user/serv')).toEqual({ name: 'serv', path: 'app/user' });
    expect(parseQuery('src\\main\\Order')).toEqual({ name: 'Order', path: 'src/main' });
    expect(parseQuery('/abs')).toEqual({ name: 'abs' });
  });
});

describe('matchName', () => {
  it('matches subsequences case-insensitively', () => {
    expect(matchName('usrsvc', 'UserService')).toBeDefined();
    expect(matchName('xyz', 'UserService')).toBeUndefined();
  });

  it('matches camel humps', () => {
    expect(matchName('USvc', 'UserService')?.positions).toEqual([0, 4, 7, 9]);
    expect(matchName('OC', 'OrderController')).toBeDefined();
    expect(matchName('uc', 'user-card.component.ts')).toBeDefined();
  });

  it('requires upper-case pattern letters on word starts', () => {
    expect(matchName('uS', 'userservice')).toBeUndefined();
    expect(matchName('uS', 'userService')).toBeDefined();
  });

  it('ranks exact > prefix > camel humps > scattered', () => {
    const score = (c: string) => matchName('order', c)?.score ?? -Infinity;
    expect(score('order')).toBeGreaterThan(score('OrderController'));
    expect(score('OrderController')).toBeGreaterThan(score('PurchaseOrder'));
    expect(score('PurchaseOrder')).toBeGreaterThan(score('ObjectRenderer'));
  });

  it('prefers shorter names on otherwise equal matches', () => {
    expect(matchName('user', 'UserService')!.score).toBeGreaterThan(matchName('user', 'UserServiceImpl')!.score);
  });

  it('accepts an empty pattern', () => {
    expect(matchName('', 'anything')).toEqual({ score: 0, positions: [] });
  });
});

describe('matchFile', () => {
  it('matches the name and directory fragments in order', () => {
    const query = parseQuery('app/user/serv');
    expect(matchFile(query, 'user.service.ts', 'src/app/user')).toBeDefined();
    expect(matchFile(query, 'user.service.ts', 'src/user/app')).toBeUndefined();
    expect(matchFile(query, 'order.ts', 'src/app/user')).toBeUndefined();
  });
});

describe('rank', () => {
  it('drops non-matches, sorts by score and applies the limit', () => {
    const names = ['PurchaseOrder', 'Order', 'Unrelated', 'OrderController'];
    const ranked = rank(names, (n) => matchName('order', n)?.score, (n) => n);
    expect(ranked).toEqual(['Order', 'OrderController', 'PurchaseOrder']);
    expect(rank(names, (n) => matchName('order', n)?.score, (n) => n, 1)).toEqual(['Order']);
  });
});
