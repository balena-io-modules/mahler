import { Ref } from '../ref';
import { Observer } from '../observable';
import { Operation } from '../operation';
import { View } from '../view';

function isObject(value: unknown): value is object {
	return value !== null && typeof value === 'object';
}

function observeObject<T, U extends object>(
	r: Ref<T>,
	u: U,
	observer: Observer<Operation<T, any>>,
	parentPath = '',
): U {
	if (!Array.isArray(u)) {
		u = (Object.getOwnPropertyNames(u) as Array<keyof U>).reduce((acc, key) => {
			const v = u[key];
			if (isObject(v)) {
				const path =
					parentPath === '' && key === '_'
						? ''
						: `${parentPath}/${String(key)}`;
				return {
					...acc,
					[key]: observeObject(r, v, observer, path),
				};
			}
			return { ...acc, [key]: v };
		}, {} as U);
	} else {
		u = u.map((v, i) => {
			if (isObject(v)) {
				const path = `${parentPath}/${i}`;
				return observeObject(r, v, observer, path);
			}
			return v;
		}) as U;
	}

	return new Proxy(u, {
		set(target, prop, value) {
			const res = Reflect.set(target, prop, value);
			if (
				res &&
				// If the object is an array do not notify on length changes
				(!Array.isArray(target) || (Array.isArray(target) && prop !== 'length'))
			) {
				const path =
					parentPath === '' && prop === '_'
						? ''
						: `${parentPath}/${String(prop)}`;
				const op = prop in target ? 'update' : 'create';

				observer.next({ op, path, target: value });
			}
			return res;
		},
		deleteProperty(target, prop) {
			const res = Reflect.deleteProperty(target, prop);
			if (res) {
				const changePath =
					parentPath === '' && prop === '_'
						? ''
						: `${parentPath}/${String(prop)}`;
				observer.next({ op: 'delete', path: changePath });
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
		return fn(
			observeObject(r, r, {
				next: (change) => {
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
					observer.next(structuredClone(r._));
				},
				error: () => void 0,
				complete: () => void 0,
			}),
		);
	};
}
