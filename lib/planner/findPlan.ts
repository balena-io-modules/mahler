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
	NotImplemented,
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
	callStack?: Array<Method<TState>>;
}

function planHasId<T>(id: string, node: Node<T> | null): boolean {
	while (node != null) {
		if (node.id === id) {
			return true;
		}
		node = node.next;
	}
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
	if (planHasId(id, initialPlan.start)) {
		return { success: false, stats: initialPlan.stats, error: LoopDetected };
	}
	const state = action.effect(initialPlan.state);

	// We create the plan reversed so we can backtrack easily
	const start = { id, action, next: initialPlan.start };

	return { success: true, state, start, stats: initialPlan.stats };
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
	for (const i of instructions) {
		const res = tryInstruction(i, {
			...pState,
			initialPlan: plan,
			callStack: [...callStack, method],
		});

		if (!res.success) {
			return res;
		}

		// Update the plan
		plan.start = res.start;
		plan.stats = res.stats;
		plan.state = res.state;
	}

	return plan;
}

function tryParallel<TState = any>(
	_parallel: Parallel<TState>,
	{ initialPlan }: PlanningState<TState>,
): Plan<TState> {
	return { success: false, stats: initialPlan.stats, error: NotImplemented };
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
				const res = findPlan({
					depth: depth + 1,
					diff,
					tasks,
					trace,
					initialPlan: taskPlan,
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
