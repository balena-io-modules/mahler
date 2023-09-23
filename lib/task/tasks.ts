import { createHash } from 'crypto';

import assert from '../assert';
import { Context, ContextAsArgs, TaskOp } from '../context';
import { Effect, IO, when, pipe } from '../effects';
import { Path } from '../path';

import { Action, Instruction, Method } from './instructions';

interface TaskSpec<
	TState = any,
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
	 * The path that this task applies to
	 */
	readonly path: TPath;

	/**
	 * The operation that this task applies to
	 */
	readonly op: TOp;

	/**
	 * A pre-condition that needs to be met before the task can be chosen
	 */
	condition(s: TState, c: Context<TState, TPath, TOp>): boolean;
}

// An action definition
export interface ActionTask<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> extends TaskSpec<TState, TPath, TOp> {
	/**
	 * The effect on the state that the action
	 * provides. The effect function can only be ran if the pre condition
	 * is met.
	 */
	effect(s: TState, c: Context<TState, TPath, TOp>): TState | Effect<TState>;

	/**
	 * The actual action the task performs. The action may return an Observable
	 * or a Promise. If the action returns an Observable,
	 * the planner will wait for the observable to complete before continuing, but
	 * use any state updates to communicate about state changes to its observers.
	 */
	action(s: TState, c: Context<TState, TPath, TOp>): Promise<TState>;

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
	(ctx: ContextAsArgs<TState, TPath, TOp>): Action<TState, TPath, TOp>;
}

// A method definition
export interface MethodTask<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> extends TaskSpec<TState, TPath, TOp> {
	/**
	 * The method to be called when the task is executed
	 * if the method returns an empty list, this means there are no
	 * further instructions that can be applied
	 */
	method(
		s: TState,
		c: Context<TState, TPath, TOp>,
	): Instruction<TState> | Array<Instruction<TState>>;

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
	(ctx: ContextAsArgs<TState, TPath, TOp>): Method<TState, TPath, TOp>;
}

function ground<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(
	task: Task<TState, TPath, TOp>,
	ctx: ContextAsArgs<TState, TPath, TOp>,
): Instruction<TState, TPath, TOp> {
	const templateParts = Path.elems(task.path);

	const path =
		'/' +
		templateParts
			.map((p) => {
				if (p.startsWith(':')) {
					const key = p.slice(1);
					assert(
						key in ctx,
						`Missing parameter '${key}' in context given to task '${task.id}', required by path '${task.path}'`,
					);
					return ctx[key as keyof typeof ctx];
				}
				return p;
			})
			.join('/');

	const context = Context.of<TState, TPath, any>(
		task.path,
		`${path}`,
		(ctx as any).target,
	);

	const { id, description: taskDescription } = task;
	const description: string =
		typeof taskDescription === 'function'
			? taskDescription(context)
			: taskDescription;

	if (isActionTask(task)) {
		// Convert the old style API into a function returning effects
		const fn = (state: TState) =>
			pipe(
				state,
				Effect.of,
				when(
					(s) => task.condition(s, context),
					(s) => {
						const e = task.effect(s, context);
						if (Effect.is(e)) {
							return e;
						} else {
							return IO(async () => task.action(s, context), e);
						}
					},
				),
			);
		return Object.assign(fn, {
			id,
			path: context.path as any,
			target: (ctx as any).target,
			_tag: 'action' as const,
			description,
			condition: (s: TState) => task.condition(s, context),
			toJSON() {
				return {
					id,
					path: context.path,
					description,
					target: (ctx as any).target,
				};
			},
		});
	}

	return Object.assign((s: TState) => task.method(s, context), {
		id,
		path: context.path as any,
		target: (ctx as any).target,
		_tag: 'method' as const,
		description,
		condition: (s: TState) => task.condition(s, context),
		toJSON() {
			return {
				id,
				path: context.path,
				description,
				target: (ctx as any).target,
			};
		},
	});
}

/**
 * Check if a task is a method
 */
function isMethodTask<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(t: Task<TState, TPath, TOp>): t is MethodTask<TState, TPath, TOp> {
	return (t as any).method != null && typeof (t as any).method === 'function';
}

/**
 * Check if a task or an instruction is an action
 */
function isActionTask<
	TState = any,
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
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = ActionTask<TState, TPath, TOp> | MethodTask<TState, TPath, TOp>;

export type MethodTaskProps<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Partial<Omit<MethodTask<TState, TPath, TOp>, 'method' | 'id'>> &
	Pick<MethodTask<TState, TPath, TOp>, 'method'>;

export type ActionTaskProps<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Partial<Omit<ActionTask<TState, TPath, TOp>, 'effect' | 'id'>> & {
	effect(s: TState, c: Context<TState, TPath, TOp>): TState;
};

// Action tasks defined using effects don't need conditions or actions
// defined
export type ActionTaskWithEffectProps<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Partial<
	Omit<ActionTask<TState, TPath, TOp>, 'effect' | 'id' | 'action' | 'condition'>
> & {
	effect(s: TState, c: Context<TState, TPath, TOp>): Effect<TState>;
};

/**
 * Create a task
 */
function of<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(t: ActionTaskProps<TState, TPath, TOp>): ActionTask<TState, TPath, TOp>;
function of<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(
	t: ActionTaskWithEffectProps<TState, TPath, TOp>,
): ActionTask<TState, TPath, TOp>;
function of<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(t: MethodTaskProps<TState, TPath, TOp>): MethodTask<TState, TPath, TOp>;
function of<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(
	task:
		| ActionTaskProps<TState, TPath, TOp>
		| MethodTaskProps<TState, TPath, TOp>,
) {
	const { path = '/', op = 'update' } = task;

	// Check that the path is valid
	Path.assert(path);

	const prefix =
		typeof (task as any).method === 'function'
			? '[method] '
			: typeof (task as any).parallel === 'function'
			? '[parallel] '
			: '';

	const spec = {
		description: (ctx: Context<TState, TPath, TOp>) =>
			`${prefix}${op === '*' ? 'process' : op} ${ctx.path}`,
		path,
		op,
		condition: () => true,
		...(typeof (task as any).effect === 'function'
			? {
					action: async (s: TState) => s,
					effect: (s: TState) => s,
			  }
			: {}),
		...task,
	};

	// Serialize the task specification converting all elements to strings
	// including the function bodys where it applies
	const serialized = (Object.keys(spec) as Array<keyof typeof spec>).reduce(
		(o, k) => ({ ...o, [k]: String(spec[k]) }),
		{},
	);
	const id = createHash('sha256')
		.update(JSON.stringify(serialized))
		.digest('hex');

	const t = Object.assign(
		(ctx: ContextAsArgs<TState, TPath, TOp>) => {
			return ground(t as any, ctx);
		},
		{
			id,
			...spec,
		},
	);

	return t;
}

export const Task = {
	of,
	isMethod: isMethodTask,
	isAction: isActionTask,
};
