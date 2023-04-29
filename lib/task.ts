import { randomUUID } from 'crypto';

import { Path } from './path';
import { Context, ContextAsArgs } from './context';
import { Op, Operation } from './operation';
import { equals } from './json';
import assert from './assert';

export const NotImplemented = () => Promise.reject('Not implemented');
export const NoOp = <T>(s: T) => Promise.resolve(s);

interface TaskSpec<
	TState = any,
	TPath extends Path = '/',
	TOp extends Op = 'update',
> {
	/**
	 * A unique identifier for the task
	 */
	readonly id: string;

	/**
	 * A descriptor for this task
	 */
	readonly description: string | ((c: Context<TState, TPath>) => string);

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
	condition(s: TState, c: Context<TState, TPath>): boolean;
}

// An action definition
interface ActionTask<
	TState = any,
	TPath extends Path = '/',
	TOp extends Op = 'update',
> extends TaskSpec<TState, TPath, TOp> {
	/**
	 * The effect on the state that the action
	 * provides. The effect function can only be ran if the pre condition
	 * is met.
	 */
	effect(s: TState, c: Context<TState, TPath>): TState;

	/**
	 * The actual action the task performs
	 */
	action(s: TState, c: Context<TState, TPath>): Promise<TState>;

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
	(ctx: ContextAsArgs<TState, TPath>): Action<TState>;
}

// A method definition
interface MethodTask<
	TState = any,
	TPath extends Path = '/',
	TOp extends Op = 'update',
> extends TaskSpec<TState, TPath, TOp> {
	/**
	 * The method to be called when the task is executed
	 * if the method returns an empty list, this means the sequence is not applicable
	 */
	method(s: TState, c: Context<TState, TPath>): Array<Instruction<TState>>;

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
	(ctx: ContextAsArgs<TState, TPath>): Method<TState>;
}

interface Instance<TState, TPath extends Path> {
	/**
	 * The instance id
	 */
	readonly id: string;

	/**
	 * THe instanced description for this instance
	 */
	readonly description: string;

	/**
	 * The path that this task applies to
	 */
	readonly path: Path;

	/**
	 * The target used in the context to create this instance. We store this so we
	 * can compare between instances. If an instance comes from a method, we don't
	 * want to use an instance with the same id, path and target again when
	 * planning
	 */
	readonly target: Context<TState, TPath>['target'];

	/**
	 * A pre-condition that needs to be met before the instance can be used
	 */
	condition(s: TState): boolean;
}

/** An action task that has been applied to a specific context */
export interface Action<TState = any, TPath extends Path = '/'>
	extends Instance<TState, TPath> {
	/**
	 * The effect on the state that the action
	 * provides. If the effect returns none, then the task is not applicable
	 * on the current state
	 */
	effect(s: TState): TState;

	/**
	 * Run the action
	 */
	run(s: TState): Promise<TState>;
}

/** A method task that has been applied to a specific context */
export interface Method<TState = any, TPath extends Path = '/'>
	extends Instance<TState, TPath> {
	/**
	 * The method to be called when the task is executed
	 * if the method returns an empty list, this means the procedure is not applicable
	 */
	expand(s: TState): Array<Instruction<TState>>;
}

export type Instruction<TState = any, TPath extends Path = '/'> =
	| Action<TState, TPath>
	| Method<TState, TPath>;

function ground<
	TState = any,
	TPath extends Path = '/',
	TOp extends Op = 'update',
>(
	task: Task<TState, TPath, TOp>,
	ctx: ContextAsArgs<TState, TPath>,
): Instruction<TState, TPath> {
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

	const context = Context.of(task.path, `/${path}`, ctx.target);

	const { id, description: taskDescription } = task;
	const description =
		typeof taskDescription === 'function'
			? taskDescription(context)
			: taskDescription;

	if (isMethodTask(task)) {
		return {
			id,
			path,
			target: ctx.target,
			description,
			condition: (s: TState) => task.condition(s, context),
			expand: (s: TState) => task.method(s, context),
		};
	}

	return {
		id,
		path,
		target: ctx.target,
		description,
		condition: (s: TState) => task.condition(s, context),
		effect: (s: TState) => task.effect(s, context),
		run: (s: TState) => task.action(s, context),
	};
}

/**
 * Check if a task is a method
 */
function isMethodTask<
	TState = any,
	TPath extends Path = '/',
	TOp extends Op = 'update',
>(t: Task<TState, TPath, TOp>): t is MethodTask<TState, TPath, TOp> {
	return (t as any).method != null && typeof (t as any).method === 'function';
}

/**
 * Check if an instruction is a method
 */
function isMethod<TState = any>(t: Instruction<TState>): t is Method<TState> {
	return (
		(t as any).condition != null &&
		typeof (t as any).condition === 'function' &&
		(t as any).expand != null &&
		typeof (t as any).expand === 'function'
	);
}

