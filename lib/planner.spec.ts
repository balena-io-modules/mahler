import { expect, console } from '~/test-utils';
import { Planner } from './planner';
import { Instruction, Task } from './task';
import { plan, branch, fork, stringify } from './testing';

describe('Planner', () => {
	describe('plan', () => {
		it('block stacking problem: simple', () => {
			type Table = 'table';
			type Hand = 'hand';
			type Block = 'a' | 'b' | 'c';
			type Location = Block | Table | Hand;
			type State = {
				blocks: { [block in Block]: Location };
				hand?: Block | null;
			};

			const isBlock = (x: Location): x is Block =>
				x !== 'table' && x !== 'hand';

			const isClear = (blocks: State['blocks'], location: Location) => {
				if (isBlock(location) || location === 'hand') {
					// No block is on top of the location
					return Object.values(blocks).every((l) => l !== location);
				}
				// The table is always clear
				return true;
			};

			const take = Task.of<State>().from({
				lens: '/blocks/:block',
				condition: (_, { system, block }) =>
					isClear(system.blocks, block) && system.hand == null,
				effect: (location, { system, block }) => {
					// Update the block
					location._ = 'hand';
					system.hand = block;
				},
				description: ({ block }) => `take block ${block}`,
			});

			const put = Task.of<State>().from({
				lens: '/blocks/:block',
				condition: (location, { system, target, block }) =>
					location === 'hand' &&
					target !== block &&
					isClear(system.blocks, target),
				effect: (location, { system, target }) => {
					// Update the block
					location._ = target;
					system.hand = null;
				},
				description: ({ target, block }) => `put ${block} on ${target}`,
			});

			const allClearBlocks = (blocks: State['blocks']) => {
				return Object.keys(blocks).filter((block) =>
					isClear(blocks, block as Block),
				) as Block[];
			};

			/**
			 * This method implements the following block-stacking algorithm [1]:
			 *
			 * - If there's a clear block x that can be moved to a place where it won't
			 *   need to be moved again, then return a todo list that includes goals to
			 *   move it there, followed by mgoal (to achieve the remaining goals).
			 *   Otherwise, if there's a clear block x that needs to be moved out of the
			 *   way to make another block movable, then return a todo list that includes
			 *   goals to move x to the table, followed by mgoal.
			 * - Otherwise, no blocks need to be moved.
			 *   [1] N. Gupta and D. S. Nau. On the complexity of blocks-world
			 *   planning. Artificial Intelligence 56(2-3):223–254, 1992.
			 *
			 * Source: https://github.com/dananau/GTPyhop/blob/main/Examples/blocks_hgn/methods.py
			 */
			const move = Task.of<State>().from({
				lens: '/blocks',
				method: (blocks, { target }) => {
					for (const b of allClearBlocks(blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						if (isClear(blocks, target[b])) {
							return [
								// TODO: take doesn't really need a target. The grounding function might
								// be able to infer if the target is needed depending on the operation?
								take({ block: b, target: target[b] }),
								put({ block: b, target: target[b] }),
							];
						}
					}

					// If we get here, no blocks can be moved to the final location so
					// we move it to the table
					for (const b of allClearBlocks(blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						return [
							take({ block: b, target: target[b] }),
							put({ block: b, target: 'table' }),
						];
					}

					// The method is not applicable here
					return [];
				},
				description:
					'find blocks that can be moved to the final location or to the table',
			});

			const planner = Planner.from<State>({
				tasks: [take, put, move],
				config: { trace: console.trace },
			});

			const result = planner.findPlan(
				{
					blocks: { a: 'table', b: 'a', c: 'b' },
				},
				{ blocks: { a: 'b', b: 'c', c: 'table' } },
			);
			expect(stringify(result)).to.deep.equal(
				plan()
					.action('take block c')
					.action('put c on table')
					.action('take block b')
					.action('put b on c')
					.action('take block a')
					.action('put a on b')
					.end(),
			);
		});

		it('block stacking problem: fancy version', () => {
			type Table = 'table';
			type Hand = 'hand';
			type Block = 'a' | 'b' | 'c';
			type Location = Block | Table | Hand;
			type State = {
				blocks: { [block in Block]: Location };
				hand?: Block | null;
			};

			const isBlock = (x: Location): x is Block =>
				x !== 'table' && x !== 'hand';

			const isClear = (blocks: State['blocks'], location: Location) => {
				if (isBlock(location) || location === 'hand') {
					// No block is on top of the location
					return Object.values(blocks).every((l) => l !== location);
				}
				// The table is always clear
				return true;
			};

			const pickup = Task.of<State>().from({
				lens: '/blocks/:block',
				condition: (location, { system, block }) =>
					isClear(system.blocks, block) &&
					location === 'table' &&
					system.hand == null,
				effect: (location, { system, block }) => {
					// Update the block
					location._ = 'hand';
					system.hand = block;
				},
				description: ({ block }) => `pickup block ${block}`,
			});

			const unstack = Task.of<State>().from({
				lens: '/blocks/:block',
				condition: (location, { system, block }) =>
					// The block has no other blocks on top
					isClear(system.blocks, block) &&
					// The block is on top of other block (not in the hand or the table)
					!['table', 'hand'].includes(location) &&
					// The hand is not holding any other block
					system.hand == null,
				effect: (location, { system, block }) => {
					// Update the block
					location._ = 'hand';
					system.hand = block;
				},
				description: ({ block }) => `unstack block ${block}`,
			});

			const putdown = Task.of<State>().from({
				lens: '/blocks/:block',
				condition: (location) => location === 'hand',
				effect: (location, { system }) => {
					// Update the block
					location._ = 'table';
					// Mark the hand as free
					system.hand = null;
				},
				description: ({ block }) => `put down block ${block}`,
			});

			const stack = Task.of<State>().from({
				lens: '/blocks/:block',
				condition: (location, { system, target }) =>
					// The target has no other blocks on top
					isClear(system.blocks, target) &&
					// The hand is holding the block
					location === 'hand',
				effect: (location, { system, target }) => {
					// Update the block
					location._ = target;
					system.hand = null;
				},
				description: ({ block, target }) =>
					`stack block ${block} on top of block ${target}`,
			});

			const take = Task.of<State>().from({
				lens: '/blocks/:block',
				method: (location, { system, block, target }) => {
					if (isClear(system.blocks, location)) {
						if (location === 'table') {
							// If the block is on the table we need to run the pickup task
							return [pickup({ block, target })];
						} else {
							// Otherwise we unstack the block from another block
							return [unstack({ block, target })];
						}
					}
					return [];
				},
				description: ({ block }) => `take block ${block}`,
			});

			// There is really not that much of a difference between putdown and stack
			// this is just to test that the planner can work with nested methods
			const put = Task.of<State>().from({
				lens: '/blocks/:block',
				method: (location, { block, target }) => {
					if (location === 'hand') {
						if (target === 'table') {
							return [putdown({ block, target })];
						} else {
							return [stack({ block, target })];
						}
					}
					return [];
				},
				description: ({ block, target }) => `put block ${block} on ${target}`,
			});

			const allClearBlocks = (blocks: State['blocks']) => {
				return Object.keys(blocks).filter((block) =>
					isClear(blocks, block as Block),
				) as Block[];
			};

			/**
			 * This method implements the following block-stacking algorithm [1]:
			 *
			 * - If there's a clear block x that can be moved to a place where it won't
			 *   need to be moved again, then return a todo list that includes goals to
			 *   move it there, followed by mgoal (to achieve the remaining goals).
			 *   Otherwise, if there's a clear block x that needs to be moved out of the
			 *   way to make another block movable, then return a todo list that includes
			 *   goals to move x to the table, followed by mgoal.
			 * - Otherwise, no blocks need to be moved.
			 *   [1] N. Gupta and D. S. Nau. On the complexity of blocks-world
			 *   planning. Artificial Intelligence 56(2-3):223–254, 1992.
			 *
			 * Source: https://github.com/dananau/GTPyhop/blob/main/Examples/blocks_hgn/methods.py
			 */
			const move = Task.of<State>().from({
				lens: '/blocks',
				method: (blocks, { target }) => {
					for (const b of allClearBlocks(blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						if (isClear(blocks, target[b])) {
							return [
								// TODO: take doesn't really need a target. The grounding function might
								// be able to infer if the target is needed depending on the operation?
								take({ block: b, target: target[b] }),
								put({ block: b, target: target[b] }),
							];
						}
					}

					// If we get here, no blocks can be moved to the final location so
					// we move it to the table
					for (const b of allClearBlocks(blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						return [
							take({ block: b, target: target[b] }),
							take({ block: b, target: 'table' }),
						];
					}

					// The method is not applicable here
					return [];
				},
				description: `find a block that can be moved to the final location or to the table`,
			});

			const planner = Planner.from<State>({
				tasks: [pickup, unstack, putdown, stack, take, put, move],
				config: { trace: console.trace },
			});

			const result = planner.findPlan(
				{
					blocks: { a: 'table', b: 'a', c: 'b' },
				},
				{ blocks: { a: 'b', b: 'c', c: 'table' } },
			);

			expect(stringify(result)).to.deep.equal(
				plan()
					.action('unstack block c')
					.action('put down block c')
					.action('unstack block b')
					.action('stack block b on top of block c')
					.action('pickup block a')
					.action('stack block a on top of block b')
					.end(),
			);
		});

		it('solves parallel problems', () => {
			type Counters = { [k: string]: number };

			const byOne = Task.of<Counters>().from({
				lens: '/:counter',
				condition: (state, { target }) => state < target,
				effect: (state) => ++state._,
				description: ({ counter }) => `${counter} + 1`,
			});

			const multiIncrement = Task.from<Counters>({
				condition: (state, ctx) =>
					Object.keys(state).filter((k) => ctx.target[k] - state[k] > 0)
						.length > 1,
				method: (state, ctx) =>
					Object.keys(state)
						.filter((k) => ctx.target[k] - state[k] > 0)
						.map((k) => byOne({ counter: k, target: ctx.target[k] })),
				description: `increment counters`,
			});

			const planner = Planner.from({
				tasks: [multiIncrement, byOne],
				config: { trace: console.trace },
			});

			const result = planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });
			expect(stringify(result)).to.deep.equal(
				plan()
					.fork(branch('a + 1'), branch('b + 1'))
					.fork(branch('a + 1'), branch('b + 1'))
					.action('a + 1')
					.end(),
			);
		});

		it('solves parallel problems with methods', () => {
			type Counters = { [k: string]: number };

			const byOne = Task.of<Counters>().from({
				lens: '/:counter',
				condition: (state, { target }) => state < target,
				effect: (state) => ++state._,
				description: ({ counter }) => `${counter} + 1`,
			});

			const byTwo = Task.of<Counters>().from({
				lens: '/:counter',
				condition: (state, { target }) => target - state > 1,
				method: (_, ctx) => [byOne(ctx), byOne(ctx)],
				description: ({ counter }) => `increase '${counter}'`,
			});

			const multiIncrement = Task.from<Counters>({
				condition: (counters, ctx) =>
					Object.keys(counters).some((k) => ctx.target[k] - counters[k] > 1),
				method: (counters, { target }) =>
					Object.keys(counters)
						.filter((k) => target[k] - counters[k] > 1)
						.map((k) => byTwo({ counter: k, target: target[k] })),
				description: `increment counters`,
			});

			const planner = Planner.from({
				tasks: [multiIncrement, byTwo, byOne],
				config: { trace: console.trace },
			});

			const result = planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });

			expect(stringify(result)).to.deep.equal(
				plan()
					.fork(branch('a + 1', 'a + 1'), branch('b + 1', 'b + 1'))
					.action('a + 1')
					.end(),
			);
		});

		it('allows sequential expansion to be forced', () => {
			type Counters = { [k: string]: number };

			const byOne = Task.of<Counters>().from({
				lens: '/:counter',
				condition: (state, { target }) => state < target,
				effect: (state) => ++state._,
				description: ({ counter }) => `${counter} + 1`,
			});

			const byTwo = Task.of<Counters>().from({
				lens: '/:counter',
				condition: (state, { target }) => target - state > 1,
				method: (_, ctx) => [byOne(ctx), byOne(ctx)],
				description: ({ counter }) => `increase '${counter}'`,
			});

			const multiIncrement = Task.from<Counters>({
				expansion: 'sequential',
				condition: (counters, ctx) =>
					Object.keys(counters).some((k) => ctx.target[k] - counters[k] > 1),
				method: (counters, { target }) =>
					Object.keys(counters)
						.filter((k) => target[k] - counters[k] > 1)
						.map((k) => byTwo({ counter: k, target: target[k] })),
				description: `increment counters`,
			});

			const planner = Planner.from({
				tasks: [multiIncrement, byTwo, byOne],
				config: { trace: console.trace },
			});

			const result = planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });

			expect(stringify(result)).to.deep.equal(
				plan()
					.actions('a + 1', 'a + 1')
					.actions('b + 1', 'b + 1')
					.action('a + 1')
					.end(),
			);
		});

		it('Finds parallel plans with nested forks', () => {
			type Counters = { [k: string]: number };

			const byOne = Task.of<Counters>().from({
				lens: '/:counter',
				condition: (state, { target }) => state < target,
				effect: (state) => ++state._,
				description: ({ counter }) => `${counter}++`,
			});

			const byTwo = Task.of<Counters>().from({
				lens: '/:counter',
				condition: (state, { target }) => target - state > 1,
				method: (_, ctx) => [byOne(ctx), byOne(ctx)],
				description: ({ counter }) => `${counter} + 2`,
			});

			const multiIncrement = Task.from<Counters>({
				condition: (counters, { target }) =>
					Object.keys(counters).some((k) => target[k] - counters[k] > 1),
				method: (counters, { target }) =>
					Object.keys(counters)
						.filter((k) => target[k] - counters[k] > 1)
						.map((k) => byTwo({ counter: k, target: target[k] })),
				description: `increment multiple`,
			});

			const chunker = Task.from<Counters>({
				condition: (counters, ctx) =>
					Object.keys(counters).some((k) => ctx.target[k] - counters[k] > 1),
				method: (counters, { target }) => {
					const toUpdate = Object.keys(counters).filter(
						(k) => target[k] - counters[k] > 1,
					);

					const chunkSize = 2;
					const tasks: Array<Instruction<Counters>> = [];
					for (let i = 0; i < toUpdate.length; i += chunkSize) {
						const chunk = toUpdate.slice(i, i + chunkSize);
						tasks.push(
							multiIncrement({
								target: {
									...counters,
									...chunk.reduce((acc, k) => ({ ...acc, [k]: target[k] }), {}),
								},
							}),
						);
					}

					return tasks;
				},
				description: 'chunk',
			});

			const planner = Planner.from({
				tasks: [chunker, multiIncrement, byTwo, byOne],
				config: { trace: console.trace },
			});
			const result = planner.findPlan(
				{ a: 0, b: 0, c: 0, d: 0 },
				{ a: 3, b: 2, c: 2, d: 2 },
			);

			expect(stringify(result)).to.deep.equal(
				plan()
					.fork(
						branch(fork(branch('a++', 'a++'), branch('b++', 'b++'))),
						branch(fork(branch('c++', 'c++'), branch('d++', 'd++'))),
					)
					.action('a++')
					.end(),
			);
		});

		it('reverts to sequential execution if branches have conflicts', () => {
			type Counters = { [k: string]: number };

			const byOne = Task.of<Counters>().from({
				lens: '/:counter',
				condition: (state, { target }) => state < target,
				effect: (state) => ++state._,
				description: ({ counter }) => `${counter} + 1`,
			});

			const conflictingIncrement = Task.from<Counters>({
				condition: (counters, { target }) =>
					Object.keys(counters).filter((k) => target[k] - counters[k] > 1)
						.length > 1,
				method: (counters, { target }) =>
					Object.keys(counters)
						.filter((k) => target[k] - counters[k] > 1)
						.flatMap((k) => [
							// We create parallel steps to increase the same element of the state
							// concurrently
							byOne({ counter: k, target: target[k] }),
							byOne({ counter: k, target: target[k] }),
						]),
				description: `increment counters`,
			});

			const planner = Planner.from({
				tasks: [conflictingIncrement, byOne],
				config: { trace: console.trace },
			});

			const result = planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });

			// The resulting plan is just the linear version because the parallel version
			// will result in a conflict being detected
			expect(stringify(result)).to.deep.equal(
				plan()
					.action('a + 1')
					.action('a + 1')
					.action('b + 1')
					.action('b + 1')
					.action('a + 1')
					.end(),
			);
		});

		it('limits maximum search depth', function () {
			const dec = Task.of<number>().from({
				// There is as bug here
				condition: (state, { target }) => state < target,
				effect: (state) => --state._,
				description: '-1',
			});

			const inc = Task.of<number>().from({
				condition: (state, { target }) => state < target,
				// There is as bug here
				effect: (state) => --state._,
				description: '+1',
			});

			const inc2 = Task.of<number>().from({
				condition: (state, { target }) => state < target,
				// There is as bug here
				effect: (state) => --state._,
				description: '+1 bis',
			});

			const planner = Planner.from<number>({
				tasks: [dec, inc, inc2],
				config: { maxSearchDepth: 2 },
			});

			const result = planner.findPlan(0, 1);
			expect(result.success).to.be.false;
			expect(result.stats.maxDepth).to.equal(2);
		});

		it.skip('simple travel problem', async () => {
			// Alice needs to go to the park and may walk or take a taxi. Depending on the distance to the park and
			// the available cash, some actions may be possible
			expect(false);
		});
	});
});
