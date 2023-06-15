import { Operation } from './operation';
import { Pointer } from './pointer';
import { Path } from './path';
import { Target, DELETED } from './target';

/**
 * A diff is a function that allows to a list of pending operations and a
 * target.
 */
export interface Diff<S> {
	/**
	 * Return the list of operations that need to be applied to the given object
	 * to meet the target.
	 *
	 * If the array is empty, that means the object meets the target and no more
	 * changes are necessary.
	 */
	(s: S): Array<Operation<S, any>>;

	/**
	 * Get the target of this diff. Note that because of how targets are defined,
	 * where the target passed to the `of` function is really a list of requirements to
	 * meet, that means that `diff(obj).length === 0` only means that `obj` meets the target, but
	 * not that `obj` is equal to `diff.target`.
	 */
	get target(): S;
}

function applyPatch<S>(s: S, t: Target<S>): S {
	if (t != null && !Array.isArray(t) && typeof t === 'object') {
		const result = { ...s } as any;
		for (const [key, value] of Object.entries(t)) {
			if (value === DELETED) {
				delete result[key];
			} else {
				result[key] = applyPatch(result[key], value);
			}
		}
		return result;
	}

	return t as S;
}

function isObject(value: unknown): value is object {
	return typeof value === 'object' && value !== null;
}

/**
 * Calculates deep equality between javascript
 * objects
 */
function equals<T>(value: T, other: T): boolean {
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

function* getOperations<S>(s: S, t: Target<S>): Iterable<Operation<S, any>> {
	// We store target, path pair in a quee so we can visit the full target
	// object, ordered by level, without recursion
	const queue: Array<{ tgt: Target<any>; path: Path }> = [{ tgt: t, path: '' }];

	// The target object
	const patched = applyPatch(s, t);

	// The list of operations to return
	while (queue.length > 0) {
		const { tgt, path } = queue.shift()!;

		const sValue = Pointer.of(s, path);
		const tValue = Pointer.of(patched, path);

		// If the target is DELETED, and the source value still
		// exists we need to add a delete operation
		if (tgt === DELETED && sValue != null) {
			yield { op: 'delete', path };
		} else if (tgt !== DELETED) {
			// If the source value does not exist, then we add a `create`
			// operation
			if (sValue == null) {
				yield { op: 'create', path, value: tValue! };
			}
			// If the source value does exist, we do a deep comparison compare the source to the patched
			// version and if they don't match, we add an `update` operation
			else if (!equals(sValue, tValue)) {
				yield {
					op: 'update',
					path: path === '' ? '/' : path,
					value: tValue!,
				};
			}
		}

		if (
			tgt != null &&
			!Array.isArray(tgt) &&
			typeof tgt === 'object' &&
			// Only expand the target if the source exists
			sValue != null
		) {
			// Add target keys to stack to recurse
			for (const key of Object.keys(tgt)) {
				const value = tgt[key];
				const newPath = `${path}/${key}`;
				queue.push({ tgt: value, path: newPath });
			}
		}

		// if tgt is DELETE, then we should also add rules to delete the current
		// properties recursively
		if (
			tgt === DELETED &&
			sValue != null &&
			!Array.isArray(sValue) &&
			typeof sValue === 'object'
		) {
			for (const key of Object.keys(sValue)) {
				const newPath = `${path}/${key}`;
				queue.push({ tgt: DELETED, path: newPath });
			}
		}
	}
}

function of<S>(src: S, tgt: Target<S>): Diff<S> {
	const target = applyPatch(src, tgt);

	return Object.assign(
		(s: S) => {
			// NOTE: we return an array here, but we could easily
			// return an iterator instead for better memory usage
			return [...getOperations(s, tgt)];
		},
		{
			get target() {
				return target;
			},
		},
	);
}

export const Diff = {
	of,
};
