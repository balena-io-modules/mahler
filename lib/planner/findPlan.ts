import { Context } from '../context';
import { Diff } from '../diff';
import { Operation } from '../operation';
import { Path } from '../path';
import { Pointer } from '../pointer';
import { Action, Instruction, Method, Task } from '../task';
import { PlannerConfig } from './types';
import { Plan, Node } from './plan';
import { isTaskApplicable } from './utils';
import assert from '../assert';

interface PlanningState<TState = any> {
	current: TState;
	diff: Diff<TState>;
	tasks: Array<Task<TState>>;
	depth?: number;
	operation?: Operation<TState, any>;
	trace?: PlannerConfig['trace'];
	initialPlan?: Plan<TState>;
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
	{
		depth,
		operation,
		current,
		initialPlan = {
			success: true,
			start: null,
			state: current,
			stats: { iterations: 0, maxDepth: 0, time: 0 },
		},
		trace = () => {
			/* noop */
		},
	}: PlanningState<TState>,
): Plan<TState> {
	// Something went wrong if the initial plan
	// given to this function is a failure
	assert(initialPlan.success);

	// Generate an id for the potential node
	const node = Node.of(initialPlan.state, action);
	const id = node.id;

	// Detect loops in the plan
	if (planHasId(id, initialPlan.start)) {
		trace({
			depth,
			operation,
			action: action.description,
			error: 'loop detected, action already in plan',
		});
		return { success: false, stats: initialPlan.stats };
	}
	const state = action.effect(current);

	// We create the plan reversed so we can backtrack easily
	const start = { id, action, next: initialPlan.start };

	return { success: true, state, start, stats: initialPlan.stats };
}

function tryMethod<TState = any>(
	method: Method<TState>,
	{
		current: state,
		trace = () => {
			/* noop */
		},
		initialPlan = {
			success: true,
			start: null,
			state,
			stats: { iterations: 0, maxDepth: 0, time: 0 },
		},
		callStack = [],
		...pState
	}: PlanningState<TState>,
): Plan<TState> {
	// Something went wrong if the initial plan
	// given to this function is a failure
	assert(initialPlan.success);

	// look method in the call stack
	if (callStack.find((m) => Method.equals(m, method))) {
		trace({
			depth: pState.depth,
			method: method.description,
			operation: pState.operation,
			error:
				'recursion detected, method call already in stack for the same target',
		});
		return { success: false, stats: initialPlan.stats };
	}

	const output = method(state);
	const instructions = Array.isArray(output) ? output : [output];
	if (instructions.length === 0) {
		return { success: false, stats: initialPlan.stats };
	}

	const plan: Plan<TState> = {
		success: true,
		start: initialPlan.start,
		stats: initialPlan.stats,
		state,
	};
	for (const i of instructions) {
		const res = tryInstruction(i, {
			...pState,
			trace,
			current: state,
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

function tryInstruction<TState = any>(
	instruction: Instruction<TState, any, any>,
	{
		current,
		trace = () => {
			/* noop */
		},
		initialPlan = {
			success: true,
			start: null,
			state: current,
			stats: { iterations: 0, maxDepth: 0, time: 0 },
		},
		...state
	}: PlanningState<TState>,
): Plan<TState> {
	trace({
		depth: state.depth,
		operation: state.operation,
		instruction: instruction.description,
		status: 'trying instruction',
	});

	// test condition
	if (!instruction.condition(current)) {
		trace({
			depth: state.depth,
			state: current,
			operation: state.operation,
			instruction: instruction.description,
			error: 'condition not met',
		});
		return { success: false, stats: initialPlan.stats };
	}

	let res: Plan<TState>;
	if (Method.is(instruction)) {
		res = tryMethod(instruction, { ...state, trace, current, initialPlan });
	} else {
		res = tryAction(instruction, { ...state, trace, current, initialPlan });
	}

	if (res.success) {
		trace({
			depth: state.depth,
			operation: state.operation,
			instruction: instruction.description,
			status: 'instruction selected',
		});
	}
	return res;
}

export function findPlan<TState = any>({
	current,
	diff,
	tasks,
	trace = () => {
		/* noop */
	},
	depth = 0,
	initialPlan = {
		success: true,
		start: null,
		state: current,
		stats: { iterations: 0, maxDepth: 0, time: 0 },
	},
	callStack = [],
}: PlanningState<TState>): Plan<TState> {
	// Something went wrong if the initial plan
	// given to this function is a failure
	assert(initialPlan.success);

	// Get the list of operations from the patch
	const ops = diff(current);

	const { stats } = initialPlan;

	// If there are no operations left, we have reached
	// the target
	if (ops.length === 0) {
		const maxDepth = stats.maxDepth < depth ? depth : stats.maxDepth;
		trace({
			depth,
			state: current,
			stats: { maxDepth, iterations: stats.iterations },
			status: 'plan found',
		});
		return {
			success: true,
			start: initialPlan.start,
			state: current,
			stats: { ...stats, maxDepth },
		};
	}

	trace({
		depth,
		state: current,
		target: diff.target,
		pending: ops,
		status: 'finding plan',
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
				current,
				diff,
				tasks,
				trace,
				operation,
				initialPlan,
				callStack,
			});

			if (taskPlan.success && taskPlan.start != null) {
				const res = findPlan({
					depth: depth + 1,
					current: taskPlan.state,
					diff,
					tasks,
					trace,
					initialPlan: taskPlan,
					callStack,
				});

				if (res.success) {
					return res;
				}
			}
		}
	}

	return {
		success: false,
		stats: {
			...stats,
			maxDepth: stats.maxDepth < depth ? depth : stats.maxDepth,
		},
	};
}
