import { Ref } from '../ref';
import { Observer } from '../observable';
import { Operation } from '../operation';
import { View } from '../view';
import { Path } from '../path';

function isObject(value: unknown): value is object {
	return value !== null && typeof value === 'object';
}

function observeObject<T, U extends object>(
	r: Ref<T>,
	u: U,
	observer: Observer<Operation<T, any>>,
	reverseChanges = [] as Array<Operation<T, any>>,
	parentPath = [] as string[],
): U {
	if (!Array.isArray(u)) {
		u = (Object.getOwnPropertyNames(u) as Array<keyof U>).reduce((acc, key) => {
			const v = u[key];
			if (isObject(v)) {
				const path = parentPath.concat(key === '_' ? [] : String(key));
				return {
					...acc,
					[key]: observeObject(r, v, observer, reverseChanges, path),
				};
			}
			return { ...acc, [key]: v };
		}, {} as U);
	} else {
		u = u.map((v, i) => {
			if (isObject(v)) {
				const path = parentPath.concat(String(i));
				return observeObject(r, v, observer, reverseChanges, path);
			}
			return v;
		}) as U;
	}

	return new Proxy(u, {
		set(target, prop, value) {
			const valueBefore = (target as any)[prop];
			const res = Reflect.set(target, prop, value);
			if (
				res &&
				// If the object is an array do not notify on length changes
				(!Array.isArray(target) || (Array.isArray(target) && prop !== 'length'))
			) {
				const path = Path.from(
					prop === '_' ? [] : parentPath.concat(String(prop)),
				);

				if (prop in target) {
					if (Array.isArray(target)) {
						// Operations on arrays are additive, so the inverse of
						// update is delete
						reverseChanges.push({
							op: 'delete',
							path,
						});
					} else {
						reverseChanges.push({
							op: 'update',
							path,
							source: structuredClone(value),
							target: valueBefore,
						});
					}

					observer.next({
						op: 'update',
						path,
						source: valueBefore,
						target: value,
					});
				} else {
					reverseChanges.push({ op: 'delete', path });
					observer.next({
						op: 'create',
						path,
						target: value,
					});
				}
			}
			return res;
		},
		deleteProperty(target, prop) {
			const valueBefore = (target as any)[prop];
			const res = Reflect.deleteProperty(target, prop);
			if (res) {
				const changePath = Path.from(
					prop === '_' ? [] : parentPath.concat(String(prop)),
				);
				reverseChanges.push({
					op: 'create',
					path: changePath,
					target: valueBefore,
				});
				observer.next({ op: 'delete', path: changePath });
			}
			return res;
		},
	});
}

function applyChanges<S>(r: Ref<S>, changes: Array<Operation<S, any>>) {
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
		const reverseChanges: Array<Operation<T, any>> = [];

		function rollback() {
			// We need to reverse the array as changes are added using Array.push
			applyChanges(r, reverseChanges.reverse());

			// We need to notify the observer of the last state
			observer.next(structuredClone(r._));
		}

		try {
			const res = fn(
				observeObject(
					r,
					r,
					{
						next: (change) => {
							applyChanges(r, [change]);
							observer.next(structuredClone(r._));
						},
						error: () => void 0,
						complete: () => void 0,
					},
					reverseChanges,
				),
			);

			if (res instanceof Promise) {
				return res.catch((e) => {
					rollback();
					throw e;
				}) as U;
			}

			return res;
		} catch (e) {
			rollback();
			throw e;
		}
	};
}
