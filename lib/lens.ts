import assert from './assert';
import { Identity } from './identity';
import { Path } from './path';
import { Pointer, InvalidPointer } from './pointer';
import { Ref } from './ref';

export type Lens<TState, TPath extends Path> = LensContext<
	TState,
	TPath
>['target'];

export type LensContext<TState, TPath extends Path> = LensWithSlash<
	TState,
	TPath,
	object
>;

// A lens to evaluate paths starting with a slash
type LensWithSlash<
	TChildState,
	TPath extends Path,
	TProps extends NonNullable<unknown>,
> = TPath extends `/${infer TTail}`
	? LensWithoutSlash<TChildState, TPath, TTail, TProps> // If the path starts with a slash, evaluate the remaining part of the path
	: never; // Otherwise, the path is invalid

// A lens to evaluate paths that start without a slash, e.g. `key1/key2` or `key`
type LensWithoutSlash<
	TChildState,
	TPath extends Path,
	TSubPath extends Path,
	TProps extends NonNullable<unknown>,
> = TSubPath extends `${infer THead}/${infer TTail}`
	? LensOnCompoundPathWithParameter<TChildState, TPath, THead, TTail, TProps> // If the path is compound, evaluate it recursively
	: LensOnSinglePathWithParameter<TChildState, TPath, TSubPath, TProps>; // Otherwise extract the type from the single path if possible

// The lens for an operation on a single path, e.g. `:param` or `key`
type LensOnSinglePathWithParameter<
	TChildState,
	TPath extends Path,
	TParam extends string,
	TProps extends NonNullable<unknown>,
> = TParam extends `:${infer Arg}`
	? TChildState extends any[]
		? LensOnSinglePath<
				TChildState,
				TPath,
				number,
				TProps & { [key in Arg]: number }
		  >
		: LensOnSinglePath<
				TChildState,
				TPath,
				keyof TChildState,
				TProps & { [key in Arg]: keyof TChildState }
		  >
	: LensOnSinglePath<TChildState, TPath, TParam, TProps>;

// A lens on a single path, e.g. 'key'. In this case, the path is either a valid key for the object
// or else it has to be an empty path '' in order to be valid
type LensOnSinglePath<
	TChildState,
	TPath extends Path,
	TKey,
	TProps extends NonNullable<unknown>,
> = TKey extends ''
	? LensOnEmptyPath<TChildState, TPath, TProps>
	: // If the key is a valid key on the object of type S
	TKey extends keyof TChildState
	? LensOnEmptyPath<TChildState[TKey], TPath, TProps> // Then evaluate the empty path
	: never; // If the key is not empty at this point, then the path is invalid

// The type of a change for an empty path, where the key is an empty string
type LensOnEmptyPath<
	TChildState,
	TPath extends Path,
	TProps extends NonNullable<unknown>,
> = Identity<
	TProps & {
		path: TPath;
		target: TChildState;
	}
>;

// Utility type to check if the key is a parameter
type LensOnCompoundPathWithParameter<
	TChildState,
	TPath extends Path,
	THead extends string,
	TTail extends Path,
	TProps extends NonNullable<unknown>,
> = THead extends `:${infer Arg}` // Check if the key is a route parameters first
	? TChildState extends Array<infer U> // Immediately check if the object is an array, in which case continue the evaluation o the tail
		? LensWithoutSlash<U, TPath, TTail, TProps & { [K in Arg]: number }>
		: LensOnCompoundPath<
				TChildState,
				TPath,
				keyof TChildState,
				TTail,
				TProps & { [K in Arg]: keyof TChildState }
		  > // This is a compound path with a parameter. Add the key and continue evaluating
	: LensOnCompoundPath<TChildState, TPath, THead, TTail, TProps>;

// A compound path without parameters
type LensOnCompoundPath<
	TChildState,
	TPath extends Path,
	THead,
	TTail extends Path,
	TProps extends NonNullable<unknown>,
> = THead extends keyof TChildState
	? LensWithoutSlash<TChildState[THead], TPath, TTail, TProps>
	: LensOnArray<TChildState, TPath, THead, TTail, TProps>; // If H is not a key of the object, it may be that is a number, so check if S is an array

// The type of a lens on a path referencing an array, where the first part of the path is a valid index on the array
type LensOnArray<
	TChildState,
	TPath extends Path,
	THead,
	TTail extends Path,
	TProps extends NonNullable<unknown>,
> = TChildState extends Array<infer U> // If the object of type S is an array
	? THead extends `${number}` // and the key is a number
		? LensWithoutSlash<U, TPath, TTail, TProps>
		: never
	: never;

export function isArrayIndex(x: unknown): x is number {
	return (
		x != null &&
		typeof x === 'string' &&
		!isNaN(+x) &&
		+x === parseInt(x, 10) &&
		+x >= 0
	);
}

function params(template: Path, path: Path) {
	const templateParts = Path.elems(template);
	const parts = Path.elems(path);

	assert(
		parts.length === templateParts.length,
		`Path '${path} should match its template '${template}'`,
	);

	const args = {} as { [k: string]: any };

	for (const templateElem of templateParts) {
		const pathElem = parts.shift();
		if (templateElem.startsWith(':')) {
			const key = templateElem.slice(1);
			// Convert the value to a number if it is an array index
			args[key] = isArrayIndex(pathElem) ? +pathElem : pathElem;
		} else {
			assert(
				templateElem === pathElem,
				`Path '${path} should match its template '${template}'`,
			);
		}
	}

	return args;
}

function context<TState, TPath extends Path>(
	lens: TPath,
	path: Path,
	target: Lens<TState, TPath>,
): LensContext<TState, TPath> {
	// Get route parameters
	const args = params(lens, path);

	return {
		...(args as any),
		target,
		path: path as TPath,
	};
}

function createLens<TState, TPath extends Path>(
	s: TState,
	p: TPath,
): Lens<TState, TPath> {
	return Pointer.of(s, p) as Lens<TState, TPath>;
}

export const Lens = {
	context,
	from: createLens,
};

export interface View<TState, TPath extends Path>
	extends Ref<Lens<TState, TPath>> {
	delete(): void;
}

/**
 * Returns a view builder function from a given path
 */
function createView<TState, TPath extends Path>(
	ref: Ref<TState>,
	path: TPath,
): View<TState, TPath> {
	Path.assert(path);
	const parts = Path.elems(path);

	// Save the last element of the path so we can delete it
	const last = parts.pop();

	const obj = ref._;
	let parent = obj as any;
	for (const p of parts) {
		if (!Array.isArray(parent) && typeof parent !== 'object') {
			throw new InvalidPointer(path, obj);
		}

		if (!(p in parent)) {
			// Cannot create a view if the path does not exist
			throw new InvalidPointer(path, obj);
		}
		parent = parent[p];
	}

	const pointer = last != null ? parent[last] : parent;

	const view = {
		_: pointer,
		update() {
			if (last != null) {
				if (Array.isArray(parent)) {
					parent.splice(+last, 1, view._);
				} else {
					parent[last] = view._;
				}
			} else {
				ref._ = view._;
			}
		},
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

	// We return a proxy so changes to the view._ value change
	// the parent's value
	return new Proxy(view, {
		set(target, prop, value) {
			const res = Reflect.set(target, prop, value);
			if (res) {
				view.update();
			}
			return res;
		},
	});
}

export const View = {
	from: createView,
};
