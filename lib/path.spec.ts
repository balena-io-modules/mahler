import { expect } from '~/test-utils';
import { Path } from './path';

describe('Path', () => {
	describe('is', () => {
		it('validates a path', () => {
			expect(Path.is('')).to.be.true;
			expect(Path.is('/')).to.be.true;
			expect(Path.is('/a/b/c')).to.be.true;
			expect(Path.is('/a/b1')).to.be.true;
			expect(Path.is('/a/b/1')).to.be.true;
			expect(Path.is('/a/:value/1')).to.be.true;
			expect(Path.is('/a/b_c-123#/1')).to.be.true;
			expect(Path.is('a/b/1')).to.be.false;
			expect(Path.is('a/b//1')).to.be.false;
			expect(Path.is('a/b/ /1')).to.be.false;
			expect(Path.is('a/b/😛/1')).to.be.false;
		});
	});
});
