import { expect } from '~/test-utils';
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
			).to.have.deep.members([
				{ op: 'update', path: '/', value: { a: 2, b: 'one', c: {} } },
				{ op: 'update', path: '/a', value: 2 },
				{ op: 'update', path: '/c', value: {} },
				{ op: 'delete', path: '/c/k' },
			]);

			expect(
				diff({
					a: 1,
					b: 'two',
					c: { k: 'v' },
				}),
			).to.deep.equal([
				{ op: 'update', path: '/', value: { a: 2, b: 'two', c: {} } },
				{ op: 'update', path: '/a', value: 2 },
				{ op: 'update', path: '/c', value: {} },
				{ op: 'delete', path: '/c/k' },
			]);

			expect(
				diff({
					a: 1,
					b: 'one',
					c: {},
				}),
			).to.deep.equal([
				{ op: 'update', path: '/', value: { a: 2, b: 'one', c: {} } },
				{ op: 'update', path: '/a', value: 2 },
			]);

			expect(
				diff({
					a: 2,
					b: 'one',
					c: {},
				}),
			).to.deep.equal([]);
		});

		it('does not recurse into the object if a parent property does not exist', () => {
			type S = { a: { [k: string]: { [k: string]: string } } };
			const src: S = {
				a: {},
			};

			const diff = Diff.of(src, { a: { b: { c: 'd' } } });
			expect(
				diff({
					a: {},
				}),
			).to.have.deep.members([
				{ op: 'update', path: '/', value: { a: { b: { c: 'd' } } } },
				{ op: 'update', path: '/a', value: { b: { c: 'd' } } },
				{ op: 'create', path: '/a/b', value: { c: 'd' } },
			]);
		});

		it('it recursively adds a DELETE operation for the current state', () => {
			type S = { a: { [k: string]: { [k: string]: { [k: string]: string } } } };
			const src: S = {
				a: {},
			};

			const diff = Diff.of(src, { a: { b: DELETED } });
			expect(diff({ a: { b: { c: { d: 'e' } } } })).to.have.deep.members([
				{ op: 'update', path: '/', value: { a: {} } },
				{ op: 'update', path: '/a', value: {} },
				{ op: 'delete', path: '/a/b' },
				{ op: 'delete', path: '/a/b/c' },
				{ op: 'delete', path: '/a/b/c/d' },
			]);
		});
	});
});
