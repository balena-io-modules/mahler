import { Operation } from './operation';
import { Pointer } from './pointer';
import { Path } from './path';

export const DELETED: unique symbol = Symbol();
export type DELETED = typeof DELETED;

type IsOptional<S extends object, K extends keyof S> = Omit<S, K> extends S
	? true
	: false;

export type Target<S> = S extends any[] | ((...args: any) => any)
	? S
	: S extends object
	? {
			[P in keyof S]?: IsOptional<S, P> extends true
				? // Only optional properties can be deleted
				  Target<S[P]> | DELETED
				: Target<S[P]>;
	  }
	: S;

/**
 * A diff is a set of operations that can be applied to an object
 * to transform it into a new object that matches a given target
 */
export interface Diff<S> {
	/**
	 * Modify a source object by applying the changes set by the target
	 */
	patch(s: S): S;

	/**
	 * Return the list of operations that would be applied to a source.
	 * If the array is empty, that means the object has reached the target.
	 */
	operations(t: S): Array<Operation<S>>;
}

interface Goal<S, P extends Path> {
	path: P;
	value: Pointer<S, P> | DELETED;
}

function goals<S>(t: Target<S>, parent = '' as Path): Array<Goal<S, any>> {
	if (t != null && !Array.isArray(t) && typeof t === 'object') {
		return Object.keys(t).flatMap((key) =>
			goals((t as any)[key], `${parent}/${key}`),
		);
	}

	return [{ path: parent, value: t as any }];
}

function patch<S>(s: S, t: Target<S>): S {
	if (t != null && !Array.isArray(t) && typeof t === 'object') {
		const result = { ...s } as any;
		for (const [key, value] of Object.entries(t)) {
			if (value === DELETED) {
				delete result[key];
			} else {
				result[key] = patch(result[key], value);
			}
		}
		return result;
	}

	return t as S;
}

function of<S>(t: Target<S>): Diff<S> {
	const goalList = goals(t);

	return {
		patch(s) {
			return patch(s, t);
		},

		operations(s) {
			const ops = [] as Array<Operation<S, any>>;
			for (const goal of goalList) {
				const value = Pointer.of(s, goal.path);

				if (value == null) {
					ops.push({
						op: 'create',
						path: goal.path,
						value: goal.value as any,
					});
				} else if (goal.value === DELETED) {
					ops.push({
						op: 'delete',
						path: goal.path,
					});
				} else if (value !== goal.value) {
					ops.push({
						op: 'update',
						path: goal.path,
						value: goal.value as any,
					});
				}
			}
			return ops;
		},
	};
}

export const Diff = {
	of,
};
