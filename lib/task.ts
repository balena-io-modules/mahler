import * as assert from 'assert';

import { Context, ContextAsArgs, Path, Operation } from './context';

export type Op = Operation | '*';

export const NotImplemented = () => Promise.reject('Not implemented');

interface TaskSpec<
	TState = any,
	TPath extends Path = '/',
	TOperation extends Op = '*',
> {
	/**
	 * A unique descriptor for this task
	 */
	readonly description: string | ((c: Context<TState, TPath>) => string);

	/**
	 * The path that this task applies to
	 */
	readonly path: TPath;

	/**
	 * The operation that this task applies to
	 */
	readonly op: TOperation;

	/**
	 * A pre-condition that needs to be met before the task can be chosen
	 */
	condition(s: TState, c: Context<TState, TPath>): boolean;

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
	(ctx: ContextAsArgs<TState, TPath>): Instruction<TState>;
}

// An action definition
interface ActionTask<
	TState = any,
	TPath extends Path = '/',
	TOperation extends Op = '*',
> extends TaskSpec<TState, TPath, TOperation> {
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
}

// A method definition
interface MethodTask<
	TState = any,
	TPath extends Path = '/',
	TOperation extends Op = '*',
> extends TaskSpec<TState, TPath, TOperation> {
	/**
	 * The method to be called when the task is executed
	 * if the method returns an empty list, this means the sequence is not applicable
	 *
	 * TODO: should the function return none if not applicable
	 */
	method(s: TState, c: Context<TState, TPath>): Array<Instruction<TState>>;
}

interface Instance<TState> {
	readonly description: string;

	/**
	 * The path that this task applies to
	 */
	readonly path: Path;

	/**
	 * A pre-condition that needs to be met before the task can be chosen
	 */
	condition(s: TState): boolean;
}

/** An action task that has been applied to a specific context */
export interface Action<TState = any> extends Instance<TState> {
	/**
	 * The effect on the state that the action
	 * provides. If the effect returns none, then the task is not applicable
	 * on the current state
	 */
	effect(s: TState): TState;

	/**
	 * The actual action the task performs
	 */
	action(s: TState): Promise<TState>;
}

/** An action task that has been applied to a specific context */
interface Method<TState = any> extends Instance<TState> {
	/**
	 * The method to be called when the task is executed
	 * if the method returns an empty list, this means the procedure is not applicable
	 *
	 * TODO: should the method return none if not applicable
	 */
	method(s: TState): Array<Instruction<TState>>;
}

export type Instruction<TState = any> = Action<TState> | Method<TState>;

function ground<
	TState = any,
	TPath extends Path = '/',
	TOperation extends Op = '*',
>(
	task: Task<TState, TPath, TOperation>,
	ctx: ContextAsArgs<TState, TPath>,
): Instruction<TState> {
	const templateParts = task.path
		.slice(1)
		.split('/')
		.filter((s) => s.length > 0);

	const path = templateParts
		.map((p) => {
			if (p.startsWith(':')) {
				const key = p.slice(1);
				assert(key in ctx, `Missing parameter ${key} in path ${task.path}`);
				return ctx[key as keyof typeof ctx];
			}
			return p;
		})
		.join('/');

	const context = Context.of(task.path, `/${path}`, ctx.target);

	const taskDescription = task.description;
	const description =
		typeof taskDescription === 'function'
			? taskDescription(context)
			: taskDescription;

	if (isMethod(task)) {
		return {
			description,
			path,
			condition: (s: TState) => task.condition(s, context),
			method: (s: TState) => task.method(s, context),
		};
	}

	return {
		description,
		path,
		condition: (s: TState) => task.condition(s, context),
		effect: (s: TState) => task.effect(s, context),
		action: (s: TState) => task.action(s, context),
	};
}

/**
 * Check if a task or an instruction is a method
 */
function isMethod<
	TState = any,
	TPath extends Path = '/',
	TOperation extends Op = '*',
>(
	t: Task<TState, TPath, TOperation>,
): t is MethodTask<TState, TPath, TOperation>;
function isMethod<TState = any>(t: Instruction<TState>): t is Method<TState>;
function isMethod<
	TState = any,
	TPath extends Path = '/',
	TOperation extends Op = '*',
>(t: Task<TState, TPath, TOperation> | Instruction<TState>) {
	return (t as any).method != null && typeof (t as any).method === 'function';
}

/**
 * Check if a task or an instruction is a method
 */
function isAction<
	TState = any,
	TPath extends Path = '/',
	TOperation extends Op = '*',
>(
	t: Task<TState, TPath, TOperation>,
): t is ActionTask<TState, TPath, TOperation>;
function isAction<TState = any>(t: Instruction<TState>): t is Action<TState>;
function isAction<
	TState = any,
	TPath extends Path = '/',
	TOperation extends Op = '*',
>(t: Task<TState, TPath, TOperation> | Instruction<TState>) {
	return (
		(t as any).effect != null &&
		typeof (t as any).effect === 'function' &&
		(t as any).action != null &&
		typeof (t as any).action === 'function'
	);
}

export type Task<
	TState = any,
	TPath extends Path = '/',
	TOperation extends Op = '*',
> =
	| ActionTask<TState, TPath, TOperation>
	| MethodTask<TState, TPath, TOperation>;

function of<TState = any, TOperation extends Op = '*'>({
	path = '/',
}: Partial<Task<TState, '/', TOperation>>): Task<TState, '/', TOperation>;
function of<TState = any, TPath extends Path = '/'>({
	op = '*',
}: Partial<Task<TState, TPath, '*'>>): Task<TState, TPath, '*'>;
function of<TState = any>({
	path = '/',
	op = '*',
}: Partial<Task<TState, '/', '*'>>): Task<TState, '/', '*'>;
function of<
	TState = any,
	TPath extends Path = '/',
	TOperation extends Op = '*',
>(t: Partial<Task<TState, TPath, TOperation>>): Task<TState, TPath, TOperation>;
function of<
	TState = any,
	TPath extends Path = '/',
	TOperation extends Op = '*',
>(task: Partial<Task<TState, TPath, TOperation>>) {
	const { path = '/', op = '*' } = task;
	assert(Path.is(path), `'${path} is not a valid path`);

	const t = Object.assign(
		(ctx: ContextAsArgs<TState, TPath>) => {
			return ground(t as any, ctx);
		},
		{
			description: (ctx: Context<TState, TPath>) =>
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

export const Task = {
	of,
	isMethod,
	isAction,
};

export const Method = {
	is: isMethod,
};

export const Action = {
	is: isAction,
};

export default Task;
