import { expect } from '~/test-utils';
import { deepEqual } from './deep-equal';

describe('deepEqual', () => {
	it('allows to compare objects of equal type', () => {
		expect(deepEqual(1, 1)).to.be.true;
		expect(deepEqual(1, 2)).to.be.false;
		expect(deepEqual(1.0, 0x01)).to.be.true;
		expect(deepEqual(1.1, 1.1)).to.be.true;
		expect(deepEqual('a', 'a')).to.be.true;
		expect(deepEqual('b', 'a')).to.be.false;
		expect(deepEqual('b', 'a')).to.be.false;
		expect(deepEqual([0, 1, 2], [0, 1, 2])).to.be.true;
		expect(deepEqual([1, 0, 2], [0, 1, 2])).to.be.false;
		expect(deepEqual({ a: 1 }, { a: 1 })).to.be.true;
		expect(deepEqual({ a: 1 }, { a: 2 })).to.be.false;
		expect(deepEqual({ a: { b: 0 } }, { a: 2 })).to.be.false;
		expect(deepEqual({ a: { b: 0 } }, { a: { b: 1 } })).to.be.false;
		expect(deepEqual({ a: { b: 0 } }, { a: { b: 0 } })).to.be.true;
		expect(
			deepEqual(
				{ a: { b: 0, c: { d: 'hello' } } },
				{ a: { b: 0, c: { d: [0, 1] } } },
			),
		).to.be.false;
		expect(
			deepEqual(
				{ a: { b: 0, c: { d: 'hello' } } },
				{ a: { b: 0, c: { d: 'hello' } } },
			),
		).to.be.true;
	});

	it('allows to compare objecs using the Eq interface', () => {
		class UnorderedArray<T> extends Array<T> {
			equals(other: T[]) {
				if (this.length !== other.length) {
					return false;
				}

				const a = [...this];
				const b = [...other];

				a.sort();
				b.sort();

				return a.every((x, i) => deepEqual(x, b[i]));
			}
		}

		expect(deepEqual(new UnorderedArray(0, 1, 2), new UnorderedArray(1, 0, 2)))
			.to.be.true;
		expect(deepEqual(new UnorderedArray(0, 1, 2), new UnorderedArray(1, 3, 2)))
			.to.be.false;
	});
});
