import { expect } from '~/test-utils';
import { Pointer } from './pointer';

describe('Pointer', () => {
	describe('of', () => {
		it('calculates the pointer to the path', () => {
			expect(
				Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, '/a'),
			).to.equal(1);
			expect(
				Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, '/b'),
			).to.deep.equal({ c: 2, d: { e: 'hello' } });
			expect(
				Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, '/b/c'),
			).to.equal(2);
			expect(
				Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, '/b/d'),
			).to.deep.equal({ e: 'hello' });
			expect(
				Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, '/b/d/e'),
			).to.deep.equal('hello');
			expect(
				Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, '/'),
			).to.deep.equal({ a: 1, b: { c: 2, d: { e: 'hello' } } });

			expect(Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, '/x')).to.be
				.undefined;
			expect(Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, '/b/d/x'))
				.to.be.undefined;
			expect(() =>
				Pointer.from({ a: 1, b: { c: 2, d: { e: 'hello' } } }, '/a/b/x'),
			).to.throw;
		});

		it('calculates the pointer to a path in an array', () => {
			expect(Pointer.from([1, 2, 3], '')).to.deep.equal([1, 2, 3]);
			expect(Pointer.from([1, 2, 3], '/')).to.deep.equal([1, 2, 3]);
			expect(Pointer.from([1, 2, 3], '/0')).to.equal(1);
			expect(Pointer.from([1, 2, 3], '/1')).to.equal(2);
			expect(Pointer.from({ a: [1, 2, 3] }, '/a/1')).to.equal(2);
			expect(() => Pointer.from({ a: [1, 2, 3] }, '/a/b')).to.throw;
			expect(Pointer.from({ a: [1, 2, { b: 'hello' }] }, '/a/2')).to.deep.equal(
				{
					b: 'hello',
				},
			);
			expect(Pointer.from({ a: [1, 2, { b: 'hello' }] }, '/a/2/b')).to.equal(
				'hello',
			);
		});
	});
});
