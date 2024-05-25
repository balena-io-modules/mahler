import { Ref } from '../ref';
import type { Operation } from '../operation';
import { View } from '../view';

export function applyPatch<S>(
	r: Ref<S>,
	changes: Operation<S> | Array<Operation<S>>,
) {
	changes = Array.isArray(changes) ? changes : [changes];
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

export function patch<S>(s: S, changes: Operation<S> | Array<Operation<S>>) {
	const r = Ref.of(structuredClone(s));
	applyPatch(r, changes);
	return r._;
}
