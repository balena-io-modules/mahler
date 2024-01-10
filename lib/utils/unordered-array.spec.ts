import { expect } from '~/test-utils';
import { UnorderedArray } from './unordered-array';

describe('UnorderedArray', () => {
	it('allows to find elements via deep equality', () => {
		expect(UnorderedArray.of(0, 1, 2, 3).includes(2)).to.be.true;
		expect(UnorderedArray.of(0, 1, 2, 3).includes(5)).to.be.false;
		expect(new UnorderedArray('a', 'b', 'c').includes('a')).to.be.true;
		expect(new UnorderedArray('a', 'b', 'c').includes('f')).to.be.false;
		expect(new UnorderedArray({ a: 0 }, { a: 1 }, { b: 0 }).includes({ a: 0 }))
			.to.be.true;
		expect(new UnorderedArray({ a: 0 }, { a: 1 }, { b: 0 }).includes({ a: 3 }))
			.to.be.false;
	});

	it('allows comparisons ignoring the order', () => {
		expect(
			UnorderedArray.of({ a: 0 }, { a: 0 }, { b: 1 }).equals([
				{ b: 1 },
				{ a: 0 },
			]),
		).to.be.false;
		expect(
			UnorderedArray.of({ a: 0 }, { b: 1 }).equals([
				{ a: 0 },
				{ a: 0 },
				{ b: 1 },
			]),
		).to.be.false;
		expect(UnorderedArray.of({ a: 0 }, { b: 1 }).equals([{ b: 1 }, { a: 0 }]))
			.to.be.true;
	});

	it('UnorderedArray is also an Array', () => {
		expect(UnorderedArray.of(0, 1, 2) instanceof Array).to.be.true;
		expect(Array.isArray(UnorderedArray.of(0, 1, 2))).to.be.true;
	});
});
