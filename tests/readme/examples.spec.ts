import { expect, console as logger } from '~/test-utils';

import { Task, Agent } from 'mahler';
import { Planner } from 'mahler/planner';
import { stringify, sequence, mermaid, plan, branch } from 'mahler/testing';

import { stub } from 'sinon';

describe('README examples', () => {
	describe('Basic Usage', () => {
		const plusOne = Task.from({
			// This means the task can only be triggered
			// if the system state is below the target
			condition: (state: number, { target }) => state < target,
			// The effect of the action is increasing the system
			// counter by 1
			effect: (state: number) => state + 1,
			// An optional description. Useful for testing
			description: '+1',
		});

		it('counter Agent', async () => {
			const counter = Agent.of({
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
			const planner = Planner.of({ tasks: [plusOne] });

			// Find a plan from 0 to 3
			const res = planner.findPlan(0, 3);
			expect(stringify(res)).to.deep.equal(sequence('+1', '+1', '+1'));
		});
	});
	describe('Actions', () => {
		it('using storeCounter', async () => {
			const storeCounter = stub().callsFake((x) => x);

			const plusOne = Task.from({
				condition: (state: number, { target }) => state < target,
				effect: (state: number) => state + 1,
				action: async (state: number) => {
					const newState = state + 1;
					return await storeCounter(newState);
				},
				description: '+1',
			});

			const counter = Agent.of({
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

			const plusOne = Task.from({
				condition: (state: number, { target }) => state < target,
				effect: (state: number) => state + 1,
				action: async (_: number, { target }) => {
					// We do not trust the state of the agent so we read
					// the stored state beforehand
					const oldState = await readCounter();

					// We only update the stored value if it is below the target
					if (oldState < target) {
						const newState = oldState + 1;
						return await storeCounter(newState);
					}
					return oldState;
				},
				description: '+1',
			});

			const counter = Agent.of({
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

		const readCounter = stub();
		const storeCounter = stub();

		// This is the maximum time allowed between reads
		const MAX_READ_DELAY_MS = 1000;

		const read = Task.from({
			// We only read if the state is out of date.
			condition: (state: System) =>
				state.lastRead == null ||
				performance.now() - state.lastRead > MAX_READ_DELAY_MS,
			// The main effect we are interested in is the update to the lastRead value
			effect: (state: System) => ({ ...state, lastRead: performance.now() }),
			action: async (state: System) => {
				// The action reads the counte and returns the updated state
				const counter = await readCounter();
				return { ...state, counter, lastRead: performance.now() };
			},
			description: 'readCounter',
		});

		const store = Task.from({
			// We only write if the system counter has reached the target
			condition: (state: System, { target }) =>
				state.counter === target.counter && state.needsWrite,
			// The main effect of the store task is to update the write state
			effect: (state: System) => ({ ...state, needsWrite: false }),
			action: async (state: System) => {
				const counter = await storeCounter(state.counter);
				return { ...state, counter, needsWrite: false };
			},
			description: 'storeCounter',
		});

		const plusOne = Task.from({
			condition: (state: System, { target }) =>
				state.counter < target.counter &&
				// We'll only update the counter if we know the internal counter is
				// synchronized with the stored state
				state.lastRead != null &&
				performance.now() - state.lastRead < MAX_READ_DELAY_MS,
			// The task has the effect of updating the counter and modifying the write requirement
			// We no longer need to set an action as this operation no longer performs IO
			effect: (state: System) => ({
				...state,
				counter: state.counter + 1,
				needsWrite: true,
			}),
			description: '+1',
		});

		it('with needsWrite as target', async () => {
			const planner = Planner.of({
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
			const planner = Planner.of({
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
		const plusOne = Task.from({
			// This means the task can only be triggered
			// if the system state is below the target
			condition: (state: number, { target }) => state < target,
			// The effect of the action is increasing the system
			// counter by 1
			effect: (state: number) => state + 1,
			// An optional description. Useful for testing
			description: '+1',
		});

		const plusTwo = Task.from({
			condition: (state: number, { target }) => target - state > 1,
			method: (_: number, { target }) => [
				plusOne({ target }),
				plusOne({ target }),
			],
			description: '+2',
		});

		it('grounding tasks', async () => {
			const doPlusOne = plusOne({ target: 3 });
			expect(await doPlusOne(0)).to.equal(1); // 1

			const doPlusTwo = plusTwo({ target: 3 });
			expect(doPlusTwo(2)).to.have.lengthOf(2);
		});

		it('plan using plusTwo', () => {
			// Create a tracer using the mermaid tool. The argument is the diagram title
			const trace = mermaid();
			const planner = Planner.of({
				tasks: [plusOne, plusTwo],
				config: { trace },
			});

			// Find a plan from 0 to 3
			const res = planner.findPlan(0, 3);
			expect(stringify(res)).to.deep.equal(sequence('+1', '+1', '+1'));
		});

		it('plan using plusThree', () => {
			const plusThree = Task.from({
				condition: (state: number, { target }) => target - state > 2,
				method: (_: number, { target }) => [
					plusTwo({ target }),
					plusOne({ target }),
				],
				description: '+3',
			});

			// Create a tracer using the mermaid tool. The argument is the diagram title
			const trace = mermaid();
			const planner = Planner.of({
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
			const plusOne = Task.from({
				// This task will be chosen only if one of the keys is smaller than the target
				condition: (state: System, { target }) =>
					Object.keys(state.counters).some(
						(k) => state.counters[k] < target.counters[k],
					),
				effect: (state: System, { target }) => {
					// We find the first counter below the target, we know it exists because of
					// the condition so we use the non-null assertion (!) at the end
					const key = Object.keys(state.counters).find(
						(k) => state.counters[k] < target.counters[k],
					)!;

					// We return the updated state with the modified counter
					return {
						...state,
						counters: { ...state.counters, [key]: state.counters[key] + 1 },
					};
				},
				description: '+1',
			});

			const planner = Planner.of({
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

		const plusOne = Task.from({
			path: '/counters/:counterId',
			condition: (state: System, ctx) => ctx.get(state) < ctx.target,
			effect: (state: System, ctx) => ctx.set(state, ctx.get(state) + 1),
			description: ({ counterId }) => `${counterId} + 1`,
		});

		it('multiple plusOne', () => {
			const trace = mermaid();
			const planner = Planner.of({
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
			const nPlusOne = Task.from({
				path: '/counters',
				condition: (state: System, ctx) =>
					Object.keys(ctx.get(state)).some(
						(k) => ctx.get(state)[k] < ctx.target[k],
					),
				method: (state: System, ctx) =>
					Object.keys(ctx.get(state)).map((k) =>
						plusOne({ counterId: k, target: ctx.target[k] }),
					),
				description: 'counters++',
			});

			const trace = mermaid();
			const planner = Planner.of({
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
