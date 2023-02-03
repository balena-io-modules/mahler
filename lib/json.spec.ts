import { expect } from '~/tests';
import { patch, equals } from './json';

describe('JSON utils', () => {
	describe('equals', () => {
		it('should compare non-objects', () => {
			expect(equals(0, 1)).to.be.false;
			expect(equals(1111, 'a' as any)).to.be.false;
			expect(equals(1111, 2222)).to.be.false;
			expect(equals('aaa', 'bbb')).to.be.false;
			expect(equals('aaa', 'aaa')).to.be.true;
			expect(equals(null, null)).to.be.true;
			expect(equals(null, undefined)).to.be.false;
			expect(equals([], [])).to.be.true;
			expect(equals([1, 2, 3], [1, 2, 3])).to.be.true;
			expect(equals([1, 2, 3], [1, 2])).to.be.false;
			expect(equals([], []), 'empty arrays').to.be.true;
		});

		it('should compare objects recursively', () => {
			expect(equals({}, {}), 'empty objects').to.be.true;
			expect(equals({ a: 1 }, { a: 1 }), 'single level objects').to.be.true;
			expect(equals({ a: 1 }, { a: 2 }), 'differing value single level objects')
				.to.be.false;
			expect(equals({ a: 1 }, { b: 1 }), 'differing keys single level objects');
			expect(
				equals({ a: 1 }, { b: 1, c: 2 }),
				'differing keys single level objects',
			).to.be.false;
			expect(equals({ a: { b: 1 } }, { a: { b: 1 } }), 'multiple level objects')
				.to.be.true;
			expect(
				equals({ a: { b: 1 } }, { a: { b: 1, c: 2 } }),
				'extra keys in multiple level objects',
			).to.be.false;
			expect(
				equals({ a: { b: 1 }, c: 2 }, { a: { b: 1 } }),
				'source object with extra keys',
			).to.be.false;
			expect(
				equals({ a: { b: 1 } }, { a: { b: 1 }, c: 2 }),
				'other object with extra keys',
			).to.be.false;
			expect(
				equals({ a: { b: 1 }, c: 2 }, { a: { b: 1 }, c: 2 }),
				'multiple level objects with extra keys',
			).to.be.true;
			expect(
				equals({ a: { b: 1 }, d: 2 }, { a: { b: 1 }, c: 2 }),
				'multiple level objects with same number of keys',
			).to.be.false;
		});
	});

	describe('patch', () => {
		it('updates first level objects', () => {
			expect(patch({ a: 1 }, { a: 2 })).to.deep.equal({ a: 2 });
			expect(patch({ a: 1, b: 1 }, { b: 2 })).to.deep.equal({ a: 1, b: 2 });

			// Do not merge arrays
			expect(patch({ a: 1, b: [1, 2, 3] }, { b: [3, 4, 5] })).to.deep.equal({
				a: 1,
				b: [3, 4, 5],
			});
		});

		it('updates nested objects', () => {
			expect(patch({ a: 1, b: { c: 3, d: { e: 4 } } }, { a: 2 })).to.deep.equal(
				{
					a: 2,
					b: { c: 3, d: { e: 4 } },
				},
			);
			expect(
				patch({ a: 1, b: { c: 3, d: { e: 4 } } }, { b: { c: 4 } }),
			).to.deep.equal({
				a: 1,
				b: { c: 4, d: { e: 4 } },
			});
			expect(
				patch({ a: 1, b: { c: 3, d: { e: 4 } } }, { b: { d: { e: 5 } } }),
			).to.deep.equal({
				a: 1,
				b: { c: 3, d: { e: 5 } },
			});

			// Do not merge arrays
			expect(
				patch(
					{ a: 1, b: { c: [{ d: 1, e: 4 }, { d: 3 }] } },
					{ b: { c: [{ d: 1, e: 5 }] } },
				),
			).to.deep.equal({
				a: 1,
				b: { c: [{ d: 1, e: 5 }] },
			});
		});
	});
});
