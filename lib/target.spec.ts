import { expect } from '~/tests';
import { Diff, DELETED } from './target';

describe('Diff', () => {
	describe('patch', () => {
		it('applies the target to the current object', () => {
			type S = { a?: number; b: string; c: { [k: string]: string } };
			expect(
				Diff.of<S>({ a: 2, c: { k: DELETED } }).patch({
					a: 1,
					b: 'one',
					c: { k: 'v' },
				}),
			).to.deep.equal({ a: 2, b: 'one', c: {} });
		});
	});

	describe('operations', () => {
		it('returns the operations', () => {
			type S = { a?: number; b: string; c: { [k: string]: string } };
			expect(
				Diff.of<S>({ a: 2, c: { k: DELETED } }).operations({
					a: 1,
					b: 'one',
					c: { k: 'v' },
				}),
			).to.deep.equal([
				{ path: '/a', op: 'update', value: 2 },
				{ op: 'delete', path: '/c/k' },
			]);
		});
	});
});
