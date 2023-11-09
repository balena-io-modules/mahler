import { expect } from '~/test-utils';
import { isTaskApplicable } from './utils';
import { Task, NoEffect } from '../task';

describe('planner/utils', () => {
	describe('isTaskApplicable', () => {
		it('accept matching paths between a Task and an Operation', () => {
			expect(
				isTaskApplicable(
					Task.from({ op: 'delete', lens: '/a/b/c', effect: NoEffect }),
					{
						op: 'delete',
						path: '/a/b/c',
					},
				),
			).to.be.true;
			expect(
				isTaskApplicable(
					Task.from({ op: 'delete', lens: '/a/:arg/c', effect: NoEffect }),
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
					Task.from({ op: 'create', lens: '/a/b/c', effect: NoEffect }),
					{
						op: 'delete',
						path: '/a/b/c',
					},
				),
			).to.be.false;
			expect(
				isTaskApplicable(
					Task.from({ op: 'delete', lens: '/a/:arg/c', effect: NoEffect }),
					{
						op: 'create',
						path: '/a/b/c',
						target: 'foo',
					},
				),
			).to.be.false;
		});

		it('reject paths referencing a different part of the state object', () => {
			expect(
				isTaskApplicable(Task.from({ lens: '/a/b/c', effect: NoEffect }), {
					op: 'delete',
					path: '/a/b',
				}),
			).to.be.false;
			expect(
				isTaskApplicable(Task.from({ lens: '/a/:arg/c', effect: NoEffect }), {
					op: 'delete',
					path: '/d/b/c',
				}),
			).to.be.false;
			expect(
				isTaskApplicable(Task.from({ lens: '/a/:arg', effect: NoEffect }), {
					op: 'delete',
					path: '/a',
				}),
			).to.be.false;
			expect(
				isTaskApplicable(Task.from({ lens: '/:arg', method: () => [] }), {
					op: 'delete',
					path: '/',
				}),
			).to.be.false;
			expect(
				isTaskApplicable(Task.from({ lens: '/a', effect: NoEffect }), {
					op: 'delete',
					path: '/b/c',
				}),
			).to.be.false;
		});
	});
});
