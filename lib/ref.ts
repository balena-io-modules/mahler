/**
 * A reference to a value
 *
 * JavaScript does not support passing function arguments by reference, we use
 * the `Ref` type to simulate this behavior. Wraping a value in a `Ref` allows
 * the value to be mutated by a function.
 */
export interface Ref<T> {
	_: T;
}

/**
 * Construct a reference from a given value
 *
 * Example:
 *
 * ```ts
 * const ref = Ref.from(1);
 * // The value of ref is now 2
 * ref._++;
 * ```
 */
function of<T>(t: T): Ref<T> {
	return {
		_: t,
	};
}

function is<T>(x: unknown): x is Ref<T> {
	return typeof x === 'object' && x != null && '_' in x;
}

/**
 * Map a function over a reference
 */
function map<T, U>(ref: Ref<T>, f: (t: T) => U): Ref<U> {
	return of(f(ref._));
}

export const Ref = {
	is,
	of,
	map,
};
