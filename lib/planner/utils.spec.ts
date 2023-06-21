import { expect } from '~/tests';
import { isTaskApplicable } from './utils';
import { Task, NoEffect } from '../task';
import { Operation } from '../operation';

describe('planner/utils', () => {
	describe('isTaskApplicable', () => {
		it('accept matching paths between a Task and an Operation', () => {
			expect(
				isTaskApplicable(
					Task.of({ op: 'delete', path: '/a/b/c', effect: NoEffect }),
					{
						op: 'delete',
						path: '/a/b/c',
					},
				),
			).to.be.true;
			expect(
				isTaskApplicable(
					Task.of({ op: 'delete', path: '/a/:arg/c', effect: NoEffect }),
					{
						op: 'delete',
						path: '/a/b/c',
					},
				),
			).to.be.true;
		});

		it('returns false if the operation does not match', () => {
			expect(
				isTaskApplicable(
					Task.of({ op: 'create', path: '/a/b/c', effect: NoEffect }),
					{
						op: 'delete',
						path: '/a/b/c',
					},
				),
			).to.be.false;
			expect(
				isTaskApplicable(
					Task.of({ op: 'delete', path: '/a/:arg/c', effect: NoEffect }),
					Operation.of<{ a: { b: { c: string } } }, '/a/b/c'>({
						op: 'create',
						path: '/a/b/c',
						value: 'foo',
					}),
				),
			).to.be.false;
		});

		it('reject paths referencing a different part of the state object', () => {
			expect(
				isTaskApplicable(Task.of({ path: '/a/b/c', effect: NoEffect }), {
					op: 'delete',
					path: '/a/b',
				}),
			).to.be.false;
			expect(
				isTaskApplicable(Task.of({ path: '/a/:arg/c', effect: NoEffect }), {
					op: 'delete',
					path: '/d/b/c',
				}),
			).to.be.false;
			expect(
				isTaskApplicable(Task.of({ path: '/a/:arg', effect: NoEffect }), {
					op: 'delete',
					path: '/a',
				}),
			).to.be.false;
			expect(
				isTaskApplicable(Task.of({ path: '/:arg', method: () => [] }), {
					op: 'delete',
					path: '/',
				}),
			).to.be.false;
			expect(
				isTaskApplicable(Task.of({ path: '/a', effect: NoEffect }), {
					op: 'delete',
					path: '/b/c',
				}),
			).to.be.false;
		});
	});
});
