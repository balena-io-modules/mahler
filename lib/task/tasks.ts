import { createHash } from 'crypto';

import assert from '../assert';
import { Context, TaskArgs, TaskOp } from './context';
import { Lens } from '../lens';
import { Path } from '../path';
import { Ref } from '../ref';
import { View } from '../view';

import { Action, Instruction, Method, MethodExpansion } from './instructions';

type TaskContext<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Context<TState, TPath, TOp> & { system: TState };

interface TaskSpec<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> {
	/**
	 * A unique identifier for the task. This is automatically generated
	 * when constructing he task.
	 */
	readonly id: string;

	/**
	 * A descriptor for this task
	 */
	readonly description: string | ((c: Context<TState, TPath, TOp>) => string);

	/**
	 * A lens to focus on the part of the state that this task applies to
	 */
	readonly lens: TPath;

	/**
	 * The operation that this task applies to
	 */
	readonly op: TOp;

	/**
	 * A pre-condition that needs to be met before the task can be chosen
	 */
	condition(
		s: Lens<TState, TPath>,
		c: TaskContext<TState, TPath, TOp>,
	): boolean;
}

// An action definition
interface ActionSpec<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> extends TaskSpec<TState, TPath, TOp> {
	/**
	 * The effect on the state that the action
	 * provides. The effect function can only be ran if the pre condition
	 * is met.
	 *
	 * The effect function receives a reference to the state, which allows
	 * the effect to mutate the state. The effect function should not return
	 * anything.
	 */
	effect(s: View<TState, TPath>, c: TaskContext<TState, TPath, TOp>): void;

	/**
	 * The actual action the task performs.
	 *
	 * The action function receives a reference to the state, which allows the
	 * action to mutate the state. The action function should not return anything.
	 */
	action(
		s: View<TState, TPath>,
		c: TaskContext<TState, TPath, TOp>,
	): Promise<void>;
}

export interface ActionTask<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> extends ActionSpec<TState, TPath, TOp> {
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
	(ctx: TaskArgs<TState, TPath, TOp>): Action<TState, TPath, TOp>;
}

// A method definition
export interface MethodSpec<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
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
	 * The method to be called when the task is executed
	 * if the method returns an empty list, this means there are no
	 * further instructions that can be applied
	 */
	method(
		s: Lens<TState, TPath>,
		c: TaskContext<TState, TPath, TOp>,
	): Instruction<TState> | Array<Instruction<TState>>;
}

