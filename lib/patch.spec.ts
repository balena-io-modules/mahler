import { expect } from '~/tests';
import patch from './patch';

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
		expect(patch({ a: 1, b: { c: 3, d: { e: 4 } } }, { a: 2 })).to.deep.equal({
			a: 2,
			b: { c: 3, d: { e: 4 } },
		});
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
