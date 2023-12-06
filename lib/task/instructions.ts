import { Path, PathType } from '../path';
import { Context } from './context';
import { Ref } from '../ref';
import { AnyOp, Update, Create } from '../operation';

interface Instance<TState, TPath extends PathType, TOp extends AnyOp> {
	/**
	 * The identifier for the task
	 */
	readonly id: string;

	/**
	 * The actual path that this instance applies to
	 */
	readonly path: Path<TPath>;

	/**
	 * The target for the instruction
	 */
	readonly target: TOp extends Update | Create
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
	TPath extends PathType = any,
	TOp extends AnyOp = any,
> extends Instance<TState, TPath, TOp> {
	readonly _tag: 'action';

	effect(s: Ref<TState>): void;

	/**
	 * Run the action
	 */
	(s: Ref<TState>): Promise<void>;
}

export const MethodExpansion = {
	SEQUENTIAL: 'sequential' as const,
	DETECT: 'detect' as const,
};
export type MethodExpansion =
	(typeof MethodExpansion)[keyof typeof MethodExpansion];

/** A method task that has been applied to a specific context */
export interface Method<
	TState = any,
	TPath extends PathType = any,
	TOp extends AnyOp = any,
> extends Instance<TState, TPath, TOp> {
	readonly _tag: 'method';

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
	 * if the method returns an empty list, this means the procedure is not applicable
	 */
	(s: TState): Instruction<TState> | Array<Instruction<TState>>;
}

export type Instruction<
	TState = any,
	TPath extends PathType = any,
	TOp extends AnyOp = any,
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
