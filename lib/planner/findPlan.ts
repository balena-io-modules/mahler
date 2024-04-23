import type { Operation as PatchOperation } from 'mahler-wasm';
import { patch as applyPatch, diff as createPatch } from 'mahler-wasm';

import assert from '../assert';
import type { Distance } from '../distance';
import { Lens } from '../lens';
import type { Operation } from '../operation';
import { Pointer } from '../pointer';
import { Ref } from '../ref';
import type { Action, Instruction, Task } from '../task';
import { Method, MethodExpansion } from '../task';
import type { ActionNode } from './node';
import { Node } from './node';
import type { Plan } from './plan';
import type { PlannerConfig } from './types';
import {
	Aborted,
	ConditionNotMet,
	LoopDetected,
	MethodExpansionEmpty,
	SearchFailed,
} from './types';
import { isTaskApplicable } from './utils';
import * as DAG from '../dag';

interface PlanningState<TState = any> {
	distance: Distance<TState>;
	tasks: Array<Task<TState, string, any>>;
	depth?: number;
	operation?: Operation<TState, any>;
	trace: PlannerConfig<TState>['trace'];
	initialPlan: Plan<TState>;
	callStack?: Array<Method<TState>>;
	maxSearchDepth: number;
}

function tryAction<TState = any>(
	action: Action<TState>,
	{ initialPlan, callStack = [] }: PlanningState<TState>,
): Plan<TState> {
	// Something went wrong if the initial plan
	// given to this function is a failure
	assert(initialPlan.success);

	// Generate an id for the potential node
	const node = Node.of(initialPlan.state, action);
	const id = node.id;

	// Detect loops in the plan
	if (
		DAG.find(initialPlan.start, (a: ActionNode<TState>) => a.id === id) != null
	) {
		return { success: false, stats: initialPlan.stats, error: LoopDetected };
	}

	// Because the effect mutates the state, we need to create a copy here
	const ref = Ref.of(structuredClone(initialPlan.state));
	action.effect(ref);
	const state = ref._;

	// We calculate the changes only at the action level
	const changes = createPatch(initialPlan.state, state);

	// If the action is not part of a method and it
	// performs no changes then we just return the initial plan
	// as we don't know how the action contributes to the overall goal
	if (changes.length === 0 && callStack.length === 0) {
		return initialPlan;
	}

	// We create the plan reversed so we can backtrack easily
	const start = DAG.Node.value({ id, action, next: initialPlan.start });

	return {
		success: true,
		start,
		stats: initialPlan.stats,
		state,
		pendingChanges: initialPlan.pendingChanges.concat(changes),
	};
}

// Expand the method in a sequential way
function trySequential<TState = any>(
	method: Method<TState>,
	{
		initialPlan,
		callStack = [],
		maxSearchDepth,
		...pState
	}: PlanningState<TState>,
): Plan<TState> {
	// Something went wrong if the initial plan
	// given to this function is a failure
	assert(initialPlan.success);

	// Protect against infinite recursion
	if (callStack.length > maxSearchDepth) {
		throw new Aborted(
			`Maximum search depth ${maxSearchDepth}	reached on recursion`,
			initialPlan.stats,
		);
	}

	const output = method(initialPlan.state);
	const instructions = Array.isArray(output) ? output : [output];

	// We use spread here to avoid modifying the source object
	const plan: Plan<TState> = { ...initialPlan };
	const cStack = [...callStack, method];
	for (const i of instructions) {
		const res = tryInstruction(i, {
			...pState,
			initialPlan: plan,
			callStack: cStack,
			maxSearchDepth,
		});

		if (!res.success) {
			return res;
		}

		// Update the plan
		plan.start = res.start;
		plan.state = res.state;
		plan.pendingChanges = res.pendingChanges;
	}

	return plan;
}

