import { expect } from '~/tests';
import { DELETED } from './target';
import { Diff } from './diff';

describe('Diff', () => {
	describe('patched', () => {
		it('applies the target operations to the given object', () => {
			type S = { a?: number; b: string; c?: { [k: string]: string } };

			expect(
				Diff.of<S>(
					{
						a: 1,
						b: 'one',
						c: { k: 'v' },
					},
					{ a: 2 },
				).target,
			).to.deep.equal({
				a: 2,
				b: 'one',
				c: { k: 'v' },
			});
			expect(
				Diff.of<S>(
					{
						a: 0,
						b: 'one',
						c: { k: 'v' },
					},
					{ a: 2 },
				).target,
			).to.deep.equal({ a: 2, b: 'one', c: { k: 'v' } });

			expect(Diff.of<S>({ a: 0, b: 'two' }, { a: 2 }).target).to.deep.equal({
				a: 2,
				b: 'two',
			});
			expect(
				Diff.of<S>(
					{
						a: 1,
						b: 'one',
						c: { k: 'v' },
					},
					{ c: DELETED },
				).target,
			).to.deep.equal({
				a: 1,
				b: 'one',
			});
			expect(
				Diff.of<S>(
					{
						a: 1,
						b: 'one',
						c: { k: 'v' },
					},
					{ a: 2, c: { k: DELETED } },
				).target,
			).to.deep.equal({ a: 2, b: 'one', c: {} });
		});
	});

	describe('diff function', () => {
		it('returns pending operations to turn the given object into the target', () => {
			type S = { a?: number; b: string; c: { [k: string]: string } };
			const src: S = {
				a: 1,
				b: 'one',
				c: { k: 'v' },
			};

			const diff = Diff.of(src, { a: 2, c: { k: DELETED } });
			expect(
				diff({
					a: 1,
					b: 'one',
					c: { k: 'v' },
				}),
			).to.deep.equal([
				{ op: 'delete', path: '/c/k' },
				{ path: '/a', op: 'update', value: 2 },
			]);

			expect(
				diff({
					a: 1,
					b: 'two',
					c: { k: 'v' },
				}),
			).to.deep.equal([
				{ op: 'delete', path: '/c/k' },
				{ path: '/a', op: 'update', value: 2 },
			]);

			expect(
				diff({
					a: 1,
					b: 'one',
					c: {},
				}),
			).to.deep.equal([{ path: '/a', op: 'update', value: 2 }]);

			expect(
				diff({
					a: 2,
					b: 'one',
					c: {},
				}),
			).to.deep.equal([]);
		});
	});
});
