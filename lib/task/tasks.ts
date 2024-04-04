import { createHash } from 'crypto';

import assert from '../assert';
import { Lens } from '../lens';
import type { AnyOp, Update } from '../operation';
import type { PathType, Root } from '../path';
import { Path } from '../path';
import type { Ref } from '../ref';
import { View } from '../view';
import type { TaskArgs, TaskOp } from './context';
import { Context } from './context';
import type { Action, Instruction, Method } from './instructions';
import { MethodExpansion } from './instructions';
import type {
	ActionTaskProps,
	ContextWithSystem,
	MethodTaskProps,
} from './props';

interface TaskSpec<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> {
	/**
	 * A unique identifier for the task. This is automatically generated
	 * when constructing he task, and is not user configurable.
	 */
	readonly id: string;

	/**
	 * The path to the element that this task applies to
	 */
	readonly lens: Path<TPath>;

	/**
	 * The operation that this task applies to
	 */
	readonly op: TOp;

	/**
	 * A descriptor for this task. The descriptor can be either a string or a Context
	 * instance. The description does not receive the current state to allow actions to
	 * be compared by their description (useful for testing and debugging).
	 */
	readonly description: string | ((c: Context<TState, TPath, TOp>) => string);

	/**
	 * A condition that must be met for the task to be chosen by the planner or executed by
	 * an agent.
	 */
	readonly condition: (
		s: Lens<TState, TPath>,
		ctx: ContextWithSystem<TState, TPath, TOp>,
	) => boolean;
}

/**
 * An action task defines a primitive operation that can be chosen by a planner and
 * executed by an agent. Action tasks can be used to perform composite behaviors via
 * methods.
 *
 * Action tasks can be created via the Task constructor as follows
 *
 * ```typescript
 * const plusOne = Task.from({
 *   // A condition for chosing/executing the task
 *   condition: (state: number, { target }) => state < target,
 *   // The effect of the action is increasing the system
 *   // counter by 1. This will be used during planning
 *   effect: (state: View<number>) => ++state._,
 *   // The actual action that will be executed
 *   action: async (state: View<number>) => {
 *      ++state._;
 *   },
 *   // An optional description. Useful for testing
 *   description: '+1',
 * });
 * ```
 *
 * An ActionTask is also a function that binds the task to a specific context. This allows
 * the taks to be used in methods.
 *
 * ```ts
 * const plusTwo = Task.from<number>({
 *   // We want this method to be chosen only if the difference between the current
 *   // state and the target is bigger than one
 *   condition: (state, { target }) => target - state > 1,
 *   // The method returns two instances of the plusOne task bound to the given target
 *   method: (_, { target }) => [plusOne({ target }), plusOne({ target })],
 *   description: '+2',
 * });
 * ```
 */
export interface ActionTask<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> extends TaskSpec<TState, TPath, TOp> {
	/**
	 * The effect on the state that the task performs.
	 *
	 * The effect function will only be ran if the condition is met and developers
	 * can trust that the condition will be checked beforehand.
	 *
	 * The effect function receives a view to the state, which allows
	 * it to mutate the state. The effect function should not return
	 * anything.
	 *
	 * If the task operation is `create`, the task constructor will add as
	 * condition that the property pointed by the lens is undefined. The value will
	 * be created before calling the effect function provided by the user.
	 *
	 * If the task operation is `delete`, the task constructor will add as a condition
	 * that the property pointed by the lens is not undefined. The value will be deleted
	 * automatically after the effect function provided by the user.
	 *
	 * @param view - A view to the state pointed by the lens.
	 * @param ctx -	The calling context for the task. It includes any lens properties and the system object
	 */
	readonly effect: (
		view: View<TState, TPath, TOp>,
		ctx: ContextWithSystem<TState, TPath, TOp>,
	) => void;

	/**
	 * TThe actual action the task performs.
	 *
	 * The action function will only be ran if the condition is met and developers
	 * can trust that the condition will be checked beforehand.
	 *
	 * The action function receives a view to the state, which allows
	 * it to mutate the state. The action function should not return
	 * anything.
	 *
	 * If the task operation is `create`, the task constructor will add as
	 * condition that the property pointed by the lens is undefined. The value will
	 * be created before calling the action function provided by the user.
	 *
	 * If the task operation is `delete`, the task constructor will add as a condition
	 * that the property pointed by the lens is not undefined. The value will be deleted
	 * automatically after the action functions provided by the user.
	 *
	 * @param view - A view to the state pointed by the lens.
	 * @param ctx -	The calling context for the task. It includes any lens properties and the system object
	 */
	readonly action: (
		view: View<TState, TPath, TOp>,
		ctx: ContextWithSystem<TState, TPath, TOp>,
	) => Promise<void>;

