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

interface Requirement<T extends Target<any>, P extends Path> {
	path: P;
	value: Pointer<T, P>;
}

type Requirements<T extends Target<any>> = Array<Requirement<T, any>>;

function getRequirements<T extends Target<any>>(t: T): Requirements<T> {
	const stack: Array<{ obj: Target<any>; path: Path }> = [{ obj: t, path: '' }];
	const result: Requirements<T> = [];

	while (stack.length > 0) {
		const { obj, path } = stack.pop()!;

		if (obj != null && !Array.isArray(obj) && typeof obj === 'object') {
			for (const key of Object.keys(obj)) {
				const value = obj[key];
				const newPath = `${path}/${key}`;
				stack.push({ obj: value, path: newPath });
			}
		} else {
			result.push({ path, value: obj });
		}
	}

	return result;
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

function of<S>(src: S, tgt: Target<S>): Diff<S> {
	const requirements = getRequirements(tgt);
	const target = applyPatch(src, tgt);

	return Object.assign(
		(s: S) => {
			const ops = [] as Array<Operation<S, any>>;
			for (const p of requirements) {
				const value = Pointer.of(s, p.path);

				if (p.value === DELETED && value != null) {
					ops.push({
						op: 'delete',
						path: p.path,
					});
				} else if (p.value !== DELETED) {
					if (value == null) {
						ops.push({
							op: 'create',
							path: p.path,
							value: p.value as any,
						});
					} else if (value !== p.value) {
						ops.push({
							op: 'update',
							path: p.path,
							value: p.value as any,
						});
					}
				}
			}
			return ops;
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
