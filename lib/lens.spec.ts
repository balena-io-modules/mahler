import { expect } from '~/test-utils';
import { Lens } from './lens';
import { Path } from './path';

describe('Lens', () => {
	describe('context', () => {
		it('gets context from generic dictionary', () => {
			type Counters = { [K in keyof any]: number };
			const c = Lens.context<Counters, '/'>(Path.from(`/`), Path.from(`/`), {
				a: 1,
				b: 2,
			});
			expect(c).to.deep.include({
				target: { a: 1, b: 2 },
			});
		});

		it('calculates a simple context', () => {
			type State = { a: { b: { c: string[] }; d: number } };

			const c = Lens.context<State, '/a/b/:value'>(
				Path.from('/a/b/:value'),
				Path.from('/a/b/c'),
				['one', 'two'],
			);

			expect(c).to.deep.include({
				target: ['one', 'two'],
				value: 'c',
			});
		});

		it('calculates a context on a dynamic object', () => {
			type State = { objects: { [id: string]: { value: number } } };

			const ctx = Lens.context<State, '/objects/:id'>(
				Path.from('/objects/:id'),
				Path.from('/objects/second'),
				{ value: 123 },
			);

			expect(ctx).to.deep.include({ id: 'second', target: { value: 123 } });
		});

		it('calculates a context with arrays', () => {
			type State = { a: { b: { c: string[] }; d: number } };

			const c = Lens.context<State, '/a/b/c/:pos'>(
				Path.from('/a/b/c/:pos'),
				Path.from('/a/b/c/0'),
				'one',
			);

			expect(c).to.deep.include({
				target: 'one',
				pos: 0,
			});
		});

		it('calculates a context nested in an array', () => {
			type State = { a: { b: { c: Array<{ e: string }> }; d: number } };

			const c = Lens.context<State, '/a/b/c/:pos/e'>(
				Path.from('/a/b/c/:pos/e'),
				Path.from('/a/b/c/0/e'),
				'one',
			);

			expect(c).to.deep.include({
				target: 'one',
				pos: 0,
			});
		});
	});
});
