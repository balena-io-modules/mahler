import { Diff } from '../diff';
import { Path } from '../path';
import { Operation } from '../operation';
import { Pointer } from '../pointer';
import { Context } from '../context';
import { Action, Method, Instruction, Task, Redirect } from '../task';
import { PlannerConfig, PlanningResult, PlanningStats } from './types';
import { isTaskApplicable } from './utils';

interface PlanningState<TState = any> {
	current: TState;
	diff: Diff<TState>;
	tasks: Array<Task<TState>>;
	depth?: number;
	operation?: Operation<TState, any>;
	trace?: PlannerConfig['trace'];
	initialPlan?: Array<Action<TState>>;
	stats?: PlanningStats;
	callStack?: Array<Method<TState> | Redirect<TState>>;
}

function tryAction<TState = any>(
	action: Action<TState>,
	{
		depth,
		operation,
		current,
		initialPlan = [],
		trace = () => {
			/* noop */
		},
		stats = { iterations: 0, maxDepth: 0, time: 0 },
	}: PlanningState<TState>,
): PlanningResult<TState> {
	// Detect loops in the plan
	if (initialPlan.find((a) => Action.equals(a, action))) {
		trace({
			depth,
			operation,
			action: action.description,
			error: 'loop detected, action already in plan',
		});
		return { success: false, stats };
	}
	const state = action.effect(current);

	return { success: true, state, plan: [action], stats };
}

function tryMethod<TState = any>(
	method: Method<TState>,
	{
		current: state,
		trace = () => {
			/* noop */
		},
		initialPlan = [],
		stats = { iterations: 0, maxDepth: 0, time: 0 },
		callStack = [],
		...pState
	}: PlanningState<TState>,
): PlanningResult<TState> {
	// look method in the call stack
	if (callStack.find((m) => Method.equals(m, method))) {
		trace({
			depth: pState.depth,
			method: method.description,
			operation: pState.operation,
			error:
				'recursion detected, method call already in stack for the same target',
		});
		return { success: false, stats };
	}

	const instructions = method(state);
	if (instructions.length === 0) {
		return { success: false, stats };
	}

	const plan: Array<Action<TState>> = [];
	for (const i of instructions) {
		const res = tryInstruction(i, {
			...pState,
			trace,
			current: state,
			initialPlan: [...initialPlan, ...plan],
			callStack: [...callStack, method],
			stats,
		});

		if (!res.success) {
			return res;
		}

		plan.push(...res.plan);
		state = res.state;
		stats = res.stats;
	}

	return { success: true, state, plan, stats };
}

function tryRedirect<TState = any>(
	redirect: Redirect<TState>,
	{
		current: state,
		trace = () => {
			/* noop */
		},
		depth = 0,
		stats = { iterations: 0, maxDepth: 0, time: 0 },
		callStack = [],
		initialPlan = [],
		...pState
	}: PlanningState<TState>,
): PlanningResult<TState> {
	if (callStack.find((r) => Redirect.equals(r, redirect))) {
		trace({
			depth,
			redirect: redirect.description,
			operation: pState.operation,
			error:
				'recursion detected, redirection already in stack for the same target',
		});
		// We do not trace an error here as this should be fairly common
		return { success: false, stats };
	}

	const output = redirect(state);
	const targets = Array.isArray(output) ? output : [output];

	const plan: Array<Action<TState>> = [];
	for (const target of targets) {
		const res = findPlan({
			...pState,
			current: state,
			depth: depth + 1,
			diff: Diff.of(state, target),
			initialPlan: [...initialPlan, ...plan],
			trace,
			stats,
			callStack: [...callStack, redirect],
		});

		if (!res.success) {
			return res;
		}

		plan.push(...res.plan);
		state = res.state;
		stats = res.stats;
	}

	return { success: true, state, plan, stats };
}

function tryInstruction<TState = any>(
	instruction: Instruction<TState>,
	{
		trace = () => {
			/* noop */
		},
		stats = { iterations: 0, maxDepth: 0, time: 0 },
		...state
	}: PlanningState<TState>,
): PlanningResult<TState> {
	trace({
		depth: state.depth,
		operation: state.operation,
		instruction: instruction.description,
		status: 'trying instruction',
	});

	// test condition
	if (!instruction.condition(state.current)) {
		trace({
			depth: state.depth,
			state: state.current,
			operation: state.operation,
			instruction: instruction.description,
			error: 'condition not met',
		});
		return { success: false, stats };
	}

	let res: PlanningResult<TState>;
	if (Method.is(instruction)) {
		res = tryMethod(instruction, { ...state, trace, stats });
	} else if (Redirect.is(instruction)) {
		res = tryRedirect(instruction, {
			...state,
			trace,
			stats,
		});
	} else {
		res = tryAction(instruction, { ...state, trace, stats });
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
	initialPlan = [],
	stats = { iterations: 0, maxDepth: 0, time: 0 },
	callStack = [],
}: PlanningState<TState>): PlanningResult<TState> {
	// Get the list of operations from the patch
	const ops = diff(current);

	// If there are no operations left, we have reached
	// the target
	if (ops.length === 0) {
		const maxDepth = stats.maxDepth < depth ? depth : stats.maxDepth;
		trace({
			depth,
			state: current,
			plan: initialPlan.map((a) => a.description),
			stats: { maxDepth, iterations: stats.iterations },
			status: 'plan found',
		});
		return {
			success: true,
			plan: [],
			state: current,
			stats: { ...stats, maxDepth },
		};
	}

	trace({
		depth,
		state: current,
		target: diff.target,
		pending: ops,
		plan: initialPlan.map((a) => a.description),
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

			const taskRes = tryInstruction(task(ctx as any), {
				depth,
				current,
				diff,
				tasks,
				trace,
				operation,
				initialPlan,
				stats,
				callStack,
			});

			if (taskRes.success && taskRes.plan.length > 0) {
				const res = findPlan({
					depth: depth + 1,
					current: taskRes.state,
					diff,
					tasks,
					trace,
					initialPlan: [...initialPlan, ...taskRes.plan],
					stats: taskRes.stats,
					callStack,
				});

				if (res.success) {
					return { ...res, plan: [...taskRes.plan, ...res.plan] };
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
