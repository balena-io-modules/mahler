import { expect } from '~/test-utils';
import { Path } from './path';

describe('Path', () => {
	describe('from', () => {
		it('validates a path', () => {
			expect(() => Path.from('a/b/1')).to.throw;
			expect(() => Path.from('a/b//1')).to.throw;
			expect(() => Path.from('a/b/ /1')).to.throw;
			expect(() => Path.from('a/b/😛/1')).to.throw;
		});

		it('creates a path from either as string or a string array', () => {
			expect(Path.from([])).to.equal('/');
			expect(Path.from('')).to.equal('');
			expect(Path.from('/')).to.equal('/');
			expect(Path.from(['a', 'b', 'c'])).to.equal('/a/b/c');
			expect(Path.from('/a/b/c')).to.equal('/a/b/c');
			expect(Path.from('/a/b1')).to.equal('/a/b1');
			expect(Path.from('/a/b/1')).to.equal('/a/b/1');
			expect(Path.from('/a/b_c-123#/1')).to.equal('/a/b_c-123#/1');
		});
	});
});
