import { randomUUID, createHash } from 'crypto';

import { Path } from './path';
import { Context, ContextAsArgs, TaskOp } from './context';
import { Operation } from './operation';
import assert from './assert';

export const NotImplemented = () => Promise.reject('Not implemented');
export const NoAction = <T>(s: T) => Promise.resolve(s);
export const NoEffect = <T>(s: T) => s;

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
	method(s: TState, c: Context<TState, TPath, TOp>): Array<Instruction<TState>>;

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

interface Instance<TState> {
	/**
	 * The instance id
	 */
	readonly id: string;

	/**
	 * THe instanced description for this instance
	 */
	readonly description: string;

	/**
	 * A pre-condition that needs to be met before the instance can be used
	 */
	condition(s: TState): boolean;
}

/** An action task that has been applied to a specific context */
export interface Action<TState = any> extends Instance<TState> {
	readonly _tag: 'action';

	/**
	 * The effect on the state that the action
	 * provides. If the effect returns none, then the task is not applicable
	 * on the current state
	 */
	effect(s: TState): TState;

	/**
	 * Run the action
	 */
	(s: TState): Promise<TState>;
}

/** A method task that has been applied to a specific context */
export interface Method<TState = any> extends Instance<TState> {
	readonly _tag: 'method';
	/**
	 * The method to be called when the task is executed
	 * if the method returns an empty list, this means the procedure is not applicable
	 */
	(s: TState): Array<Instruction<TState>>;
}

export type Instruction<TState = any> = Action<TState> | Method<TState>;

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
		`/${path}`,
		(ctx as any).target,
	);

	const { id: taskId, description: taskDescription } = task;
	const description: string =
		typeof taskDescription === 'function'
			? taskDescription(context)
			: taskDescription;

	const id = createHash('sha256')
		.update(
			JSON.stringify({
				id: taskId,
				path,
				...((ctx as any).target && { target: (ctx as any).target }),
			}),
		)
		.digest('hex');

	if (isMethodTask(task)) {
		return Object.assign((s: TState) => task.method(s, context), {
			id,
			_tag: 'method' as const,
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
 * Check if an instruction is a method
 */
function isMethod<TState = any>(t: Instruction<TState>): t is Method<TState> {
	return (
		(t as any).condition != null &&
		typeof (t as any).condition === 'function' &&
		typeof t === 'function' &&
		(t as any)._tag === 'method'
	);
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
 * Check if an instruction is an action
 */
function isAction<TState = any>(t: Instruction<TState>): t is Action<TState> {
	return (
		(t as any).condition != null &&
		typeof (t as any).condition === 'function' &&
		(t as any).effect != null &&
		typeof (t as any).effect === 'function' &&
		typeof t === 'function' &&
		(t as any)._tag === 'action'
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

type MethodTaskProps<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Partial<Omit<MethodTask<TState, TPath, TOp>, 'method'>> &
	Pick<MethodTask<TState, TPath, TOp>, 'method'>;

type ActionTaskProps<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Partial<Omit<ActionTask<TState, TPath, TOp>, 'effect'>> &
	Pick<ActionTask<TState, TPath, TOp>, 'effect'>;

/**
 * Create a task
 */
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
>(
	task:
		| ActionTaskProps<TState, TPath, TOp>
		| MethodTaskProps<TState, TPath, TOp>,
) {
	const { path = '/', op = 'update', id = randomUUID() } = task;

	// Check that the path is valid
	Path.assert(path);

	const t = Object.assign(
		(ctx: ContextAsArgs<TState, TPath, TOp>) => {
			return ground(t as any, ctx);
		},
		{
			id,
			description: id,
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
	return i1.id === i2.id;
}

/**
 * Identify if a task is applicable for a specific operation
 *
 * A task is applicable if the task operation as the operation op, and if the task path matches the operation
 * path
 */
function isApplicable<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(t: Task<TState, TPath, TOp>, o: Operation<any, any>) {
	if (t.op !== '*' && t.op !== o.op) {
		return false;
	}

	const taskParts = Path.elems(t.path);
	const opParts = Path.elems(o.path);

	if (taskParts.length !== opParts.length) {
		return false;
	}

	for (const tElem of taskParts) {
		const oElem = opParts.shift();
		if (!tElem.startsWith(':') && tElem !== oElem) {
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

// A pure task does not have an `action` property
// and requires that `op` is defined
type PureTaskProps<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Partial<Omit<ActionTask<TState, TPath, TOp>, 'effect' | 'action' | 'op'>> &
	Pick<ActionTask<TState, TPath, TOp>, 'effect' | 'op'>;

/**
 * A pure task is a task that has no side effects,
 * that is, it does not interact with the underlying system being
 * controlled, it only transforms the internal state of the agent/planner
 * in some way.
 */
export const Pure = {
	of: <TState = any, TPath extends Path = '/', TOp extends TaskOp = 'update'>({
		effect,
		...props
	}: PureTaskProps<TState, TPath, TOp>) =>
		Task.of({
			effect,
			...props,
			action: (s, c) => Promise.resolve(effect(s, c)),
		}),
};

/**
 * A noop task is a task that does not change the state, it can
 * be added to the plan under some condition for debugging purposes
 */
export const NoOp = {
	of: <TState = any, TPath extends Path = '/'>({
		description = 'NoOp',
		...props
	}: Partial<
		Pick<
			ActionTaskProps<TState, TPath, 'update'>,
			'path' | 'condition' | 'description'
		>
	>) =>
		Task.of({
			description,
			...props,
			effect: NoEffect,
			action: NoAction,
		}),
};

/**
 * A constructor task is a pure task that is used to initialize
 * the value of a property in the internal state of the system.
 * It is useful in the case of nested properties, where creating the
 * parent property has no effects on the system but is necessary in order
 * for a task for the creation of the child property to be picked up.
 */
export const Constructor = {
	of: <TState = any, TPath extends Path = '/'>(
		props: Omit<PureTaskProps<TState, TPath, 'create'>, 'op'>,
	) =>
		// Only execute the task if the property does not exist
		Pure.of({ op: 'create', condition: (s, c) => c.get(s) == null, ...props }),
};

export default Task;
