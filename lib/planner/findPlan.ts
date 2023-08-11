import {
	diff as createPatch,
	patch as applyPatch,
	Operation as PatchOperation,
} from 'mahler-wasm';

import { Context } from '../context';
import { Diff } from '../diff';
import { Operation } from '../operation';
import { Path } from '../path';
import { Pointer } from '../pointer';
import { Action, Instruction, Method, Task, Parallel } from '../task';
import { Plan } from './plan';
import { Node } from './node';
import {
	PlannerConfig,
	LoopDetected,
	RecursionDetected,
	MethodExpansionEmpty,
	ConditionNotMet,
	SearchFailed,
	MergeFailed,
	ConflictDetected,
} from './types';
import { isTaskApplicable } from './utils';
import assert from '../assert';

interface PlanningState<TState = any> {
	diff: Diff<TState>;
	tasks: Array<Task<TState>>;
	depth?: number;
	operation?: Operation<TState, any>;
	trace: PlannerConfig<TState>['trace'];
	initialPlan: Plan<TState>;
	callStack?: Array<Method<TState> | Parallel<TState>>;
}

function findLoop<T>(id: string, node: Node<T> | null): boolean {
	if (node == null) {
		return false;
	}

	if (Node.isAction(node)) {
		return node.id === id;
	}

	if (Node.isFork(node)) {
		return node.next.some((n) => findLoop(id, n));
	}

	// If the node is empty, ignore it
	return false;
}

function tryAction<TState = any>(
	action: Action<TState>,
	{ initialPlan }: PlanningState<TState>,
): Plan<TState> {
	// Something went wrong if the initial plan
	// given to this function is a failure
	assert(initialPlan.success);

	// Generate an id for the potential node
	const node = Node.of(initialPlan.state, action);
	const id = node.id;

	// Detect loops in the plan
	if (findLoop(id, initialPlan.start)) {
		return { success: false, stats: initialPlan.stats, error: LoopDetected };
	}
	const state = action.effect(initialPlan.state);

	// We calculate the changes only at the action level
	const changes = createPatch(initialPlan.state, state);

	// We create the plan reversed so we can backtrack easily
	const start = { id, action, next: initialPlan.start };

	return {
		success: true,
		start,
		stats: initialPlan.stats,
		state,
		pendingChanges: initialPlan.pendingChanges.concat(changes),
	};
}

function tryMethod<TState = any>(
	method: Method<TState>,
	{ initialPlan, callStack = [], ...pState }: PlanningState<TState>,
): Plan<TState> {
	// Something went wrong if the initial plan
	// given to this function is a failure
	assert(initialPlan.success);

	// look method in the call stack
	if (callStack.find((m) => Method.equals(m, method))) {
		return {
			success: false,
			stats: initialPlan.stats,
			error: RecursionDetected,
		};
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
	parallel: Parallel<TState>,
	{ initialPlan, callStack = [], ...pState }: PlanningState<TState>,
): Plan<TState> {
	assert(initialPlan.success);

	// look task in the call stack
	if (callStack.find((p) => Parallel.equals(p, parallel))) {
		return {
			success: false,
			stats: initialPlan.stats,
			error: RecursionDetected,
		};
	}

	const instructions = parallel(initialPlan.state);

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
			initialPlan: plan,
			callStack: cStack,
		});

		if (!res.success) {
			return res;
		}

		results.push(res);
	}

	// There should not be any results pointing to null as we passed
	// an empty node as the start node to each one
	assert(results.every((r) => r.start != null));

	// If all branches are empty (they still point to the start node we provided)
	// we just return the initialPlan
	results = results.filter((r) => r.start !== empty);
	if (results.length === 0) {
		return initialPlan;
	}

	// Here is where we check for conflicts created by the parallel plan.
	// If two branches change the same part of the state, that means that there is
	// a conflict and the planning should fail.
	// QUESTION: Intersection is an expensive operation, should we just do it during
	// testing?
	const conflict = findConflict(results.map((r) => r.pendingChanges));
	if (conflict) {
		return {
			success: false,
			stats: initialPlan.stats,
			error: ConflictDetected(conflict),
		};
	}

	// We add the fork node
	const start = Node.fork(results.map((r) => r.start!));

	// We don't update the state here as
	// applyPatch performs changes in place, which means
	// we need to make a structured copy of the state
	const state = initialPlan.state;

	// Since we already checked conflicts, we can just concat the changes
	const pendingChanges = results.reduce(
		(acc, r) => acc.concat(r.pendingChanges),
		initialPlan.pendingChanges,
	);

	return {
		success: true,
		state,
		pendingChanges,
		start,
		stats: initialPlan.stats,
	};
}

