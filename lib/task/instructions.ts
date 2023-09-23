import { Effect } from '../effects';
import { Path } from '../path';
import { TaskOp, Context } from '../context';

interface Instance<TState, TPath extends Path, TOp extends TaskOp> {
	/**
	 * The identifier for the task
	 */
	readonly id: string;

	/**
	 * The actual path that this instance applies to
	 */
	readonly path: TPath;

	/**
	 * The target for the instruction
	 */
	readonly target: TOp extends 'update' | 'create'
		? Context<TState, TPath, TOp>['target']
		: undefined;

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
export interface Action<
	TState = any,
	TPath extends Path = any,
	TOp extends TaskOp = any,
> extends Instance<TState, TPath, TOp> {
	readonly _tag: 'action';

	/**
	 * Run the action
	 */
	(s: TState): Effect<TState>;
}

/** A method task that has been applied to a specific context */
export interface Method<
	TState = any,
	TPath extends Path = any,
	TOp extends TaskOp = any,
> extends Instance<TState, TPath, TOp> {
	readonly _tag: 'method';
	/**
	 * The method to be called when the task is executed
	 * if the method returns an empty list, this means the procedure is not applicable
	 */
	(s: TState): Instruction<TState> | Array<Instruction<TState>>;
}

export type Instruction<
	TState = any,
	TPath extends Path = any,
	TOp extends TaskOp = any,
> = Action<TState, TPath, TOp> | Method<TState, TPath, TOp>;

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
 * Check if an instruction is an action
 */
function isAction<TState = any>(
	t: Instruction<TState>,
): t is Action<TState, any, any> {
	return (
		(t as any).condition != null &&
		typeof (t as any).condition === 'function' &&
		typeof t === 'function' &&
		(t as any)._tag === 'action'
	);
}

function isEqual<TState = any>(
	i1: Instruction<TState>,
	i2: Instruction<TState>,
): boolean {
	return i1.id === i2.id && i1.path === i2.path && i1.target === i2.target;
}

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
