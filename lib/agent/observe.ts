import type { Ref } from '../ref';
import type { Observer, Next } from '../observable';
import type { Operation } from '../operation';
import { Path } from '../path';
import { applyPatch } from './patch';

function isObject(value: unknown): value is object {
	return value !== null && typeof value === 'object';
}

function appendToPath(key: string | number | symbol, path: string[]) {
	return key === '_' && path.length === 0 ? path : path.concat(String(key));
}

function buildProxy<T, U extends object>(
	r: Ref<T>,
	u: U,
	next: Next<Operation<T>>,
	path: string[] = [],
): U {
	return new Proxy(u, {
		set(target, prop, value) {
			const childPath = appendToPath(prop, path);
			const existsBefore = prop in target;

			let valueProxy = value;
			if (isObject(value)) {
				// If we are re-assigning a key with a new object we need to
				// observe that object too. We pass an empty array to changes as we don't want
				// to reverse those changes
				valueProxy = observeObject(r, value, next, childPath);
			}

			const res = Reflect.set(target, prop, valueProxy);

			// Do not notify on array length changes
			if (res) {
				if (Array.isArray(target) && prop === 'length') {
					return res;
				}

				if (existsBefore) {
					// Notify the observer
					next({
						op: 'update',
						path: Path.from(childPath),
						target: value,
					});
				} else {
					next({
						op: 'create',
						path: Path.from(childPath),
						target: value,
					});
				}
			}
			return res;
		},
		deleteProperty(target, prop) {
			const res = Reflect.deleteProperty(target, prop);
			if (res) {
				const childPath = appendToPath(prop, path);
				next({ op: 'delete', path: Path.from(childPath) });
			}
			return res;
		},
	});
}

function observeArray<T, U extends any[]>(
	r: Ref<T>,
	u: U,
	next: Next<Operation<T>>,
	path: string[] = [],
): U {
	u = u.map((v, i) => {
		if (isObject(v)) {
			const newPath = path.concat(String(i));
			return observeObject(r, v, next, newPath);
		}
		return v;
	}) as U;

	return buildProxy(r, u, next, path);
}

function observeObject<T, U extends object>(
	r: Ref<T>,
	u: U,
	next: Next<Operation<T>>,
	path: string[] = [],
): U {
	if (Array.isArray(u)) {
		return observeArray(r, u, next, path);
	}

	// Recursively observe existing properties of the object
	u = Object.fromEntries(
		(Object.getOwnPropertyNames(u) as Array<keyof U>).map((key) => {
			const v = u[key];
			if (isObject(v)) {
				return [key, observeObject(r, v, next, appendToPath(key, path))];
			}
			return [key, v];
		}),
	) as U;

	return buildProxy(r, u, next, path);
}

/**
 * Communicates the changes performed by a function on an object
 * reference to an observer.
 *
 * @param fn The function to execute
 * @param observer The observer to notify of changes
 * @returns an intrumented function
 */
export function observe<S, U = void>(
	fn: (r: Ref<S>) => U,
	observer: Observer<Operation<S>>,
): (r: Ref<S>) => U {
	return function (ref: Ref<S>) {
		return fn(
			observeObject(ref, ref, (change) => {
				applyPatch(ref, change);

				observer.next(change);
			}),
		);
	};
}
