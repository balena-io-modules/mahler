import { expect } from '~/test-utils';
import { Target, UNDEFINED } from './target';

describe('Target', () => {
	describe('from', () => {
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
				Target.from(state, {
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
	});
});