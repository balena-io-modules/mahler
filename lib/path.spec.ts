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

	describe('source', () => {
		it('returns the parent path', () => {
			expect(Path.source(Path.from('/a/b/c'))).to.equal('/a/b');
			expect(Path.source(Path.from('/a'))).to.equal('/');
			expect(Path.source(Path.from('/'))).to.equal('/');
		});
	});

	describe('basename', () => {
		it('returns the basename of the path', () => {
			expect(Path.basename(Path.from('/a/b/c'))).to.equal('c');
			expect(Path.basename(Path.from('/a'))).to.equal('a');
			expect(Path.basename(Path.from('/'))).to.equal('');
		});
	});
});
