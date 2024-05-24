import type { Operation, DiffOperation } from './operation';
import { Pointer } from './pointer';
import { Path } from './path';
import type { Target } from './target';
import { UNDEFINED } from './target';
import { deepEqual } from './utils';

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
	(s: S): Array<Operation<S, Path>>;

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

type TreeOperation<S, P extends Path> = DiffOperation<S, P> & {
	isLeaf: boolean;
};

/**
 * getOperations returns all the possible operations that are applicable given a
 * new target state. This means, for instance, that if a target state creates a new
 * value under /a/b/c, this function must report a 'create' operation on that path, but also
 * 'update' operations on '/a/b', '/a', and '/' as any of those can result in same outcome
 */
function* getOperations<S>(
	s: S,
	t: Target<S>,
): Iterable<TreeOperation<S, Path>> {
	// We store target, path pair in a quee so we can visit the full target
	// object, ordered by level, without recursion
	const queue: Array<{ tgt: Target<any>; ref: string[]; isLeaf?: false }> = [
		{ tgt: t, ref: [] },
	];

	// The target object
	const patched = applyPatch(s, t);

	// The list of operations to return
	while (queue.length > 0) {
		const { tgt, ref, isLeaf } = queue.shift()!;

		const path = Path.from(ref);
		const sValue = Pointer.from(s, path);
		const tValue = Pointer.from(patched, path);

		// If the target is DELETED, and the source value still
		// exists we need to add a delete operation
		if (tgt === UNDEFINED && sValue != null) {
			yield { op: 'delete', path, isLeaf: isLeaf == null };
		} else if (tgt !== UNDEFINED) {
			// If the source value does not exist, then we add a `create`
			// operation
			if (sValue == null) {
				yield { op: 'create', path, target: tValue!, isLeaf: true };
			}
			// If the source value does exist, we do a deep comparison compare the source to the patched
			// version and if they don't match, we add an `update` operation
			else if (!deepEqual(sValue, tValue)) {
				yield {
					op: 'update',
					path,
					source: sValue!,
					target: tValue!,
					isLeaf:
						// If the source or target are not objects, or they are arrays, then
						// we wont continue recursing so the object is a leaf
						typeof sValue !== 'object' ||
						Array.isArray(sValue) ||
						typeof tValue !== 'object' ||
						Array.isArray(tValue),
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
				const newPath = ref.concat(key);
				queue.push({ tgt: value, ref: newPath });
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
				const newPath = ref.concat(key);
				// We set isLeaf to false here because we know that the source
				// comes from a previous iteration
				queue.push({ tgt: UNDEFINED, ref: newPath, isLeaf: false });
			}
		}
	}
}

/**
 * Calculates the list of changes between the current state and the target
 *
 * Returns only the leaf operations.
 */
export function diff<S>(s: S, t: Target<S>): Array<DiffOperation<S, Path>> {
	const ops = [...getOperations(s, t)];
	return ops.filter(({ isLeaf }) => isLeaf).map(({ isLeaf, ...op }) => op);
}

function from<S>(src: S, tgt: Target<S>): Distance<S> {
	const target = applyPatch(src, tgt);

	return Object.assign(
		(s: S) => {
			// NOTE: we return an array here, but we could easily
			// return an iterator instead for better memory usage
			return [...getOperations(s, tgt)].map(({ isLeaf, ...op }) => {
				delete (op as any).source;
				return op;
			});
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
