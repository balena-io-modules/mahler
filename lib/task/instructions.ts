import { Observable } from '../observable';

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
	(s: TState): Promise<TState> | Observable<TState>;
}

/** A method task that has been applied to a specific context */
export interface Method<TState = any> extends Instance<TState> {
	readonly _tag: 'method';
	/**
	 * The method to be called when the task is executed
	 * if the method returns an empty list, this means the procedure is not applicable
	 */
	(s: TState): Instruction<TState> | Array<Instruction<TState>>;
}

export type Instruction<TState = any> = Action<TState> | Method<TState>;

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

function isEqual<TState = any>(
	i1: Instruction<TState>,
	i2: Instruction<TState>,
): boolean {
	return i1.id === i2.id;
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
