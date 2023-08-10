import { expect } from '~/test-utils';
import { Task } from './tasks';

describe('Tasks', () => {
	it('tasks with the same specification should have the same id', function () {
		const inc = Task.of({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});
		expect(inc.id).to.equal(
			'cc0947a66cd46dd2569628559ff7d57818b57d5bdbbf2d5167a6397a32acf175',
		);

		const inc2 = Task.of({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});
		expect(inc.id).to.equal(inc2.id);

		const inc3 = Task.of({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: 'increment',
		});
		expect(inc.id).to.not.equal(inc3.id);

		const dec = Task.of({
			condition: (state: number, { target }) => state > target,
			effect: (state: number) => state - 1,
			action: async (state: number) => state - 1,
			description: '-1',
		});
		expect(inc.id).to.not.equal(dec.id);

		const byTwo = Task.of({
			condition: (state: number, { target }) => target - state > 1,
			method: (_: number, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});
		expect(byTwo.id).to.equal(
			'e1d9844f32893ee573638dd171ba475bba93e4bb0d5797a654e3f5c43f8d0f46',
		);
		expect(dec.id).to.not.equal(byTwo.id);

		const byTwo2 = Task.of({
			condition: (state: number, { target }) => target - state > 1,
			method: (_: number, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});
		expect(byTwo.id).to.equal(byTwo2.id);
	});
});
