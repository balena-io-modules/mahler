import merge from 'ts-deepmerge';

type Patch<T> = T extends object
	? {
		[P in keyof T]?: Patch<T[P]>;
	}
	: T;

export function patch<T = any>(src: T, p: Patch<T>): T {
	return merge.withOptions({ mergeArrays: false }, src as any, p) as T;
}

function isObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null;
}

/**
 * Calculates deep equality between javascript
 * objects
 */
export function equals<T>(value: T, other: T): boolean {
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
		return vProps.every((key) => equals(value[key], other[key]));
	}

	return value === other;
}
