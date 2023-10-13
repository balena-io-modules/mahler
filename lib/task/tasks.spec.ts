import { expect } from '~/test-utils';
import { Task } from './tasks';

describe('Tasks', () => {
	it('tasks with the same specification should have the same id', function () {
		const inc = Task.from<number>({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: '+1',
		});
		expect(inc.id).to.equal(
			'9d73c72d26c1bbb33a4ee484e399129fcab792122a52a5816f1e0ef20dfc47ec',
		);

		const inc2 = Task.from<number>({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: '+1',
		});
		expect(inc.id).to.equal(inc2.id);

		const inc3 = Task.from<number>({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: 'increment',
		});
		expect(inc.id).to.not.equal(inc3.id);

		const dec = Task.from<number>({
			condition: (state, { target }) => state > target,
			effect: (state) => --state._,
			description: '-1',
		});
		expect(inc.id).to.not.equal(dec.id);

		const byTwo = Task.from<number>({
			condition: (state, { target }) => target - state > 1,
			method: (_, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});
		expect(byTwo.id).to.equal(
			'e6ae37e6ef05cc2ee70493842cd1799aeeec8867c6efd15b1b1f1bca96436a48',
		);
		expect(dec.id).to.not.equal(byTwo.id);

		const byTwo2 = Task.from<number>({
			condition: (state, { target }) => target - state > 1,
			method: (_, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});
		expect(byTwo.id).to.equal(byTwo2.id);
	});
});
