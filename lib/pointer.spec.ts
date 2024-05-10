import { expect } from '~/test-utils';
import { Pointer } from './pointer';
import { Path } from './path';

describe('Pointer', () => {
	describe('of', () => {
		it('calculates the pointer to the path', () => {
			expect(
				Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, Path.from('/a')),
			).to.equal(1);
			expect(
				Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, Path.from('/b')),
			).to.deep.equal({ c: 2, d: { e: 'hello' } });
			expect(
				Pointer.from(
					{ a: 1, b: { c: 2, d: { e: 'hello' } } },
					Path.from('/b/c'),
				),
			).to.equal(2);
			expect(
				Pointer.from(
					{ a: 1, b: { c: 2, d: { e: 'hello' } } },
					Path.from('/b/d'),
				),
			).to.deep.equal({ e: 'hello' });
			expect(
				Pointer.from(
					{ a: 1, b: { c: 2, d: { e: 'hello' } } },
					Path.from('/b/d/e'),
				),
			).to.deep.equal('hello');
			expect(
				Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, Path.from('/')),
			).to.deep.equal({ a: 1, b: { c: 2, d: { e: 'hello' } } });

			expect(
				Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, Path.from('/x')),
			).to.be.undefined;
			expect(
				Pointer.from(
					{ a: 1, b: { c: 2, d: { e: 'hello' } } },
					Path.from('/b/d/x'),
				),
			).to.be.undefined;
			expect(() =>
				Pointer.from(
					{ a: 1, b: { c: 2, d: { e: 'hello' } } },
					Path.from('/a/b/x'),
				),
			).to.throw;
		});

		it('calculates the pointer to a path in an array', () => {
			expect(Pointer.from([1, 2, 3], Path.from(''))).to.deep.equal([1, 2, 3]);
			expect(Pointer.from([1, 2, 3], Path.from('/'))).to.deep.equal([1, 2, 3]);
			expect(Pointer.from([1, 2, 3], Path.from('/0'))).to.equal(1);
			expect(Pointer.from([1, 2, 3], Path.from('/1'))).to.equal(2);
			expect(Pointer.from({ a: [1, 2, 3] }, Path.from('/a/1'))).to.equal(2);
			expect(() => Pointer.from({ a: [1, 2, 3] }, Path.from('/a/b'))).to.throw;
			expect(
				Pointer.from({ a: [1, 2, { b: 'hello' }] }, Path.from('/a/2')),
			).to.deep.equal({
				b: 'hello',
			});
			expect(
				Pointer.from({ a: [1, 2, { b: 'hello' }] }, Path.from('/a/2/b')),
			).to.equal('hello');
		});
	});
});
