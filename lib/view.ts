import { isArrayIndex } from './is-array-index';
import { Path, PathType, Root } from './path';
import { InvalidPointer } from './pointer';
import { Ref } from './ref';
import { Lens } from './lens';
import { AnyOp, Create, Update } from './operation';

export interface View<
	TState,
	TPath extends PathType = Root,
	TOp extends AnyOp = Update,
> extends Ref<
		TOp extends Create ? Lens<TState, TPath> | undefined : Lens<TState, TPath>
	> {
	delete(): void;
}

/**
 * Returns a view builder function from a given path
 */
function createView<TState, TPath extends PathType>(
	ref: Ref<TState>,
	path: Path<TPath>,
): View<TState, TPath> {
	const parts = Path.split(path);

	// Save the last element of the path so we can delete it
	const last = parts.pop();

	const obj = ref._;
	let parent = obj as any;
	for (const p of parts) {
		if (!Array.isArray(parent) && typeof parent !== 'object') {
			throw new InvalidPointer(path, obj);
		}

		if (Array.isArray(parent) && !isArrayIndex(p)) {
			throw new InvalidPointer(path, obj);
		}

		if (!(p in parent)) {
			// Cannot create a view if the path does not exist
			throw new InvalidPointer(path, obj);
		}
		parent = parent[p];
	}

	let pointer = parent;
	if (last != null) {
		if (!Array.isArray(parent) && typeof parent !== 'object') {
			throw new InvalidPointer(path, obj);
		}

		if (Array.isArray(parent) && !isArrayIndex(last)) {
			throw new InvalidPointer(path, obj);
		}
		pointer = parent[last];
	}

	const view = {
		_: pointer,
		delete() {
			if (last != null) {
				if (Array.isArray(parent)) {
					parent.splice(+last, 1);
				} else {
					delete parent[last];
				}
			}
		},
	};

	function update() {
		if (last != null) {
			if (Array.isArray(parent)) {
				parent.splice(+last, 1, view._);
			} else {
				parent[last] = view._;
			}
		} else {
			ref._ = view._;
		}
	}

	// We return a proxy so changes to the view._ value change
	// the parent's value
	return new Proxy(view, {
		set(target, prop, value) {
			const res = Reflect.set(target, prop, value);
			if (res) {
				update();
			}
			return res;
		},
	});
}
export const View = {
	from: createView,
};
