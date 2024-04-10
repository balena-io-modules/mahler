import { expect } from '~/test-utils';
import { Task } from '../task';
import { runTask } from './run-task';

describe('testing/run-task', () => {
	const plusOne = Task.of<number>().from({
		// This means the task can only be triggered
		// if the system state is below the target
		condition: (state, { target }) => state < target,
		// The effect of the action is increasing the system
		// counter by 1
		effect: (state) => ++state._,
		// An optional description. Useful for testing
		description: '+1',
	});

	const plusTwo = Task.of<number>().from({
		condition: (state, { target }) => target - state > 1,
		method: (_, { target }) => [plusOne({ target }), plusOne({ target })],
		description: '+2',
	});

	const plusThree = Task.of<number>().from({
		condition: (state, { target }) => target - state > 2,
		method: (_, { target }) => [plusTwo({ target }), plusOne({ target })],
		description: '+3',
	});

	const buggedPlusThree = Task.of<number>().from({
		method: (_, { target }) => [plusTwo({ target }), plusOne({ target })],
		description: '+3',
	});

	it('runs an action task if the condition is met', async () => {
		expect(await runTask(plusOne, 1, { target: 2 })).to.equal(2);
		expect(await runTask(plusOne, 0, { target: 2 })).to.equal(1);
	});

	it('throws if the condition of an action task is not met', async () => {
		await expect(runTask(plusOne, 2, { target: 2 })).to.be.rejected;
		await expect(runTask(plusOne, 3, { target: 2 })).to.be.rejected;
	});

	it('runs a method task by expanding its actions', async () => {
		expect(await runTask(plusTwo, 0, { target: 2 })).to.equal(2);
		expect(await runTask(plusTwo, 1, { target: 4 })).to.equal(3);
		expect(await runTask(plusThree, 1, { target: 4 })).to.equal(4);
	});

	it('throws if a condition of a method task is not met', async () => {
		await expect(runTask(plusTwo, 2, { target: 2 })).to.be.rejected;
		await expect(runTask(plusTwo, 3, { target: 4 })).to.be.rejected;
		await expect(runTask(plusThree, 2, { target: 4 })).to.be.rejected;
		// the condition for the plusTwo call should fail here
		await expect(runTask(buggedPlusThree, 3, { target: 4 })).to.be.rejected;
	});
});
