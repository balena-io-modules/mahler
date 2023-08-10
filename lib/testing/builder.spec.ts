import { expect } from '~/test-utils';
import { plan } from './builder';

describe('testing/builder', () => {
	it('builds a plan representation', () => {
		expect(plan().end()).to.deep.equal([]);
		expect(plan().action('a').end()).to.deep.equal(['a']);
		expect(plan().action('a').action('b').action('c').end()).to.deep.equal([
			'a',
			'b',
			'c',
		]);
	});
});
