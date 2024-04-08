import { expect } from '~/test-utils';
import { Target, UNDEFINED } from './target';

describe('Target', () => {
	describe('fromStrict', () => {
		it('adds UNDEFINED symbols for missing values on the target', () => {
			type S = {
				a: number;
				b?: string;
				c: { d?: { e: number; f?: string } };
				g: { [k: string]: string };
			};
			const state: S = {
				a: 1,
				b: 'foo',
				c: { d: { e: 2, f: 'bar' } },
				g: { i: 'goodbye' },
			};

			expect(
				Target.fromStrict(state, {
					a: 1,
					c: { d: { e: 3, f: undefined } },
					g: { h: 'hello' },
				}),
			).to.deep.equal({
				a: 1,
				b: UNDEFINED,
				c: {
					d: { e: 3, f: UNDEFINED },
				},
				g: { h: 'hello', i: UNDEFINED },
			});
		});

		it('ignores paths matching globs on the list', () => {
			type S = {
				a: number;
				b?: string;
				c: { d?: { e: number; f?: string }; h?: string };
				g: { [k: string]: string };
			};
			const state: S = {
				a: 1,
				b: 'foo',
				c: { d: { e: 2, f: 'bar' }, h: 'baz' },
				g: { i: 'goodbye' },
			};

			expect(
				Target.fromStrict(
					state,
					{
						a: 1,
						c: { d: { e: 3, f: undefined } },
						g: { h: 'hello' },
					},
					['/b', '*/g', '/c/*/f'],
				),
			).to.deep.equal({
				a: 1,
				c: {
					d: { e: 3, f: UNDEFINED },
					h: UNDEFINED,
				},
				g: { h: 'hello' },
			});
		});

		it('does not iterate into arrays', () => {
			type S = {
				a?: string[];
			};

			const state: S = { a: ['foo', 'bar'] };
			expect(Target.fromStrict(state, {})).to.deep.equal({ a: UNDEFINED });
			expect(Target.fromStrict(state, { a: ['foo'] })).to.deep.equal({
				a: ['foo'],
			});
			expect(Target.fromStrict(state, { a: ['bar'] })).to.deep.equal({
				a: ['bar'],
			});
		});
	});
});
