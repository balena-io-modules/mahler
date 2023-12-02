import { Lens } from '../lens';
import { AnyOp, Update, Create } from '../operation';
import { PathType, Root } from '../path';
import { View } from '../view';
import { Context } from './context';
import { Instruction, MethodExpansion } from './instructions';

type ReadOnlyPrimitive =
	| undefined
	| null
	| boolean
	| string
	| number
	| ((...args: any[]) => any)
	| Date;

export type ReadOnly<T> = T extends ReadOnlyPrimitive
	? T
	: T extends Array<infer U>
	  ? Array<ReadOnly<U>>
	  : T extends Map<infer K, infer V>
	    ? Map<ReadOnly<K>, ReadOnly<V>>
	    : T extends Set<infer M>
	      ? Set<ReadOnly<M>>
	      : { readonly [K in keyof T]: ReadOnly<T[K]> };

export type ContextWithSystem<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> = Context<TState, TPath, TOp> & { system: TState };

/**
 * A descriptor for this task. The descriptor can be either a string or a Context
 * instance. The description does not receive the current state to allow actions to
 * be compared by their description (useful for testing and debugging).
 */
export type DescriptionFn<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> = string | ((c: Context<TState, TPath, TOp>) => string);

export type ConditionFn<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> = (
	s: TOp extends Create ? never : ReadOnly<Lens<TState, TPath>>,
	c: ReadOnly<ContextWithSystem<TState, TPath, TOp>>,
) => boolean;

export type EffectFn<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> = (
	view: View<TState, TPath, TOp>,
	ctx: ContextWithSystem<TState, TPath, TOp>,
) => void;

export type ActionFn<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> = (
	view: View<TState, TPath, TOp>,
	ctx: ContextWithSystem<TState, TPath, TOp>,
) => Promise<void>;

export type MethodFn<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> = (
	s: TOp extends Create ? never : ReadOnly<Lens<TState, TPath>>,
	c: ReadOnly<ContextWithSystem<TState, TPath, TOp>>,
) => Instruction<TState> | Array<Instruction<TState>>;

/**
 * Action task constructor properties
 */
export interface ActionTaskProps<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> {
	/**
	 * The path to the element that this task applies to
	 */
	lens?: TPath;

	/**
	 * The operation that this task applies to
	 */
	op?: TOp;

	/**
	 * A descriptor for this task. The descriptor can be either a string or a Context
	 * instance. The description does not receive the current state to allow actions to
	 * be compared by their description (useful for testing and debugging).
	 */
	description?: DescriptionFn<TState, TPath, TOp>;

	/**
	 * A condition that must be met for the task to be chosen by the planner or executed by
	 * an agent.
	 */
	condition?: ConditionFn<TState, TPath, TOp>;

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
	effect: EffectFn<TState, TPath, TOp>;

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
	action?: ActionFn<TState, TPath, TOp>;
}

/**
 * Method task constructor properties
 */
export type MethodTaskProps<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> = {
	/**
	 * The path to the element that this task applies to
	 */
	lens?: TPath;

	/**
	 * The operation that this task applies to
	 */
	op?: TOp;

	/**
	 * A descriptor for this task. The descriptor can be either a string or a Context
	 * instance. The description does not receive the current state to allow actions to
	 * be compared by their description (useful for testing and debugging).
	 */
	description?: DescriptionFn<TState, TPath, TOp>;

	/**
	 * The method expansion. The default is 'detect', meaning the planner will try to execute
	 * the instructions returned by the method in parallel and go back to sequential expansion
	 * if conflicts are detected. If sequential is chosen, the planner will jump straight to
	 * sequential expansion. This is a workaround to handle those cases where detection may fail
	 * due to instructios that read data handled by a parallel branch.
	 */
	expansion?: MethodExpansion;

	/**
	 * A condition that must be met for the task to be chosen by the planner or executed by
	 * an agent.
	 */
	condition?: ConditionFn<TState, TPath, TOp>;

	/**
	 * The method to be called when the task is executed.
	 *
	 * The method should return a list of instructions to be used by the planner.
	 * It should never modify the state object.
	 *
	 * if the method returns an empty list, this means there are no
	 * further instructions that can be applied
	 */
	method: MethodFn<TState, TPath, TOp>;
};

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

export const ActionTaskProps = {
	is: isActionProps,
};
