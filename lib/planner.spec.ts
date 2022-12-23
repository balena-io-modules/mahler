import { expect } from '~/tests';
import { Planner } from './planner';
import { Task } from './task';
import { none, some, map } from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/function';

describe('Planner', () => {
	describe('plan', () => {
		it('block stacking problem: simple', () => {
			type Table = 'table';
			type Hand = 'hand';
			type Block = 'a' | 'b' | 'c';
			type Location = Block | Table | Hand;
			type State = {
				blocks: { [block in Block]: Location };
				hand: Block | null;
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
				id: 'take',
				path: '/blocks/:block',
				effect: (s: State, location) => {
					if (isClear(s.blocks, location.params.block) && s.hand === null) {
						// Update the block
						s = location.set(s, 'hand');
						s.hand = location.params.block;
						return some(s);
					}
					return none;
				},
			});

			const put = Task.of({
				id: 'put',
				path: '/blocks/:block',
				effect: (s: State, location) => {
					if (location.get(s) === 'hand') {
						// Update the block
						s = location.set(s, location.target);
						s.hand = null;
						return some(s);
					}
					return none;
				},
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
				id: 'move',
				path: '/blocks',
				method: (s: State, blocks) => {
					for (const b of allClearBlocks(s.blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						if (isClear(s.blocks, blocks.target[b])) {
							return [
								// TODO: take doesn't really need a target. The grounding function might
								// be able to infer if the target is needed depending on the operation?
								take(`/blocks/${b}`, blocks.op, blocks.target[b]),
								put(`/blocks/${b}`, blocks.op, blocks.target[b]),
							];
						}
					}

					// If we get here, no blocks can be moved to the final location so
					// we move it to the table
					for (const b of allClearBlocks(s.blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						return [
							take(`/blocks/${b}`, blocks.op, blocks.target[b]),
							put(`/blocks/${b}`, blocks.op, 'table'),
						];
					}

					// The method is not applicable here
					return [];
				},
			});

			const planner = Planner.of<State>(
				{
					blocks: { a: 'table', b: 'a', c: 'b' },
					hand: null,
				},
				[take, put, move],
			);

			expect(
				pipe(
					planner.plan({ blocks: { a: 'b', b: 'c', c: 'table' } }),
					map((actions) => actions.map((s) => s.id)),
				),
			).to.deep.equal(
				some([
					/* TODO */
				]),
			);
		});

		it('block stacking problem: fancy version', () => {
			type Table = 'table';
			type Hand = 'hand';
			type Block = 'a' | 'b' | 'c';
			type Location = Block | Table | Hand;
			type State = {
				blocks: { [block in Block]: Location };
				hand: Block | null;
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
				id: 'pickup',
				path: '/blocks/:block',
				effect: (s: State, location) => {
					if (
						isClear(s.blocks, location.params.block) &&
						location.get(s) === 'table' &&
						s.hand === null
					) {
						// Update the block
						s = location.set(s, 'hand');
						s.hand = location.params.block;
						return some(s);
					}
					return none;
				},
			});

			const unstack = Task.of({
				id: 'unstack',
				path: '/blocks/:block',
				effect: (s: State, location) => {
					if (
						// The block has no other blocks on top
						isClear(s.blocks, location.params.block) &&
						// The block is on top of other block (not in the hand or the table)
						location.get(s) !== 'table' &&
						location.get(s) !== 'hand' &&
						s.hand === null
					) {
						// Update the block
						s = location.set(s, 'hand');
						s.hand = location.params.block;
						return some(s);
					}
					return none;
				},
			});

			const putdown = Task.of({
				id: 'putdown',
				path: '/blocks/:block',
				effect: (s: State, location) => {
					if (location.get(s) === 'hand') {
						// Update the block
						s = location.set(s, 'table');
						s.hand = null;
						return some(s);
					}
					return none;
				},
			});

			const stack = Task.of({
				id: 'stack',
				path: '/blocks/:block',
				effect: (s: State, location) => {
					if (
						// The target has no other blocks on top
						isClear(s.blocks, location.target) &&
						// The hand is holding the block
						location.get(s) === 'hand'
					) {
						// Update the block
						s = location.set(s, location.target);
						s.hand = null;
						return some(s);
					}
					return none;
				},
			});

			const take = Task.of({
				id: 'take',
				path: '/blocks/:block',
				method: (s: State, location) => {
					if (isClear(s.blocks, location.get(s))) {
						const { path, op, target } = location;
						if (location.get(s) === 'table') {
							return [pickup(path, op, target)];
						} else {
							return [unstack(path, op, target)];
						}
					}
					return [];
				},
			});

			// There is really not that much of a difference between putdown and stack
			// this is just to test that the planner can work with nested methods
			const put = Task.of({
				id: 'put',
				path: '/blocks/:block',
				method: (s: State, location) => {
					const { path, op, target } = location;
					if (location.get(s) === 'hand') {
						if (location.target === 'table') {
							return [putdown(path, op, target)];
						} else {
							return [stack(path, op, target)];
						}
					}
					return [];
				},
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
				id: 'move',
				path: '/blocks',
				method: (s: State, blocks) => {
					for (const b of allClearBlocks(s.blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						if (isClear(s.blocks, blocks.target[b])) {
							return [
								// TODO: take doesn't really need a target. The grounding function might
								// be able to infer if the target is needed depending on the operation?
								take(`/blocks/${b}`, blocks.op, blocks.target[b]),
								put(`/blocks/${b}`, blocks.op, blocks.target[b]),
							];
						}
					}

					// If we get here, no blocks can be moved to the final location so
					// we move it to the table
					for (const b of allClearBlocks(s.blocks)) {
						// The block is free and it can be moved to the final target (another block or the table)
						return [
							take(`/blocks/${b}`, blocks.op, blocks.target[b]),
							put(`/blocks/${b}`, blocks.op, 'table'),
						];
					}

					// The method is not applicable here
					return [];
				},
			});

			const planner = Planner.of<State>(
				{
					blocks: { a: 'table', b: 'a', c: 'b' },
					hand: null,
				},
				[pickup, unstack, putdown, stack, take, put, move],
			);

			expect(
				pipe(
					planner.plan({ blocks: { a: 'b', b: 'c', c: 'table' } }),
					map((actions) => actions.map((s) => s.id)),
				),
			).to.deep.equal(
				some([
					/* TODO */
				]),
			);
		});
		it('simple travel problem', async () => {
			// Alice needs to go to the park and may walk or take a taxi. Depending on the distance to the park and
			// the available cash, some actions may be possible
			expect(false);
		});
	});
});