function findConflict(
	ops: PatchOperation[][],
): [PatchOperation, PatchOperation] | undefined {
	const unique = new Map<string, [number, PatchOperation]>();

	for (let i = 0; i < ops.length; i++) {
		const patches = ops[i];

		for (const o of patches) {
			for (const [path, [index, op]] of unique.entries()) {
				if (
					i !== index &&
					(o.path.startsWith(path) || path.startsWith(o.path))
				) {
					// We found a conflicting operation on a different
					// branch than the current one
					return [o, op];
				}
			}
			unique.set(o.path, [i, o]);
		}
	}
}

function tryParallel<TState = any>(
	parallel: Method<TState>,
	{
		trace,
		initialPlan,
		callStack = [],
		maxSearchDepth,
		...pState
	}: PlanningState<TState>,
): Plan<TState> {
	assert(initialPlan.success);

	// Protect against infinite recursion
	if (callStack.length > maxSearchDepth) {
		throw new Aborted(
			`Maximum search depth ${maxSearchDepth}	reached on recursion`,
			initialPlan.stats,
		);
	}
	const output = parallel(initialPlan.state);
	const instructions = Array.isArray(output) ? output : [output];

	// Nothing to do here as other branches may still
	// result in actions
	if (instructions.length === 0) {
		return initialPlan;
	}

	const empty = Node.empty(initialPlan.start);

	const plan: Plan<TState> = {
		...initialPlan,
		start: empty,
	};

	let results: Array<Plan<TState> & { success: true }> = [];
	const cStack = [...callStack, parallel];
	for (const i of instructions) {
		const res = tryInstruction(i, {
			...pState,
			trace,
			initialPlan: plan,
			callStack: cStack,
			maxSearchDepth,
		});

		if (!res.success) {
			return res;
		}

		results.push(res);
	}

	// If all branches are empty (they still point to the start node we provided)
	// we just return the initialPlan
	results = results.filter((r) => r.start !== empty);
	if (results.length === 0) {
		return initialPlan;
	}

	// if the method has just a single branch there is no point in
	// having the fork and empty node, so we need to remove the empty node
	// and connect the last action in the branch directly to the existing plan
	if (results.length === 1) {
		const branch = results[0];
		// Find the first node for which the next element is the
		// empty node created earlier
		const last = DAG.find(
			branch.start,
			(a: ActionNode<TState>) => a.next === empty,
		);

		assert(last != null);

		// We remove the empty node from the plan
		last.next = initialPlan.start;

		return {
			success: true,
			state: branch.state,
			pendingChanges: branch.pendingChanges,
			start: branch.start,
			stats: initialPlan.stats,
		};
	}

	// Here is where we check for conflicts created by the parallel plan.
	// If two branches change the same part of the state, that means that there is
	// a conflict and the branches need to be executed in sequence instead.
	// NOTE: This is currently implemented in a pretty brute way. A better algorithm
	// would be to find which branches are in conflict, keep one of them in the parallel
	// part of the execution and move the other ones to the sequential part.
	const conflict = findConflict(results.map((r) => r.pendingChanges));
	if (conflict) {
		// TODO we need a trace event here so the diagram can be updated
		trace({
			event: 'backtrack-method',
			method: parallel,
			state: initialPlan.state,
		});
		return trySequential(parallel, {
			trace,
			initialPlan,
			callStack,
			maxSearchDepth,
			...pState,
		});
	}

	// We add the fork node
	const start = Node.fork(results.map((r) => r.start!));

	// Since we already checked conflicts, we can just concat the changes
	const pendingChanges = results.reduce(
		(acc, r) => acc.concat(r.pendingChanges),
		initialPlan.pendingChanges,
	);

	// Now we can apply changes from parallel branches
	const state = applyPatch(initialPlan.state, pendingChanges);

	return {
		success: true,
		// We need to return the accumulated state here so a calling
		// method can use the state
		state,
		pendingChanges,
		start,
		stats: initialPlan.stats,
	};
}

