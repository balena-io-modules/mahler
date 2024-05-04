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

	describe('startsWith', () => {
		it('compares a lens with a starting path', () => {
			expect(Lens.startsWith(Path.from('/a/b/c'), Path.from('/a'))).to.be.true;
			expect(Lens.startsWith(Path.from('/a/b/c'), Path.from('/a/b'))).to.be
				.true;
			expect(Lens.startsWith(Path.from('/a/b/c'), Path.from('/a/b/c'))).to.be
				.true;
			expect(Lens.startsWith(Path.from('/a/:loc/c'), Path.from('/a/b/c'))).to.be
				.true;
			expect(Lens.startsWith(Path.from('/:key/:loc/c'), Path.from('/a/b/c'))).to
				.be.true;
			expect(
				Lens.startsWith(Path.from('/:key/:loc/:other'), Path.from('/a/b/c')),
			).to.be.true;
			expect(Lens.startsWith(Path.from('/x/:loc/:other'), Path.from('/a/b/c')))
				.to.be.false;
			expect(Lens.startsWith(Path.from('/:key/x/:other'), Path.from('/a/b/c')))
				.to.be.false;
			expect(Lens.startsWith(Path.from('/a/x/:other'), Path.from('/a/b/c'))).to
				.be.false;
			expect(Lens.startsWith(Path.from('/a/b/:other'), Path.from('/a/b/c/d')))
				.to.be.false;
			expect(Lens.startsWith(Path.from('/a/b/c'), Path.from('/a/b/c/d'))).to.be
				.false;
		});
	});

	describe('findAll', () => {
		it('gets the context for all elements matching the lens', () => {
			type State = {
				[k: string]: { b: { c: Array<{ e: string }> }; d: number } | null;
			};
			const s: State = {
				a: { b: { c: [{ e: 'one' }, { e: 'two' }, { e: 'three' }] }, d: 4 },
				z: { b: { c: [{ e: 'nine' }, { e: 'ten' }] }, d: 5 },
				x: null,
			};

			expect(Lens.findAll(s, Path.from('/a/b/c/:pos/e'))).to.deep.equal([
				'/a/b/c/0/e',
				'/a/b/c/1/e',
				'/a/b/c/2/e',
			]);
			expect(Lens.findAll(s, Path.from('/:key/b/c/:pos/e'))).to.deep.equal([
				'/a/b/c/0/e',
				'/a/b/c/1/e',
				'/a/b/c/2/e',
				'/z/b/c/0/e',
				'/z/b/c/1/e',
			]);
			expect(Lens.findAll(s, Path.from('/a/b/c'))).to.deep.equal(['/a/b/c']);
			expect(Lens.findAll(s, Path.from('/a/d'))).to.deep.equal(['/a/d']);
			expect(Lens.findAll(s, Path.from('/x'))).to.deep.equal(['/x']);
			expect(Lens.findAll(s, Path.from('/x/b/c'))).to.deep.equal([]);
		});

		it('allows to start the search at a subpath', () => {
			type State = {
				[k: string]: { b: { c: Array<{ e: string }> }; d: number } | null;
			};
			const s: State = {
				a: { b: { c: [{ e: 'one' }, { e: 'two' }, { e: 'three' }] }, d: 4 },
				z: { b: { c: [{ e: 'nine' }, { e: 'ten' }] }, d: 5 },
				x: null,
			};

			expect(
				Lens.findAll(s, Path.from('/a/b/c/:pos/e'), Path.from('/a/b')),
			).to.deep.equal(['/a/b/c/0/e', '/a/b/c/1/e', '/a/b/c/2/e']);
			expect(
				Lens.findAll(s, Path.from('/:key/b/c/:pos/e'), Path.from('/a/b')),
			).to.deep.equal(['/a/b/c/0/e', '/a/b/c/1/e', '/a/b/c/2/e']);
		});
	});
});
