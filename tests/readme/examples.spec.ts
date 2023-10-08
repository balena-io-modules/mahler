import { expect, console as logger } from '~/test-utils';

import { Task, Agent, Ref } from 'mahler';
import { Planner } from 'mahler/planner';
import { stringify, sequence, mermaid, plan, branch } from 'mahler/testing';

import { stub } from 'sinon';

describe('README examples', () => {
	describe('Basic Usage', () => {
		const plusOne = Task.from<number>({
			// This means the task can only be triggered
			// if the system state is below the target
			condition: (state, { target }) => {
				return state < target;
			},
			// The effect of the action is increasing the system
			// counter by 1
			effect: (state) => state._++,
			// An optional description. Useful for testing
			description: '+1',
		});

		it('counter Agent', async () => {
			const counter = Agent.from({
				initial: 0,
				tasks: [plusOne],
				opts: {
					logger,
					minWaitMs: 10,
				},
			});

			// This tells the agent to find a plan from the current
			// state (0) to the target state (3).
			counter.seek(3);

			// Wait at most 1s for the agent to terminate
			const res = await counter.wait();
			if (res.success) {
				expect(res.state).to.equal(3);
			}
		});

		it('counter Planner', () => {
			// Create a new planner
			const planner = Planner.from({
				tasks: [plusOne],
				config: { trace: logger.trace },
			});

			// Find a plan from 0 to 3
			const res = planner.findPlan(0, 3);
			expect(stringify(res)).to.deep.equal(sequence('+1', '+1', '+1'));
		});
	});
	describe('Actions', () => {
		it('using storeCounter', async () => {
			const storeCounter = stub().callsFake((x) => x);

			const plusOne = Task.from<number>({
				condition: (state, { target }) => state < target,
				effect: (state) => ++state._,
				action: async (state) => {
					state._ = storeCounter(state._ + 1);
				},
				description: '+1',
			});

			const counter = Agent.from({
				initial: 0,
				tasks: [plusOne],
				opts: {
					logger,
					minWaitMs: 10,
				},
			});

			// This tells the agent to find a plan from the current
			// state (0) to the target state (3).
			counter.seek(3);

			// Wait at most 1s for the agent to terminate
			const res = await counter.wait(1000);
			if (res.success) {
				expect(res.state).to.equal(3);
			}
			expect(storeCounter).to.have.been.calledThrice;
		});

		it('using storeCounter and readCounter', async () => {
			let fakeCounter = 2;
			const storeCounter = stub().callsFake((x) => {
				fakeCounter = x;
				return fakeCounter;
			});
			const readCounter = stub().callsFake(() => fakeCounter);

			const plusOne = Task.from<number>({
				condition: (state, { target }) => state < target,
				effect: (state) => ++state._,
				action: async (state, { target }) => {
					// We do not trust the state of the agent so we read
					// the stored state beforehand
					state._ = await readCounter();

					// We only update the stored value if it is below the target
					if (state._ < target) {
						state._ = await storeCounter(state._ + 1);
					}
				},
				description: '+1',
			});

			const counter = Agent.from({
				initial: 0,
				tasks: [plusOne],
				opts: {
					logger,
					minWaitMs: 10,
				},
			});

			// This tells the agent to find a plan from the current
			// state (0) to the target state (3).
			counter.seek(3);

			// Wait at most 1s for the agent to terminate
			const res = await counter.wait(1000);
			if (res.success) {
				expect(res.state).to.equal(3);
			}

			// The internal state is 2, so the action will only need
			// to be called once, even if the plan had 3 steps
			expect(readCounter).to.have.been.calledOnce;
			expect(storeCounter).to.have.been.calledOnce;
		});
	});
	describe('Target State', () => {
		type System = {
			// Our counter state
			counter: number;
			// The time of the last time we read the counter
			// state obtained with performance.now()
			lastRead?: number;

			// A boolean flag to track if the state has been
			// commited to storage
			needsWrite: boolean;
		};

		let fakeCounter = 2;
		const storeCounter = stub().callsFake((x) => {
			fakeCounter = x;
			return fakeCounter;
		});
		const readCounter = stub().callsFake(() => fakeCounter);

		// This is the maximum time allowed between reads
		const MAX_READ_DELAY_MS = 1000;

		const read = Task.from<System>({
			// We only read if the state is out of date.
			condition: (state) =>
				state.lastRead == null ||
				performance.now() - state.lastRead > MAX_READ_DELAY_MS,
			// The main effect we are interested in is the update to the lastRead value
			effect: (state) => {
				state._.lastRead = performance.now();
			},
			action: async (state) => {
				// The action reads the counte and returns the updated state
				state._.counter = await readCounter();
				state._.lastRead = performance.now();
			},
			description: 'readCounter',
		});

		const store = Task.from<System>({
			// We only write if the system counter has reached the target
			condition: (state, { target }) =>
				state.counter === target.counter && state.needsWrite,
			// The main effect of the store task is to update the write state
			effect: (state) => {
				state._.needsWrite = false;
			},
			action: async (state) => {
				state._.counter = await storeCounter(state._.counter);
				state._.needsWrite = false;
			},
			description: 'storeCounter',
		});

		const plusOne = Task.from<System>({
			condition: (state, { target }) =>
				state.counter < target.counter &&
				// We'll only update the counter if we know the internal counter is
				// synchronized with the stored state
				state.lastRead != null &&
				performance.now() - state.lastRead < MAX_READ_DELAY_MS,
			// The task has the effect of updating the counter and modifying the write requirement
			// We no longer need to set an action as this operation no longer performs IO
			effect: (state) => {
				state._.counter++;
				state._.needsWrite = true;
			},
			description: '+1',
		});

		it('with needsWrite as target', async () => {
			const planner = Planner.from({
				tasks: [plusOne, read, store],
				config: { trace: logger.trace },
			});

			// Find a plan from 0 to 3
			const res = planner.findPlan(
				{ counter: 0, needsWrite: false },
				{ counter: 3, needsWrite: false },
			);
			expect(stringify(res)).to.deep.equal(
				sequence('readCounter', '+1', '+1', '+1', 'storeCounter'),
			);
		});

		it('without needsWrite as target', async () => {
			const planner = Planner.from({
				tasks: [plusOne, read, store],
				config: { trace: logger.trace },
			});

			// Find a plan from 0 to 3
			const res = planner.findPlan(
				{ counter: 0, needsWrite: false },
				{ counter: 3 },
			);
			expect(stringify(res)).to.deep.equal(
				sequence('readCounter', '+1', '+1', '+1'),
			);
		});
	});

	describe('Methods', () => {
		const plusOne = Task.from<number>({
			// This means the task can only be triggered
			// if the system state is below the target
			condition: (state, { target }) => state < target,
			// The effect of the action is increasing the system
			// counter by 1
			effect: (state) => ++state._,
			// An optional description. Useful for testing
			description: '+1',
		});

		const plusTwo = Task.from<number>({
			condition: (state, { target }) => target - state > 1,
			method: (_, { target }) => [plusOne({ target }), plusOne({ target })],
			description: '+2',
		});

		it('grounding tasks', async () => {
			const doPlusOne = plusOne({ target: 3 });
			expect(await doPlusOne(Ref.of(0))).to.equal(1); // 1

			const doPlusTwo = plusTwo({ target: 3 });
			expect(doPlusTwo(2)).to.have.lengthOf(2);
		});

		it('plan using plusTwo', () => {
			// Create a tracer using the mermaid tool. The argument is the diagram title
			const trace = mermaid();
			const planner = Planner.from({
				tasks: [plusOne, plusTwo],
				config: { trace },
			});

			// Find a plan from 0 to 3
			const res = planner.findPlan(0, 3);
			expect(stringify(res)).to.deep.equal(sequence('+1', '+1', '+1'));
		});

		it('plan using plusThree', () => {
			const plusThree = Task.from<number>({
				condition: (state, { target }) => target - state > 2,
				method: (_, { target }) => [plusTwo({ target }), plusOne({ target })],
				description: '+3',
			});

			// Create a tracer using the mermaid tool. The argument is the diagram title
			const trace = mermaid();
			const planner = Planner.from({
				tasks: [plusOne, plusThree, plusTwo],
				config: { trace },
			});

			// Find a plan from 0 to 3
			const res = planner.findPlan(0, 3);
			expect(stringify(res)).to.deep.equal(sequence('+1', '+1', '+1'));
		});
	});

	describe('Lenses', () => {
		type System = { counters: { [key: string]: number } };

		it('multi counter plusOne', () => {
			const plusOne = Task.from<System>({
				// This task will be chosen only if one of the keys is smaller than the target
				condition: (state, { target }) =>
					Object.keys(state.counters).some(
						(k) => state.counters[k] < target.counters[k],
					),
				effect: (state, { target }) => {
					// We find the first counter below the target, we know it exists because of
					// the condition so we use the non-null assertion (!) at the end
					const key = Object.keys(state._.counters).find(
						(k) => state._.counters[k] < target.counters[k],
					)!;

					// Update the found counter
					state._.counters[key]++;
				},
				description: '+1',
			});

			const planner = Planner.from({
				tasks: [plusOne],
			});

			// Find a plan from 0 to 3
			const res = planner.findPlan(
				{ counters: { a: 0 } },
				{ counters: { a: 3 } },
			);
			expect(stringify(res)).to.deep.equal(sequence('+1', '+1', '+1'));
		});

		it('multi counter plusOne using lenses', () => {
			/* TODO */
		});
	});

	describe('Parallelism', () => {
		type System = { counters: { [key: string]: number } };

		const plusOne = Task.of<System>().from({
			lens: '/counters/:counterId',
			condition: (counter, { target }) => counter < target,
			effect: (counter) => ++counter._,
			description: ({ counterId }) => `${counterId} + 1`,
		});

		it('multiple plusOne', () => {
			const trace = mermaid();
			const planner = Planner.from({
				tasks: [plusOne],
				config: { trace },
			});

			planner.findPlan(
				{ counters: { a: 0, b: 0 } },
				{ counters: { a: 2, b: 2 } },
			);
			// Remove the comment below to print the diagram to console
			// console.log(trace.render());
		});

		it('parallel plusOne', () => {
			const nPlusOne = Task.of<System>().from({
				lens: '/counters',
				condition: (counters, { target }) =>
					Object.keys(counters).some((k) => counters[k] < target[k]),
				method: (counters, { target }) =>
					Object.keys(counters).map((k) =>
						plusOne({ counterId: k, target: target[k] }),
					),
				description: 'counters++',
			});

			const trace = mermaid();
			const planner = Planner.from({
				tasks: [plusOne, nPlusOne],
				config: { trace },
			});

			const res = planner.findPlan(
				{ counters: { a: 0, b: 0 } },
				{ counters: { a: 2, b: 2 } },
			);
			// Remove the comment below to print the diagram to console
			console.log(trace.render());

			expect(stringify(res)).to.deep.equal(
				plan()
					.fork(branch('a + 1'), branch('b + 1'))
					.fork(branch('a + 1'), branch('b + 1'))
					.end(),
			);
		});
	});
});
