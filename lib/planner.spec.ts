import { expect, console } from '~/test-utils';
import { Planner } from './planner';
import { Instruction, Task } from './task';
import { plan, branch, fork, stringify } from './testing';
import { Effect, when, fromPipe } from './effects';

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

			const take = Task.of({
				path: '/blocks/:block',
				condition: (s: State, location) =>
					isClear(s.blocks, location.block) && s.hand == null,
				effect: (s: State, location) => {
					// Update the block
					s = location.set(s, 'hand');
					s.hand = location.block;
					return s;
				},
				description: (location) => `take block ${location.block}`,
			});

			const put = Task.of({
				path: '/blocks/:block',
				condition: (s: State, location) =>
					location.get(s) === 'hand' &&
					location.target !== location.block &&
					isClear(s.blocks, location.target),
				effect: (s: State, location) => {
					// Update the block
					s = location.set(s, location.target);
					s.hand = null;
					return s;
				},
				description: (location) =>
					`put ${location.block} on ${location.target}`,
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
			const move = Task.of({
				path: '/blocks',
				method: (s: State, blocks) => {
					for (const b of allClearBlocks(s.blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						if (isClear(s.blocks, blocks.target[b])) {
							return [
								// TODO: take doesn't really need a target. The grounding function might
								// be able to infer if the target is needed depending on the operation?
								take({ block: b, target: blocks.target[b] }),
								put({ block: b, target: blocks.target[b] }),
							];
						}
					}

					// If we get here, no blocks can be moved to the final location so
					// we move it to the table
					for (const b of allClearBlocks(s.blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						return [
							take({ block: b, target: blocks.target[b] }),
							put({ block: b, target: 'table' }),
						];
					}

					// The method is not applicable here
					return [];
				},
				description:
					'find blocks that can be moved to the final location or to the table',
			});

			const planner = Planner.of<State>({
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

			const pickup = Task.of({
				path: '/blocks/:block',
				condition: (s: State, location) =>
					isClear(s.blocks, location.block) &&
					location.get(s) === 'table' &&
					s.hand == null,
				effect: (s: State, location) => {
					// Update the block
					s = location.set(s, 'hand');
					s.hand = location.block;
					return s;
				},
				description: (location) => `pickup block ${location.block}`,
			});

			const unstack = Task.of({
				path: '/blocks/:block',
				condition: (s: State, location) =>
					// The block has no other blocks on top
					isClear(s.blocks, location.block) &&
					// The block is on top of other block (not in the hand or the table)
					!['table', 'hand'].includes(location.get(s)) &&
					// The hand is not holding any other block
					s.hand == null,
				effect: (s: State, location) => {
					// Update the block
					s = location.set(s, 'hand');
					s.hand = location.block;
					return s;
				},
				description: (location) => `unstack block ${location.block}`,
			});

			const putdown = Task.of({
				path: '/blocks/:block',
				condition: (s: State, location) => location.get(s) === 'hand',
				effect: (s: State, location) => {
					// Update the block
					s = location.set(s, 'table');
					// Mark the hand as free
					s.hand = null;
					return s;
				},
				description: (location) => `put down block ${location.block}`,
			});

			const stack = Task.of({
				path: '/blocks/:block',
				condition: (s: State, location) =>
					// The target has no other blocks on top
					isClear(s.blocks, location.target) &&
					// The hand is holding the block
					location.get(s) === 'hand',
				effect: (s: State, location) => {
					// Update the block
					s = location.set(s, location.target);
					s.hand = null;
					return s;
				},
				description: (location) =>
					`stack block ${location.block} on top of block ${location.target}`,
			});

			const take = Task.of({
				path: '/blocks/:block',
				method: (s: State, location) => {
					if (isClear(s.blocks, location.get(s))) {
						const { block, target } = location;
						if (location.get(s) === 'table') {
							// If the block is on the table we need to run the pickup task
							return [pickup({ block, target })];
						} else {
							// Otherwise we unstack the block from another block
							return [unstack({ block, target })];
						}
					}
					return [];
				},
				description: (location) => `take block ${location.block}`,
			});

			// There is really not that much of a difference between putdown and stack
			// this is just to test that the planner can work with nested methods
			const put = Task.of({
				path: '/blocks/:block',
				method: (s: State, location) => {
					const { block, target } = location;
					if (location.get(s) === 'hand') {
						if (target === 'table') {
							return [putdown({ block, target })];
						} else {
							return [stack({ block, target })];
						}
					}
					return [];
				},
				description: (location) =>
					`put block ${location.block} on ${location.target}`,
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
			const move = Task.of({
				path: '/blocks',
				method: (s: State, blocks) => {
					for (const b of allClearBlocks(s.blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						if (isClear(s.blocks, blocks.target[b])) {
							return [
								// TODO: take doesn't really need a target. The grounding function might
								// be able to infer if the target is needed depending on the operation?
								take({ block: b, target: blocks.target[b] }),
								put({ block: b, target: blocks.target[b] }),
							];
						}
					}

					// If we get here, no blocks can be moved to the final location so
					// we move it to the table
					for (const b of allClearBlocks(s.blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						return [
							take({ block: b, target: blocks.target[b] }),
							take({ block: b, target: 'table' }),
						];
					}

					// The method is not applicable here
					return [];
				},
				description: `find a block that can be moved to the final location or to the table`,
			});

			const planner = Planner.of<State>({
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

		it('accepts tasks defined with actions', () => {
			const inc = Task.of({
				condition: (state: number, { target }) => state < target,
				effect: (state: number) => state + 1,
				action: async (state: number) => state + 1,
				description: '+1',
			});

			const planner = Planner.of<number>({
				tasks: [inc],
				config: { trace: console.trace },
			});
			const result = planner.findPlan(0, 3);
			expect(stringify(result)).to.deep.equal(
				plan().action('+1').action('+1').action('+1').end(),
			);
		});

		it('accepts tasks defined with Effects', () => {
			const inc = Task.of({
				effect: (state: number, { target }) =>
					fromPipe(
						state,
						when(
							(s) => s < target,
							(s) => Effect.of(s + 1),
						),
					),
				description: '+1',
			});

			const planner = Planner.of({
				tasks: [inc],
				config: { trace: console.trace },
			});

			const result = planner.findPlan(0, 3);
			expect(stringify(result)).to.deep.equal(
				plan().action('+1').action('+1').action('+1').end(),
			);
		});

		it('solves parallel problems', () => {
			type Counters = { [k: string]: number };

			const byOne = Task.of({
				path: '/:counter',
				condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
				effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
				description: ({ counter }) => `${counter} + 1`,
			});

			const multiIncrement = Task.of({
				condition: (state: Counters, ctx) =>
					Object.keys(state).filter((k) => ctx.target[k] - state[k] > 0)
						.length > 1,
				method: (state: Counters, ctx) =>
					Object.keys(state)
						.filter((k) => ctx.target[k] - state[k] > 0)
						.map((k) => byOne({ counter: k, target: ctx.target[k] })),
				description: `increment counters`,
			});

			const planner = Planner.of({
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

			const byOne = Task.of({
				path: '/:counter',
				condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
				effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
				description: ({ counter }) => `${counter} + 1`,
			});

			const byTwo = Task.of({
				path: '/:counter',
				condition: (state: Counters, ctx) => ctx.target - ctx.get(state) > 1,
				method: (_: Counters, ctx) => [byOne({ ...ctx }), byOne({ ...ctx })],
				description: ({ counter }) => `increase '${counter}'`,
			});

			const multiIncrement = Task.of({
				condition: (state: Counters, ctx) =>
					Object.keys(state).some((k) => ctx.target[k] - state[k] > 1),
				method: (state: Counters, ctx) =>
					Object.keys(state)
						.filter((k) => ctx.target[k] - state[k] > 1)
						.map((k) => byTwo({ counter: k, target: ctx.target[k] })),
				description: `increment counters`,
			});

			const planner = Planner.of({
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

		it('Finds parallel plans with nested forks', () => {
			type Counters = { [k: string]: number };

			const byOne = Task.of({
				path: '/:counter',
				condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
				effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
				description: ({ counter }) => `${counter}++`,
			});

			const byTwo = Task.of({
				path: '/:counter',
				condition: (state: Counters, ctx) => ctx.target - ctx.get(state) > 1,
				method: (_: Counters, ctx) => [byOne({ ...ctx }), byOne({ ...ctx })],
				description: ({ counter }) => `${counter} + 2`,
			});

			const multiIncrement = Task.of({
				condition: (state: Counters, ctx) =>
					Object.keys(state).some((k) => ctx.target[k] - state[k] > 1),
				method: (state: Counters, ctx) =>
					Object.keys(state)
						.filter((k) => ctx.target[k] - state[k] > 1)
						.map((k) => byTwo({ counter: k, target: ctx.target[k] })),
				description: `increment multiple`,
			});

			const chunker = Task.of({
				condition: (state: Counters, ctx) =>
					Object.keys(state).some((k) => ctx.target[k] - state[k] > 1),
				method: (state: Counters, ctx) => {
					const toUpdate = Object.keys(state).filter(
						(k) => ctx.target[k] - state[k] > 1,
					);

					const chunkSize = 2;
					const tasks: Array<Instruction<Counters>> = [];
					for (let i = 0; i < toUpdate.length; i += chunkSize) {
						const chunk = toUpdate.slice(i, i + chunkSize);
						tasks.push(
							multiIncrement({
								target: {
									...state,
									...chunk.reduce(
										(acc, k) => ({ ...acc, [k]: ctx.target[k] }),
										{},
									),
								},
							}),
						);
					}

					return tasks;
				},
				description: 'chunk',
			});

			const planner = Planner.of({
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

			const byOne = Task.of({
				path: '/:counter',
				condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
				effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
				description: ({ counter }) => `${counter} + 1`,
			});

			const conflictingIncrement = Task.of({
				condition: (state: Counters, ctx) =>
					Object.keys(state).filter((k) => ctx.target[k] - state[k] > 1)
						.length > 1,
				method: (state: Counters, ctx) =>
					Object.keys(state)
						.filter((k) => ctx.target[k] - state[k] > 1)
						.flatMap((k) => [
							// We create parallel steps to increase the same element of the state
							// concurrently
							byOne({ counter: k, target: ctx.target[k] }),
							byOne({ counter: k, target: ctx.target[k] }),
						]),
				description: `increment counters`,
			});

			const planner = Planner.of({
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

		it.skip('simple travel problem', async () => {
			// Alice needs to go to the park and may walk or take a taxi. Depending on the distance to the park and
			// the available cash, some actions may be possible
			expect(false);
		});
	});
});
