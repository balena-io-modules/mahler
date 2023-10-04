import { Ref } from '../ref';
import { Observer } from '../observable';

function isObject(value: unknown): value is object {
	return value !== null && typeof value === 'object';
}

function observeObject<T, U extends object>(
	r: Ref<T>,
	u: U,
	observer: Observer<T>,
): U {
	if (!Array.isArray(u)) {
		const keys = Object.getOwnPropertyNames(u) as Array<keyof U>;
		for (const key of keys) {
			const v = u[key];
			if (isObject(v)) {
				u[key] = observeObject(r, v, observer);
			}
		}
	}

	return new Proxy(u, {
		set(target, prop, value) {
			const res = Reflect.set(target, prop, value);
			if (
				res &&
				// If the object is an array do not notify on length changes
				(!Array.isArray(target) || (Array.isArray(target) && prop !== 'length'))
			) {
				observer.next(r._);
			}
			return res;
		},
		deleteProperty(target, prop) {
			const res = Reflect.deleteProperty(target, prop);
			if (res) {
				observer.next(r._);
			}
			return res;
		},
	});
}

export function observe<T, U = void>(
	fn: (r: Ref<T>) => U,
	observer: Observer<T>,
): (r: Ref<T>) => U {
	return function (r: Ref<T>) {
		return fn(observeObject(r, r, observer));
	};
}
