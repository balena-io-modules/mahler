import { Operation } from './operation';
import { Pointer } from './pointer';
import { Path } from './path';
import { Target, UNDEFINED } from './target';
import { equals } from './json';

/**
 * A diff is a function that allows to find a list of pending operations to a
 * target.
 */
export interface Distance<S> {
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
			if (value === UNDEFINED) {
				delete result[key];
			} else {
				result[key] = applyPatch(result[key], value);
			}
		}
		return result;
	}

	return t as S;
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

		const sValue = Pointer.from(s, path);
		const tValue = Pointer.from(patched, path);

		// If the target is DELETED, and the source value still
		// exists we need to add a delete operation
		if (tgt === UNDEFINED && sValue != null) {
			yield { op: 'delete', path };
		} else if (tgt !== UNDEFINED) {
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
			tgt === UNDEFINED &&
			sValue != null &&
			!Array.isArray(sValue) &&
			typeof sValue === 'object'
		) {
			for (const key of Object.keys(sValue)) {
				const newPath = `${path}/${key}`;
				queue.push({ tgt: UNDEFINED, path: newPath });
			}
		}
	}
}

function from<S>(src: S, tgt: Target<S>): Distance<S> {
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

export const Distance = {
	from,
};
