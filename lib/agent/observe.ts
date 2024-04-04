import type { Ref } from '../ref';
import type { Observer, Next } from '../observable';
import type { Operation } from '../operation';
import { View } from '../view';
import { Path } from '../path';

function isObject(value: unknown): value is object {
	return value !== null && typeof value === 'object';
}

function appendToPath(key: string | number | symbol, path: string[]) {
	return key === '_' && path.length === 0 ? path : path.concat(String(key));
}

function buildProxy<T, U extends object>(
	r: Ref<T>,
	u: U,
	next: Next<Operation<T, string>>,
	path = [] as string[],
): U {
	return new Proxy(u, {
		set(target, prop, value) {
			const childPath = appendToPath(prop, path);
			const existsBefore = prop in target;
			const valueBefore = (target as any)[prop];

			let valueProxy = value;
			if (value != null && typeof value === 'object') {
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
						source: valueBefore,
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
	next: Next<Operation<T, string>>,
	path = [] as string[],
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
	next: Next<Operation<T, string>>,
	path = [] as string[],
): U {
	if (Array.isArray(u)) {
		return observeArray(r, u, next, path);
	}
	// Recursively observe existing properties of the object
	u = (Object.getOwnPropertyNames(u) as Array<keyof U>).reduce((acc, key) => {
		const v = u[key];
		if (isObject(v)) {
			return {
				...acc,
				[key]: observeObject(r, v, next, appendToPath(key, path)),
			};
		}
		return { ...acc, [key]: v };
	}, {} as U);

	return buildProxy(r, u, next, path);
}

function applyChanges<S>(r: Ref<S>, changes: Array<Operation<S, string>>) {
	changes.forEach((change) => {
		const view = View.from(r, change.path);
		switch (change.op) {
			case 'create':
			case 'update':
				view._ = change.target as any;
				break;
			case 'delete':
				view.delete();
				break;
		}
	});
}

/**
 * Communicates the changes performed by a function on a value
 * reference to an observer. The function is executed in a
 * transactional context, meaning that if it throws an error
 * or returns a rejected promise, the changes will be rolled back.
 *
 * @param fn The function to execute
 * @param observer The observer to notify of changes
 * @returns an intrumented function
 */
export function observe<T, U = void>(
	fn: (r: Ref<T>) => U,
	observer: Observer<T>,
): (r: Ref<T>) => U {
	return function (r: Ref<T>) {
		const orig = structuredClone(r._);
		function rollback() {
			// Restore the original value
			r._ = orig;

			// We need to notify the observer of the last state
			observer.next(orig);
		}

		try {
			const res = fn(
				observeObject(r, r, (change) => {
					applyChanges(r, [change]);
					observer.next(structuredClone(r._));
				}),
			);

			// Catch error in async function calls
			if (res instanceof Promise) {
				return res.catch((e) => {
					rollback();
					throw e;
				}) as U;
			}

			return res;
		} catch (e) {
			// Catch errors in sync function calls
			rollback();
			throw e;
		}
	};
}