function tryInstruction<TState = any>(
	instruction: Instruction<TState, any, any>,
	{ trace, initialPlan, ...state }: PlanningState<TState>,
): Plan<TState> {
	assert(initialPlan.success);
	trace({
		event: 'try-instruction',
		operation: state.operation!,
		instruction,
		state: initialPlan.state,
	});

	// test condition
	if (!instruction.condition(initialPlan.state)) {
		return { success: false, stats: initialPlan.stats, error: ConditionNotMet };
	}

	let res: Plan<TState>;
	if (Method.is(instruction)) {
		res = tryMethod(instruction, { ...state, trace, initialPlan });
	} else if (Parallel.is(instruction)) {
		res = tryParallel(instruction, { ...state, trace, initialPlan });
	} else {
		res = tryAction(instruction, { ...state, trace, initialPlan });
	}

	return res;
}

export function findPlan<TState = any>({
	diff,
	tasks,
	trace,
	depth = 0,
	initialPlan,
	callStack = [],
}: PlanningState<TState>): Plan<TState> {
	// Something went wrong if the initial plan
	// given to this function is a failure
	assert(initialPlan.success);

	// Get the list of operations from the patch
	const ops = diff(initialPlan.state);

	const { stats } = initialPlan;

	// If there are no operations left, we have reached
	// the target
	if (ops.length === 0) {
		const maxDepth = stats.maxDepth < depth ? depth : stats.maxDepth;
		return {
			success: true,
			start: initialPlan.start,
			state: initialPlan.state,
			stats: { ...stats, maxDepth },
			pendingChanges: [],
		};
	}

	trace({
		event: 'find-next',
		depth,
		state: initialPlan.state,
		operations: ops,
	});

	for (const operation of ops) {
		// Find the tasks that are applicable to the operations
		const applicable = tasks.filter((t) => isTaskApplicable(t, operation));
		for (const task of applicable) {
			stats.iterations++;

			// Extract the path from the task template and the
			// operation
			const path: Path = operation.path;

			// Get the context expected by the task
			// we get the target value for the context from the pointer
			// if the operation is delete, the pointer will be undefined
			// which is the right value for that operation
			const ctx = Context.of<TState, any, any>(
				task.path,
				path,
				Pointer.of(diff.target, path)!,
			);

			const taskPlan = tryInstruction(task(ctx as any), {
				depth,
				diff,
				tasks,
				trace,
				operation,
				initialPlan,
				callStack,
			});

			if (!taskPlan.success) {
				trace(taskPlan.error);
				continue;
			}

			// If the start node for the plan didn't change, then the method
			// expansion didn't add any tasks so it makes no sense to go to a
			// deeper level
			if (taskPlan.start !== initialPlan.start) {
				let state: TState;
				try {
					// applyPatch makes a copy of the source object so we only want to
					// perform this operation if the instruction suceeded
					state = applyPatch(initialPlan.state, taskPlan.pendingChanges);
				} catch (e: any) {
					trace(MergeFailed(e));
					continue;
				}

				const res = findPlan({
					depth: depth + 1,
					diff,
					tasks,
					trace,
					initialPlan: { ...taskPlan, state, pendingChanges: [] },
					callStack,
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
		stats: {
			...stats,
			maxDepth: stats.maxDepth < depth ? depth : stats.maxDepth,
		},
		error: SearchFailed(depth),
	};
}