function tryInstruction<TState = any>(
	instruction: Instruction<TState, any, any>,
	{ trace, initialPlan, callStack = [], ...state }: PlanningState<TState>,
): Plan<TState> {
	assert(initialPlan.success);
	trace({
		event: 'try-instruction',
		operation: state.operation!,
		parent: callStack[callStack.length - 1],
		instruction,
		state: initialPlan.state,
		prev: initialPlan.start,
	});

	// test condition
	if (!instruction.condition(initialPlan.state)) {
		return { success: false, stats: initialPlan.stats, error: ConditionNotMet };
	}

	let res: Plan<TState>;
	if (Method.is(instruction)) {
		// If sequential expansion was chosen, then we go straight to
		// evaluating the method in a sequential manner
		if (instruction.expansion === MethodExpansion.SEQUENTIAL) {
			res = trySequential(instruction, {
				...state,
				trace,
				initialPlan,
				callStack,
			});
		} else {
			// Otherwise. We try methods in parallel first. If conflicts are found then we'll try
			// running them in sequence
			res = tryParallel(instruction, {
				...state,
				trace,
				initialPlan,
				callStack,
			});
		}
	} else {
		res = tryAction(instruction, { ...state, trace, initialPlan, callStack });
	}

	return res;
}

export function findPlan<TState = any>({
	distance,
	tasks,
	trace,
	depth = 0,
	initialPlan,
	callStack = [],
	maxSearchDepth,
}: PlanningState<TState>): Plan<TState> {
	// Something went wrong if the initial plan
	// given to this function is a failure
	assert(initialPlan.success);

	const { stats } = initialPlan;
	stats.maxDepth = depth > stats.maxDepth ? depth : stats.maxDepth;

	// Get the list of operations from the patch
	const ops = distance(initialPlan.state);

	// If there are no operations left, we have reached
	// the target
	if (ops.length === 0) {
		trace({
			event: 'found',
			prev: initialPlan.start,
		});
		return {
			success: true,
			start: initialPlan.start,
			state: initialPlan.state,
			stats,
			pendingChanges: [],
		};
	}

	trace({
		event: 'find-next',
		depth,
		state: initialPlan.state,
		prev: initialPlan.start,
		operations: ops,
	});

	if (depth >= maxSearchDepth) {
		throw new Aborted(
			`Maximum search depth reached (${maxSearchDepth})`,
			stats,
		);
	}

	for (const operation of ops) {
		// Find the tasks that are applicable to the operations
		const applicable = tasks.filter((t) => isTaskApplicable(t, operation));
		for (const task of applicable) {
			stats.iterations++;

			// Extract the path from the task template and the
			// operation
			const path = operation.path;

			// Get the context expected by the task
			// we get the target value for the context from the pointer
			// if the operation is delete, the pointer will be undefined
			// which is the right value for that operation
			const ctx = Lens.context<TState, string>(
				task.lens,
				path,
				Pointer.from<TState, string>(distance.target, path),
			);

			const taskPlan = tryInstruction(task(ctx), {
				depth,
				distance,
				tasks,
				trace,
				operation,
				initialPlan,
				callStack,
				maxSearchDepth,
			});

			if (!taskPlan.success) {
				trace(taskPlan.error);
				continue;
			}

			// If the start node for the plan didn't change, then the method
			// expansion didn't add any tasks so it makes no sense to go to a
			// deeper level
			if (taskPlan.start !== initialPlan.start) {
				// applyPatch makes a copy of the source object so we only want to
				// perform this operation if the instruction suceeded
				const state = applyPatch(initialPlan.state, taskPlan.pendingChanges);

				const res = findPlan({
					depth: depth + 1,
					distance,
					tasks,
					trace,
					initialPlan: {
						...taskPlan,
						state,
						pendingChanges: [],
					},
					callStack,
					maxSearchDepth,
				});

				if (res.success) {
					return res;
				} else {
					trace(res.error);
				}
			} else {
				trace(MethodExpansionEmpty);
			}
		}
	}

	return {
		success: false,
		stats,
		error: SearchFailed,
	};
}