	/**
	 * The task function binds the task to a context
	 *
	 * Grounding the task converts the specification into an instruction, that is,
	 * something that can be evaluated by the planner. It does this by
	 * contextualizing the task for a specific target.
	 *
	 * ActionTask --- ground --> Action
	 * MethodTask --- ground --> Method
	 */
	(ctx: TaskArgs<TState, TPath, TOp>): Action<TState, TPath, TOp>;
}

/**
 * A method task defines a composite operation that can be chosen by a planner.
 *
 * A method can guide the planner towards following a certain path by providing
 * a sequence of operations to be used if conditions are suitable.
 *
 * Method tasks can be created via the Task constructor as follows
 *
 * ```ts
 * const plusTwo = Task.from<number>({
 *   // We want this method to be chosen only if the difference between the current
 *   // state and the target is bigger than one
 *   condition: (state, { target }) => target - state > 1,
 *   // The method returns two instances of the plusOne task bound to the given target
 *   method: (_, { target }) => [plusOne({ target }), plusOne({ target })],
 *   description: '+2',
 * });
 * ```
 *
 * Methods can also reference methods for hierarchical task definition.
 */
export interface MethodTask<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> extends TaskSpec<TState, TPath, TOp> {
	/**
	 * The method expansion. The default is 'detect', meaning the planner will try to execute
	 * the instructions returned by the method in parallel and go back to sequential expansion
	 * if conflicts are detected. If sequential is chosen, the planner will jump straight to
	 * sequential expansion. This is a workaround to handle those cases where detection may fail
	 * due to instructios that read data handled by a parallel branch.
	 */
	readonly expansion: MethodExpansion;

	/**
	 * The method to be called when the task is executed.
	 *
	 * The method should return a list of instructions to be used by the planner.
	 * It should never modify the state object.
	 *
	 * if the method returns an empty list, this means there are no
	 * further instructions that can be applied
	 */
	readonly method: (
		s: Lens<TState, TPath>,
		c: ContextWithSystem<TState, TPath, TOp>,
	) => Instruction<TState> | Array<Instruction<TState>>;

	/**
	 * The task function grounds the task
	 *
	 * Grounding the task converts the specification into an instruction, that is,
	 * something that can be evaluated by the planner. It does this by
	 * contextualizing the task for a specific target.
	 *
	 * ActionTask --- ground --> Action
	 * MethodTask --- ground --> Method
	 */
	(ctx: TaskArgs<TState, TPath, TOp>): Method<TState, TPath, TOp>;
}

// Bind a task to a specific context
function ground<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends TaskOp = 'update',
>(
	task: Task<TState, TPath, TOp>,
	args: TaskArgs<TState, TPath, TOp>,
): Instruction<TState, TPath, TOp> {
	const templateParts = Path.split(task.lens);

	// Form the context path from the task lens and the
	// given task arguments
	const path = Path.from(
		templateParts.map((p) => {
			if (p.startsWith(':')) {
				const key = p.slice(1);
				assert(
					key in args,
					`Missing parameter '${key}' in context given to task '${task.id}', required by lens '${task.lens}'`,
				);
				return String(args[key as keyof typeof args]);
			}
			return p;
		}),
	) as Path<TPath>;

	// We clone the target before passing it to the task as an action
	// could assign it to the state and modify it and we don't want actions
	// from methods altering the target from the parent method
	const target = structuredClone((args as any).target);
	const lensCtx = Lens.context<TState, TPath>(task.lens, path, target);
	const context = Context.from<TState, TPath, TOp>(lensCtx);

	const { id, description: taskDescription } = task;
	const description: string =
		typeof taskDescription === 'function'
			? taskDescription(context)
			: taskDescription;

	const condition = (s: TState) => {
		const lens = Lens.from(s, path);
		return task.condition(lens as any, {
			...context,
			system: s,
		});
	};

	if (isActionTask(task)) {
		const { effect: taskEffect, action: taskAction } = task;
		const effect = (s: Ref<TState>) =>
			taskEffect(View.from(s, path), { ...context, system: s._ });
		const action = async (s: Ref<TState>) =>
			taskAction(View.from(s, path), { ...context, system: s._ });
		return Object.assign(action, {
			id,
			path: context.path as Path<TPath>,
			target,
			_tag: 'action' as const,
			description,
			condition,
			effect,
			toJSON() {
				return {
					id,
					path: context.path,
					description,
					target: (args as any).target,
				};
			},
		});
	}

	const { expansion } = task;
	const method = (s: TState) =>
		task.method(Lens.from(s, context.path as Path<TPath>), {
			...context,
			system: s,
		});

	return Object.assign(method, {
		id,
		path: context.path as any,
		target,
		_tag: 'method' as const,
		description,
		condition,
		expansion,
		toJSON() {
			return {
				id,
				path: context.path,
				description,
				target: (args as any).target,
			};
		},
	});
}

/**
 * Check if a task is a method
 */