/**
 * Check if a task or an instruction is an action
 */
function isActionTask<
	TState = any,
	TPath extends Path = '/',
	TOp extends Op = 'update',
>(t: Task<TState, TPath, TOp>): t is ActionTask<TState, TPath, TOp> {
	return (
		(t as any).effect != null &&
		typeof (t as any).effect === 'function' &&
		(t as any).action != null &&
		typeof (t as any).action === 'function'
	);
}

/**
 * Check if an instruction is an action
 */
function isAction<TState = any>(t: Instruction<TState>): t is Action<TState> {
	return (
		(t as any).condition != null &&
		typeof (t as any).condition === 'function' &&
		(t as any).effect != null &&
		typeof (t as any).effect === 'function' &&
		(t as any).action != null &&
		typeof (t as any).run === 'function'
	);
}

/**
 * A task is base unit of knowledge of an autonomous agent.
 *
 * Task applicability
 *
 *                |---------------------------|
 *                |   Operation: /a/b/c       |
 * |------------------------------------------|
 * |  Task: /a/b  | create | update | delete  |
 * | -----------------------------------------|
 * |  create      | yes    |   no   |   no    |
 * |  update      | yes    |   yes  |   yes   |
 * |  delete      | no     |   no   |   yes   |
 */
export type Task<
	TState = any,
	TPath extends Path = '/',
	TOp extends Op = 'update',
> = ActionTask<TState, TPath, TOp> | MethodTask<TState, TPath, TOp>;

/**
 * Create a task
 */
function of<TState = any, TOp extends Op = 'update'>({
	path = '/',
}: Partial<Task<TState, '/', TOp>>): Task<TState, '/', TOp>;
function of<TState = any, TPath extends Path = '/'>({
	op = 'update',
}: Partial<Task<TState, TPath, 'update'>>): Task<TState, TPath, 'update'>;
function of<TState = any>({
	path = '/',
	op = 'update',
}: Partial<Task<TState, '/', 'update'>>): Task<TState, '/', 'update'>;
function of<TState = any, TPath extends Path = '/', TOp extends Op = 'update'>(
	t: Partial<Task<TState, TPath, TOp>>,
): Task<TState, TPath, TOp>;
function of<TState = any, TPath extends Path = '/', TOp extends Op = 'update'>(
	task: Partial<Task<TState, TPath, TOp>>,
) {
	const { path = '/', op = 'update', id = randomUUID() } = task;

	// Check that the path is valid
	Path.assert(path);

	const t = Object.assign(
		(ctx: ContextAsArgs<TState, TPath>) => {
			return ground(t as any, ctx);
		},
		{
			id,
			description: (ctx: Context<TState, TPath>) =>
				// QUESTION: what's a good default description
				JSON.stringify({ path, op, ...ctx }),
			path,
			op,
			condition: () => true,
			...(typeof (task as any).method === 'function'
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

function isEqual<TState = any>(
	i1: Instruction<TState>,
	i2: Instruction<TState>,
): boolean {
	// Two instructions are equal if their respective id, path, and targets match
	const id1 = { id: i1.id, path: i1.path, target: i1.target };
	const id2 = { id: i2.id, path: i2.path, target: i2.target };
	return equals(id1, id2);
}

/**
 * Identify if a task is applicable for a specific operation
 *
 * Applicability is determined according to the following table
 *
 *                |---------------------------|
 *                |   Operation: /a/b/c       |
 * |------------------------------------------|
 * |  Task: /a/b  | create | update | delete  |
 * | -----------------------------------------|
 * |  create      | yes    |   no   |   no    |
 * |  update      | yes    |   yes  |   yes   |
 * |  delete      | no     |   no   |   yes   |
 */
function isApplicable<
	TState = any,
	TPath extends Path = '/',
	TOp extends Op = 'update',
>(t: Task<TState, TPath, TOp>, o: Operation<any, any>) {
	if (t.op !== 'update' && t.op !== o.op) {
		return false;
	}

	const templateParts = Path.elems(t.path);
	const parts = Path.elems(o.path);

	if (templateParts.length > parts.length) {
		return false;
	}

	for (const templateElem of templateParts) {
		const pathElem = parts.shift();
		if (!templateElem.startsWith(':') && templateElem !== pathElem) {
			return false;
		}
	}

	return true;
}

export const Task = {
	of,
	isMethod: isMethodTask,
	isAction: isActionTask,
	isApplicable,
};

export const Method = {
	is: isMethod,
	equals: isEqual,
};

export const Action = {
	is: isAction,
	equals: isEqual,
};

export const Instruction = {
	equals: isEqual,
};

export default Task;
