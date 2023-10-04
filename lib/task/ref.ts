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
function from<T>(t: T): Ref<T> {
	return {
		_: t,
	};
}

export const Ref = {
	from,
};