function isMethodTask<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends TaskOp = 'update',
>(t: Task<TState, TPath, TOp>): t is MethodTask<TState, TPath, TOp> {
	return (t as any).method != null && typeof (t as any).method === 'function';
}

/**
 * Check if a task or an instruction is an action
 */
function isActionTask<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends TaskOp = 'update',
>(t: Task<TState, TPath, TOp>): t is ActionTask<TState, TPath, TOp> {
	return (
		(t as any).effect != null &&
		typeof (t as any).effect === 'function' &&
		(t as any).action != null &&
		typeof (t as any).action === 'function'
	);
}

// We put this here instead of props so we don't export it externally when doing
// export *	from props
function isActionProps<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
>(
	x: ActionTaskProps<TState, TPath, TOp> | MethodTaskProps<TState, TPath, TOp>,
): x is ActionTaskProps<TState, TPath, TOp> {
	return (
		typeof (x as any).effect === 'function' ||
		typeof (x as any).action === 'function'
	);
}

/**
 * A task is base unit of knowledge of an autonomous agent.
 */
export type Task<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends TaskOp = 'update',
> = ActionTask<TState, TPath, TOp> | MethodTask<TState, TPath, TOp>;

/**
 * Construct a new task (action or method) from a task specification
 */
function from<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
>(t: MethodTaskProps<TState, TPath, TOp>): MethodTask<TState, TPath, TOp>;
function from<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
>(t: ActionTaskProps<TState, TPath, TOp>): ActionTask<TState, TPath, TOp>;
function from<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
>(
	taskProps:
		| ActionTaskProps<TState, TPath, TOp>
		| MethodTaskProps<TState, TPath, TOp>,
) {
	const { op = 'update', condition: taskCondition = () => true } = taskProps;

	// Check that the path is valid
	const lens = Path.from(taskProps.lens || ('/' as TPath));

	const opLabel = op === '*' ? 'modify' : op;

	// The default description is
	// update /a/b/c or
	// [method] update /a/b/c
	const description = (ctx: Context<TState, TPath, TOp>) =>
		`${opLabel} ${ctx.path}`;

	// Create operations require that the sub-element pointed by the value
	// does not exist yet
	let condition = taskCondition;
	if (op === 'create') {
		condition = (v, c) => v === undefined && taskCondition(v, c);
	}

	// Delete and update operations require that the sub-element pointed by the value
	// exists
	if (['delete', 'update'].includes(op)) {
		condition = (v, c) => v !== undefined && taskCondition(v, c);
	}

	// The task properties
	const tProps = (() => {
		if (isActionProps(taskProps)) {
			const {
				effect: taskEffect = () => void 0,
				action: taskAction = async (v, c) => taskEffect(v, c),
			} = taskProps;

			let effect = taskEffect;
			let action = taskAction;
			if (op === 'delete') {
				// If the task defines a delete operation for the value pointed by
				// the lens, then we need to delete the property after the action succeeds
				effect = (v, c) => {
					const res = taskEffect(v, c);
					v.delete();
					return res;
				};

				action = async (v, c) => {
					const res = await taskAction(v, c);
					v.delete();
					return res;
				};
			}

			return {
				description,
				op: op as TOp,
				...taskProps,
				lens,
				condition,
				effect,
				action,
			};
		} else {
			return {
				description,
				op: op as TOp,
				expansion: MethodExpansion.DETECT,
				...taskProps,
				lens,
				condition,
			};
		}
	})();

	// Serialize the task specification converting all elements to strings
	// including the function bodys where it applies
	const serialized = (Object.keys(tProps) as Array<keyof typeof tProps>).reduce(
		(o, k) => ({ ...o, [k]: String(tProps[k]) }),
		{},
	);

	// Thid allows us to generate a deterministic id for
	// the task. This is useful for diagramming
	const id = createHash('sha256')
		.update(JSON.stringify(serialized))
		.digest('hex');

	// The final task spec. Typescript doesn't seem to
	// correctly infer the type here unfortunately
	const tSpec = { id, ...tProps };

	const t = Object.assign((ctx: TaskArgs<TState, TPath, TOp>) => {
		return ground(tSpec as Task<TState, TPath, TOp>, ctx);
	}, tSpec);

	return t;
}

interface TaskBuilder<TState> {
	from<TPath extends PathType = Root, TOp extends TaskOp = 'update'>(
		t: ActionTaskProps<TState, TPath, TOp>,
	): ActionTask<TState, TPath, TOp>;
	from<TPath extends PathType = Root, TOp extends TaskOp = 'update'>(
		t: MethodTaskProps<TState, TPath, TOp>,
	): MethodTask<TState, TPath, TOp>;
}

function of<TState>(): TaskBuilder<TState> {
	return {
		from,
	};
}

export const Task = {
	of,
	from,
	isMethod: isMethodTask,
	isAction: isActionTask,
};
