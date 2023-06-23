import { randomUUID } from 'crypto';

import assert from '../assert';
import { Context, ContextAsArgs, TaskOp } from '../context';
import { Path } from '../path';
import { Target } from '../target';

import { Action, Instruction, Method, Redirect } from './instructions';
import { createInstructionId } from './utils';

export const NotImplemented = () => Promise.reject('Not implemented');

interface TaskSpec<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> {
	/**
	 * A unique identifier for the task
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
	effect(s: TState, c: Context<TState, TPath, TOp>): TState;

	/**
	 * The actual action the task performs
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
	(ctx: ContextAsArgs<TState, TPath, TOp>): Action<TState>;
}

/**
 * A redirect task tells the planner to go to an alternative
 * target before moving to the final target.
 *
 * For instance, if the agent is a robot that
 * needs to get from A -> B but there is an obstacle in the path, then the
 * task could identify the obstacle and tell the planner to go from A -> C
 * and then from C -> B in order to reach the target.
 */
export interface RedirectTask<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> extends TaskSpec<TState, TPath, TOp> {
	/**
	 * The actual action the task performs
	 */
	redirect(
		s: TState,
		c: Context<TState, TPath, TOp>,
	): Target<TState> | Array<Target<TState>>;

	/**
	 * The task function grounds the task
	 *
	 * Grounding the task converts the specification into an instruction, that is,
	 * something that can be evaluated by the planner. It does this by
	 * contextualizing the task for a specific target.
	 *
	 * ActionTask --- ground --> Action
	 * MethodTask --- ground --> Method
	 * TargetTask --- ground --> Target
	 */
	(ctx: ContextAsArgs<TState, TPath, TOp>): Redirect<TState>;
}

// A method definition
export interface MethodTask<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> extends TaskSpec<TState, TPath, TOp> {
	/**
	 * The method to be called when the task is executed
	 * if the method returns an empty list, this means the sequence is not applicable
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
	(ctx: ContextAsArgs<TState, TPath, TOp>): Method<TState>;
}

function ground<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(
	task: Task<TState, TPath, TOp>,
	ctx: ContextAsArgs<TState, TPath, TOp>,
): Instruction<TState> {
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

	const { id: taskId, description: taskDescription } = task;
	const description: string =
		typeof taskDescription === 'function'
			? taskDescription(context)
			: taskDescription;

	const id = createInstructionId(taskId, path, (ctx as any).target);

	if (isMethodTask(task)) {
		return Object.assign((s: TState) => task.method(s, context), {
			id,
			_tag: 'method' as const,
			description,
			condition: (s: TState) => task.condition(s, context),
		});
	}

	if (isRedirectTask(task)) {
		return Object.assign((s: TState) => task.redirect(s, context), {
			id,
			_tag: 'redirect' as const,
			description,
			condition: (s: TState) => task.condition(s, context),
		});
	}

	return Object.assign((s: TState) => task.action(s, context), {
		id,
		_tag: 'action' as const,
		description,
		condition: (s: TState) => task.condition(s, context),
		effect: (s: TState) => task.effect(s, context),
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
 * Check if a task is a redirect
 */
function isRedirectTask<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(t: Task<TState, TPath, TOp>): t is RedirectTask<TState, TPath, TOp> {
	return (
		(t as any).redirect != null && typeof (t as any).redirect === 'function'
	);
}

/**
 * A task is base unit of knowledge of an autonomous agent.
 */
export type Task<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> =
	| ActionTask<TState, TPath, TOp>
	| MethodTask<TState, TPath, TOp>
	| RedirectTask<TState, TPath, TOp>;

export type MethodTaskProps<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Partial<Omit<MethodTask<TState, TPath, TOp>, 'method'>> &
	Pick<MethodTask<TState, TPath, TOp>, 'method'>;

export type ActionTaskProps<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Partial<Omit<ActionTask<TState, TPath, TOp>, 'effect'>> &
	Pick<ActionTask<TState, TPath, TOp>, 'effect'>;

export type RedirectTaskProps<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Partial<Omit<RedirectTask<TState, TPath, TOp>, 'redirect'>> &
	Pick<RedirectTask<TState, TPath, TOp>, 'redirect'>;

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
>(t: MethodTaskProps<TState, TPath, TOp>): MethodTask<TState, TPath, TOp>;
function of<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(t: RedirectTaskProps<TState, TPath, TOp>): RedirectTask<TState, TPath, TOp>;
function of<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(
	task:
		| ActionTaskProps<TState, TPath, TOp>
		| MethodTaskProps<TState, TPath, TOp>
		| RedirectTaskProps<TState, TPath, TOp>,
) {
	const { path = '/', op = 'update', id = randomUUID() } = task;

	// Check that the path is valid
	Path.assert(path);

	const prefix =
		typeof (task as any).method === 'function'
			? '[method] '
			: typeof (task as any).redirect === 'function'
			? '[redirect] '
			: '';

	const t = Object.assign(
		(ctx: ContextAsArgs<TState, TPath, TOp>) => {
			return ground(t as any, ctx);
		},
		{
			id,
			description: (ctx: Context<TState, TPath, TOp>) =>
				`${prefix}${op === '*' ? 'process' : op} ${ctx.path}`,
			path,
			op,
			condition: () => true,
			...(typeof (task as any).method === 'function' ||
			typeof (task as any).redirect === 'function'
				? {}
				: {
						action: NotImplemented,
						effect: (s: TState) => s,
				  }),
			...task,
		},
	);

	return t;
}

export const Task = {
	of,
	isMethod: isMethodTask,
	isAction: isActionTask,
	isRedirect: isRedirectTask,
};
