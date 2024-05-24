import { Ref } from '../ref';
import type { Operation } from '../operation';
import { View } from '../view';
import type { Path } from '../path';

export function patch<S>(
	r: Ref<S>,
	changes: Operation<S, Path> | Array<Operation<S, Path>>,
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

export type Patcher<S> = (
	changes: Operation<S, Path> | Array<Operation<S, Path>>,
) => void;

export function Patcher<S>(s: S): Patcher<S> {
	const r = Ref.of(s);
	return (changes: Operation<S, Path> | Array<Operation<S, Path>>) =>
		patch(r, changes);
}
