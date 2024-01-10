function isObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null;
}

/**
 * Generic interface for type equality
 */
interface Eq {
	equals<O = this>(other: O): boolean;
}

const Eq = {
	is(x: unknown): x is Eq {
		return isObject(x) && typeof (x as any).equals === 'function';
	},
};

/**
 * Calculates deep equality between javascript
 * objects
 */
export function deepEqual<T>(value: T, other: T): boolean {
	// Allow user to override the comparison
	if (Eq.is(value)) {
		return value.equals(other);
	}

	if (Eq.is(other)) {
		return other.equals(value);
	}

	if (isObject(value) && isObject(other)) {
		const [vProps, oProps] = [value, other].map(
			(a) => Object.getOwnPropertyNames(a) as Array<keyof T>,
		);
		if (vProps.length !== oProps.length) {
			// If the property lists are different lengths we don't need
			// to check any further
			return false;
		}

		// Otherwise this comparison will catch it. This works even
		// for arrays as getOwnPropertyNames returns the list of indexes
		// for each array
		return vProps.every((key) => deepEqual(value[key], other[key]));
	}

	return value === other;
}
