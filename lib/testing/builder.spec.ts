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

	it('builds a plan with parallel branches', () => {
		expect(
			plan()
				.action('a')
				.fork()
				.branch('b', 'c')
				.branch('d')
				.join()
				.action('f')
				.end(),
		).to.deep.equal(['a', [['b', 'c'], ['d']], 'f']);

		expect(
			plan()
				.fork()
				.action('a')
				// A fork within a fork
				.fork()
				.branch('c')
				.branch('d')
				.join()
				.branch('b')
				.join()
				.action('f')
				.end(),
		).to.deep.equal([[['a', [['c'], ['d']]], ['b']], 'f']);
	});

	it('collapses empty branches', () => {
		// Add an empty fork to the plan
		expect(plan().action('a').fork().join().action('f').end()).to.deep.equal([
			'a',
			'f',
		]);
		expect(
			plan()
				.action('a')
				.fork()
				.branch('b', 'c')
				// This branch is empty
				.branch()
				.join()
				.action('f')
				.end(),
		).to.deep.equal(['a', [['b', 'c']], 'f']);
	});
});
