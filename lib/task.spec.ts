import { expect } from '~/tests';
import { Task } from './task';
import { Operation } from './operation';

describe('Task', () => {
	describe('isApplicable', () => {
		it('accepts matching substrings of the given path', () => {
			expect(
				Task.isApplicable(Task.of({ path: '/a/b/c' }), {
					op: 'delete',
					path: '/a/b/c',
				}),
			).to.be.true;
			expect(
				Task.isApplicable(Task.of({ op: 'delete', path: '/a/:arg/c' }), {
					op: 'delete',
					path: '/a/b/c',
				}),
			).to.be.true;
			expect(
				Task.isApplicable(Task.of({ path: '/a/:arg' }), {
					op: 'delete',
					path: '/a/b/c',
				}),
			).to.be.true;
			expect(
				Task.isApplicable(Task.of({ path: '/:arg' }), {
					op: 'delete',
					path: '/a/b/c',
				}),
			).to.be.true;
			expect(
				Task.isApplicable(Task.of({ path: '/a' }), {
					op: 'delete',
					path: '/a/b/c',
				}),
			).to.be.true;
		});

		it('returns false if the operation does not match', () => {
			expect(
				Task.isApplicable(Task.of({ op: 'create', path: '/a/b/c' }), {
					op: 'delete',
					path: '/a/b/c',
				}),
			).to.be.false;
			expect(
				Task.isApplicable(
					Task.of({ op: 'delete', path: '/a/:arg/c' }),
					Operation.of<{ a: { b: { c: string } } }, '/a/b/c'>({
						op: 'create',
						path: '/a/b/c',
						value: 'foo',
					}),
				),
			).to.be.false;
		});

		it('reject paths referencing a different part of the object', () => {
			expect(
				Task.isApplicable(Task.of({ path: '/a/b/c' }), {
					op: 'delete',
					path: '/a/b',
				}),
			).to.be.false;
			expect(
				Task.isApplicable(Task.of({ path: '/a/:arg/c' }), {
					op: 'delete',
					path: '/d/b/c',
				}),
			).to.be.false;
			expect(
				Task.isApplicable(Task.of({ path: '/a/:arg' }), {
					op: 'delete',
					path: '/a',
				}),
			).to.be.false;
			expect(
				Task.isApplicable(Task.of({ path: '/:arg' }), {
					op: 'delete',
					path: '/',
				}),
			).to.be.false;
			expect(
				Task.isApplicable(Task.of({ path: '/a' }), {
					op: 'delete',
					path: '/b/c',
				}),
			).to.be.false;
		});
	});
});
