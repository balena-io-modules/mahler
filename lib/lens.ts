import assert from './assert';
import type { Identity } from './identity';
import { isArrayIndex } from './is-array-index';
import type { PathType } from './path';
import { Path } from './path';
import { InvalidPointer, Pointer } from './pointer';

export type Lens<TState, TPath extends PathType> = LensContext<
	TState,
	TPath
>['target'];

export type LensContext<TState, TPath extends PathType> = LensWithSlash<
	TState,
	TPath,
	object
>;

/**
 * The arguments from the lens
 */
export type LensArgs<TState, TPath extends PathType> = Omit<
	LensContext<TState, TPath>,
	'target' | 'path'
>;

// A lens to evaluate paths starting with a slash
type LensWithSlash<
	TChildState,
	TPath extends PathType,
	TProps extends NonNullable<unknown>,
> = TPath extends `/${infer TTail}`
	? LensWithoutSlash<TChildState, TPath, TTail, TProps> // If the path starts with a slash, evaluate the remaining part of the path
	: TProps & {
			path: Path<TPath>;
			target: unknown;
		}; // Otherwise, the path is invalid

// A lens to evaluate paths that start without a slash, e.g. `key1/key2` or `key`
type LensWithoutSlash<
	TChildState,
	TPath extends PathType,
	TSubPath extends PathType,
	TProps extends NonNullable<unknown>,
> = TSubPath extends `${infer THead}/${infer TTail}`
	? LensOnCompoundPathWithParameter<TChildState, TPath, THead, TTail, TProps> // If the path is compound, evaluate it recursively
	: LensOnSinglePathWithParameter<TChildState, TPath, TSubPath, TProps>; // Otherwise extract the type from the single path if possible

// The lens for an operation on a single path, e.g. `:param` or `key`
type LensOnSinglePathWithParameter<
	TChildState,
	TPath extends PathType,
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
	TPath extends PathType,
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
	TPath extends PathType,
	TProps extends NonNullable<unknown>,
> = Identity<
	TProps & {
		path: Path<TPath>;
		target: TChildState;
	}
>;

// Utility type to check if the key is a parameter
type LensOnCompoundPathWithParameter<
	TChildState,
	TPath extends PathType,
	THead extends string,
	TTail extends PathType,
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
	TPath extends PathType,
	THead,
	TTail extends PathType,
	TProps extends NonNullable<unknown>,
> = THead extends keyof TChildState
	? LensWithoutSlash<TChildState[THead], TPath, TTail, TProps>
	: LensOnArray<TChildState, TPath, THead, TTail, TProps>; // If H is not a key of the object, it may be that is a number, so check if S is an array

// The type of a lens on a path referencing an array, where the first part of the path is a valid index on the array
type LensOnArray<
	TChildState,
	TPath extends PathType,
	THead,
	TTail extends PathType,
	TProps extends NonNullable<unknown>,
> =
	TChildState extends Array<infer U> // If the object of type S is an array
		? THead extends `${number}` // and the key is a number
			? LensWithoutSlash<U, TPath, TTail, TProps>
			: never
		: never;

function params(template: Path, path: Path) {
	const templateParts = Path.split(template);
	const parts = Path.split(path);

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

function context<TState, TPath extends PathType>(
	lens: Path<TPath>,
	path: Path,
	target: Lens<TState, TPath>,
): LensContext<TState, TPath> {
	const lensPath = Path.from(lens);
	// Get route parameters
	const args = params(lensPath, path);

	return {
		...(args as any),
		target,
		path,
	};
}

function createLens<TState, TPath extends PathType>(
	s: TState,
	p: Path<TPath>,
): Lens<TState, TPath> | undefined {
	try {
		return Pointer.from(s, p) as Lens<TState, TPath>;
	} catch (e) {
		// The lens is a bit more permissive than pointer as a task
		// may be relevant to a path on the state that is yet to be created
		if (e instanceof InvalidPointer) {
			return undefined;
		}
		throw e;
	}
}

/**
 * Test if a lens given as first argument starts
 * with the path given as second argument
 */
function startsWith<TPath extends PathType>(
	lens: Path<TPath>,
	path: Path,
): boolean {
	const pathParts = Path.split(path);
	const lensParts = Path.split(lens);

	// There will never be a match in this case
	// no point in searching
	if (lensParts.length < pathParts.length) {
		return false;
	}

	// Find the starting context comparing the
	// initial path with the lens
	for (const k of pathParts) {
		// We know the key cannot be undefined because
		// of the length comparison before
		const key = lensParts.shift()!;

		// If the keys don't match terminate the search
		if (!key.startsWith(':') && k !== key) {
			return false;
		}
	}
	return true;
}

/**
 * Find all elements of the given state object that match
 * the lens, starting at `initialPath`
 *
 * This function never throws, if the lens does not
 * start with the initial path or there are no matches
 * the function will return an empty array
 */
function findAll<
	TState,
	TPath extends PathType,
	TStartPath extends PathType = '/',
>(
	state: TState,
	lens: Path<TPath>,
	initialPath: Path<TStartPath> = Path.from('/') as Path<TStartPath>,
): Path[] {
	const initialParts = Path.split(initialPath);
	const lensParts = Path.split(lens);

	// There will never be a match in this case
	// no point in searching
	if (lensParts.length < initialParts.length) {
		return [];
	}

	let initialTarget: any = state;
	// Find the starting context comparing the
	// initial path with the lens
	for (const k of initialParts) {
		// No point in continuing the search in this case
		if (initialTarget == null || typeof initialTarget !== 'object') {
			return [];
		}

		// We know the key cannot be undefined because
		// of the length comparison before
		const key = lensParts.shift()!;

		// If the key starts with `:` we continue searching
		if (!key.startsWith(':') && (k !== key || !(k in initialTarget))) {
			// The initial path does not match the lens or
			// the state
			return [];
		}
		initialTarget = initialTarget[k];
	}

	let contextList: Array<LensContext<TState, Path>> = [
		{ target: initialTarget, path: initialPath },
	];

	for (const key of lensParts) {
		contextList = contextList.flatMap(({ target, path }) => {
			// This is not a valid search path so we ignore it
			if (target == null || typeof target !== 'object') {
				return [];
			}

			if (key.startsWith(':')) {
				// If the key is a varible, we need to add all sub elements
				// of the current object
				return Object.entries(target).map(([k, v]) => ({
					target: v,
					path: Path.join(path, k),
				}));
			} else if (key in target) {
				// Otherwise just return the subelement of
				// the current object
				return [
					{
						target: (target as any)[key],
						path: Path.join(path, key),
					},
				];
			} else {
				return [];
			}
		});
	}

	return contextList.map(({ path }) => path);
}

export const Lens = {
	context,
	args: params,
	from: createLens,
	findAll,
	startsWith,
};
