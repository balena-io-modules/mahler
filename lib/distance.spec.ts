import { expect } from '~/test-utils';
import type { Target } from './target';
import { UNDEFINED } from './target';
import { Distance, diff } from './distance';

describe('Distance', () => {
	describe('target', () => {
		it('returns the result of updating and object with a Target', () => {
			type S = { a?: number; b: string; c?: { [k: string]: string } };

			expect(
				Distance.from<S>(
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
				Distance.from<S>(
					{
						a: 0,
						b: 'one',
						c: { k: 'v' },
					},
					{ a: 2 },
				).target,
			).to.deep.equal({ a: 2, b: 'one', c: { k: 'v' } });

			expect(
				Distance.from<S>({ a: 0, b: 'two' }, { a: 2 }).target,
			).to.deep.equal({
				a: 2,
				b: 'two',
			});
			expect(
				Distance.from<S>(
					{
						a: 1,
						b: 'one',
						c: { k: 'v' },
					},
					{ c: UNDEFINED },
				).target,
			).to.deep.equal({
				a: 1,
				b: 'one',
			});
			expect(
				Distance.from<S>(
					{
						a: 1,
						b: 'one',
						c: { k: 'v' },
					},
					{ a: 2, c: { k: UNDEFINED } },
				).target,
			).to.deep.equal({ a: 2, b: 'one', c: {} });
		});
	});

	describe('diff', () => {
		it('returns leaf operations to turn the given object into the target', () => {
			type S = { a?: number; b: string; c: { [k: string]: string } };
			const target: Target<S> = { a: 2, c: { k: UNDEFINED } };

			expect(
				diff(
					{
						a: 1,
						b: 'one',
						c: { k: 'v' },
					},
					target,
				),
			).to.have.deep.members([
				{ op: 'update', path: '/a', source: 1, target: 2 },
				{ op: 'delete', path: '/c/k' },
			]);

			expect(
				diff(
					{
						a: 1,
						b: 'two',
						c: { k: 'v' },
					},
					target,
				),
			).to.deep.equal([
				{ op: 'update', path: '/a', source: 1, target: 2 },
				{ op: 'delete', path: '/c/k' },
			]);

			expect(
				diff(
					{
						a: 1,
						b: 'one',
						c: {},
					},
					target,
				),
			).to.deep.equal([{ op: 'update', path: '/a', source: 1, target: 2 }]);

			expect(
				diff(
					{
						a: 2,
						b: 'one',
						c: {},
					},
					target,
				),
			).to.deep.equal([]);
		});
	});

	describe('distance', () => {
		it('returns pending operations to turn the given object into the target', () => {
			type S = { a?: number; b: string; c: { [k: string]: string } };
			const src: S = {
				a: 1,
				b: 'one',
				c: { k: 'v' },
			};

			const distance = Distance.from(src, { a: 2, c: { k: UNDEFINED } });
			expect(
				distance({
					a: 1,
					b: 'one',
					c: { k: 'v' },
				}),
			).to.have.deep.members([
				{
					op: 'update',
					path: '/',
					target: { a: 2, b: 'one', c: {} },
				},
				{ op: 'update', path: '/a', target: 2 },
				{ op: 'update', path: '/c', target: {} },
				{ op: 'delete', path: '/c/k' },
			]);

			expect(
				distance({
					a: 1,
					b: 'two',
					c: { k: 'v' },
				}),
			).to.deep.equal([
				{
					op: 'update',
					path: '/',
					target: { a: 2, b: 'two', c: {} },
				},
				{ op: 'update', path: '/a', target: 2 },
				{ op: 'update', path: '/c', target: {} },
				{ op: 'delete', path: '/c/k' },
			]);

			expect(
				distance({
					a: 1,
					b: 'one',
					c: {},
				}),
			).to.deep.equal([
				{
					op: 'update',
					path: '/',
					target: { a: 2, b: 'one', c: {} },
				},
				{ op: 'update', path: '/a', target: 2 },
			]);

			expect(
				distance({
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

			const distance = Distance.from(src, { a: { b: { c: 'd' } } });
			expect(
				distance({
					a: {},
				}),
			).to.have.deep.members([
				{
					op: 'update',
					path: '/',
					target: { a: { b: { c: 'd' } } },
				},
				{
					op: 'update',
					path: '/a',
					target: { b: { c: 'd' } },
				},
				{ op: 'create', path: '/a/b', target: { c: 'd' } },
			]);
		});

		it('it recursively adds a DELETE operation for the current state', () => {
			type S = { a: { [k: string]: { [k: string]: { [k: string]: string } } } };
			const src: S = {
				a: {},
			};

			const distance = Distance.from(src, { a: { b: UNDEFINED } });
			expect(distance({ a: { b: { c: { d: 'e' } } } })).to.have.deep.members([
				{
					op: 'update',
					path: '/',
					target: { a: {} },
				},
				{
					op: 'update',
					path: '/a',
					target: {},
				},
				{ op: 'delete', path: '/a/b' },
				{ op: 'delete', path: '/a/b/c' },
				{ op: 'delete', path: '/a/b/c/d' },
			]);
		});
	});
});