export interface MethodTask<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> extends MethodSpec<TState, TPath, TOp> {
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

function ground<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(
	task: ActionSpec<TState, TPath, TOp> | MethodSpec<TState, TPath, TOp>,
	args: TaskArgs<TState, TPath, TOp>,
): Instruction<TState, TPath, TOp> {
	const templateParts = Path.elems(task.lens);

	const path =
		'/' +
		templateParts
			.map((p) => {
				if (p.startsWith(':')) {
					const key = p.slice(1);
					assert(
						key in args,
						`Missing parameter '${key}' in context given to task '${task.id}', required by lens '${task.lens}'`,
					);
					return args[key as keyof typeof args];
				}
				return p;
			})
			.join('/');

	const target = (args as any).target;
	const lensCtx = Lens.context<TState, TPath>(task.lens, path, target);
	const context = Context.from<TState, TPath, TOp>(lensCtx);

	const { id, description: taskDescription } = task;
	const description: string =
		typeof taskDescription === 'function'
			? taskDescription(context)
			: taskDescription;

	const condition = (s: TState) => {
		const lens = Lens.from(s, path as TPath);

		// Otherwise we check the condition
		return task.condition(lens, {
			...context,
			system: s,
		});
	};

	if (isActionSpec(task)) {
		const { effect: taskEffect, action: taskAction } = task;
		const effect = (s: Ref<TState>) =>
			taskEffect(View.from(s, path as TPath), { ...context, system: s._ });
		const action = async (s: Ref<TState>) =>
			taskAction(View.from(s, path as TPath), { ...context, system: s._ });
		return Object.assign(action, {
			id,
			path: context.path as TPath,
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
		task.method(Lens.from(s, context.path as TPath), { ...context, system: s });

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
 * Check if a task or an instruction is an action
 */
function isActionSpec<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(
	t: ActionSpec<TState, TPath, TOp> | MethodSpec<TState, TPath, TOp>,
): t is ActionSpec<TState, TPath, TOp> {
	return (
		(t as any).effect != null &&
		typeof (t as any).effect === 'function' &&
		(t as any).action != null &&
		typeof (t as any).action === 'function'
	);
}

/**
 * Check if a task is a method
 */
function isMethodTask<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(t: Task<TState, TPath, TOp>): t is MethodTask<TState, TPath, TOp> {
	return (t as any).method != null && typeof (t as any).method === 'function';
}

/**
 * Check if a task or an instruction is an action
 */
function isActionTask<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(t: Task<TState, TPath, TOp>): t is ActionTask<TState, TPath, TOp> {
	return (
		(t as any).effect != null &&
		typeof (t as any).effect === 'function' &&
		(t as any).action != null &&
		typeof (t as any).action === 'function'
	);
}

/**
 * A task is base unit of knowledge of an autonomous agent.
 */
export type Task<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = ActionTask<TState, TPath, TOp> | MethodTask<TState, TPath, TOp>;

export type MethodTaskProps<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Partial<Omit<MethodSpec<TState, TPath, TOp>, 'method' | 'id'>> &
	Pick<MethodSpec<TState, TPath, TOp>, 'method'>;

export type ActionTaskProps<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> =
	| (Partial<Omit<ActionSpec<TState, TPath, TOp>, 'effect' | 'id'>> &
			Pick<ActionSpec<TState, TPath, TOp>, 'effect'>)
	| (Partial<Omit<ActionSpec<TState, TPath, TOp>, 'action' | 'id'>> &
			Pick<ActionSpec<TState, TPath, TOp>, 'action'>);

function isActionProps<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(
	x: ActionTaskProps<TState, TPath, TOp> | MethodTaskProps<TState, TPath, TOp>,
): x is ActionTaskProps<TState, TPath, TOp> {
	return (
		typeof (x as any).effect === 'function' ||
		typeof (x as any).action === 'function'
	);
}

/**
 * Create a task
 */
function from<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(t: ActionTaskProps<TState, TPath, TOp>): ActionTask<TState, TPath, TOp>;
function from<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(t: MethodTaskProps<TState, TPath, TOp>): MethodTask<TState, TPath, TOp>;
function from<
	TState = unknown,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(
	taskProps:
		| ActionTaskProps<TState, TPath, TOp>
		| MethodTaskProps<TState, TPath, TOp>,
) {
	const {
		lens = '/',
		op = 'update',
		condition: taskCondition = () => true,
	} = taskProps;

	// Check that the path is valid
	Path.assert(lens);

	const opLabel = op === '*' ? 'process' : op;
	let prefix = '[method] ';

	// The default description is
	// update /a/b/c or
	// [method] update /a/b/c
	const description = (ctx: Context<TState, TPath, TOp>) =>
		`${prefix}${opLabel} ${ctx.path}`;

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
			prefix = '';
			const {
				effect: taskEffect = () => void 0,
				action: taskAction = async (v, c) => taskEffect(v, c),
			} = taskProps;

			let effect = taskEffect;
			let action = taskAction;
			if (op === 'create') {
				effect = (v, c) => {
					// TODO: the {} will not fit every type so we need to assume that
					// the task will initialize the sub-state in a proper way. If we had
					// some sort of validation model from the state we could validate after
					// applying the effect or avoid the need for initializer tasks as the
					// initial state of an entity would be knowable
					v._ = {} as Lens<TState, TPath>;

					return taskEffect(v, c);
				};

				action = async (v, c) => {
					v._ = {} as Lens<TState, TPath>;

					return await taskAction(v, c);
				};
			} else if (op === 'delete') {
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
				lens: lens as TPath,
				op: op as TOp,
				...taskProps,
				condition,
				effect,
				action,
			};
		} else {
			return {
				description,
				lens: lens as TPath,
				op: op as TOp,
				expansion: MethodExpansion.DETECT,
				...taskProps,
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
		return ground(tSpec, ctx);
	}, tSpec);

	return t;
}

interface TaskBuilder<TState> {
	from<TPath extends Path = '/', TOp extends TaskOp = 'update'>(
		t: ActionTaskProps<TState, TPath, TOp>,
	): ActionTask<TState, TPath, TOp>;
	from<TPath extends Path = '/', TOp extends TaskOp = 'update'>(
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
