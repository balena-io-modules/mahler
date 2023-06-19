import { Path } from '../path';
import { Op } from '../operation';

export type TaskOp = Op | '*';

// Utility type to normalize intersections
export type Identity<T> = T extends object
	? {} & {
			[P in keyof T]: T[P];
	  }
	: T;

// A context to evaluate paths starting with a slash
export type ContextWithSlash<
	O,
	S,
	TPath extends Path,
	TProps extends {},
	TOp extends TaskOp,
> = TPath extends `/${infer R}`
	? ContextWithoutSlash<O, S, R, TProps, TOp> // If the path starts with a slash, evaluate the remaining part of the path
	: never; // Otherwise, the path is invalid

// A context to evaluate paths that start without a slash, e.g. `key1/key2` or `key`
type ContextWithoutSlash<
	O,
	S,
	TPath extends Path,
	TProps extends {},
	TOp extends TaskOp,
> = TPath extends `${infer H}/${infer T}`
	? ContextOnCompoundPathWithParameter<O, S, H, T, TProps, TOp> // If the path is compound, evaluate it recursively
	: ContextOnSinglePathWithParameter<O, S, TPath, TProps, TOp>; // Otherwise extract the type from the single path if possible

// The context for an operation on a single path, e.g. `:param` or `key`
type ContextOnSinglePathWithParameter<
	O,
	S,
	K extends string,
	TProps extends {},
	TOp extends TaskOp,
> = K extends `:${infer Arg}`
	? S extends Array<infer _>
		? ContextOnSinglePath<O, S, number, TProps & { [key in Arg]: number }, TOp>
		: ContextOnSinglePath<
				O,
				S,
				keyof S,
				TProps & { [key in Arg]: keyof S },
				TOp
		  >
	: ContextOnSinglePath<O, S, K, TProps, TOp>;

// A context on a single path, e.g. 'key'. In this case, the path is either a valid key for the object
// or else it has to be an empty path '' in order to be valid
type ContextOnSinglePath<
	O,
	S,
	K,
	TProps extends {},
	TOp extends TaskOp,
> = K extends keyof S // If the key is a valid key on the object of type S
	? ContextOnEmptyPath<O, S[K], '', TProps, TOp> // Then evaluate the empty path
	: ContextOnEmptyPath<O, S, K, TProps, TOp>; // Otherwise, check if the path is already empty

// The type of a change for an empty path, where the key is an empty string
type ContextOnEmptyPath<
	O,
	S,
	K,
	TProps extends {},
	TOp extends TaskOp,
> = K extends ''
	? keyof TProps extends never // If A has no keys, then this will hold true. In that case, do not add params
		? TOp extends '*' | 'delete'
			? {
					get(state: O): S;
					set(state: O, value: S): O;
					del(state: O): O;
			  }
			: {
					target: S;
					get(state: O): S;
					set(state: O, value: S): O;
					del(state: O): O;
			  }
		: TOp extends '*' | 'delete'
		? Identity<
				TProps & {
					get(state: O): S;
					set(state: O, value: S): O;
					del(state: O): O;
				}
		  >
		: Identity<
				TProps & {
					target: S;
					get(state: O): S;
					set(state: O, value: S): O;
					del(state: O): O;
				}
		  >
	: // If the key is an empty string, then the type is S
	  never; // Otherwise, the type is invalid

// Utility type to check if the key is a parameter
type ContextOnCompoundPathWithParameter<
	O,
	S,
	H extends string,
	TPath extends Path,
	TProps extends {},
	TOp extends TaskOp,
> = H extends `:${infer Arg}` // Check if the key is a route parameters first
	? S extends Array<infer U> // Immediately check if the object is an array, in which case continue the evaluation o the tail
		? ContextWithoutSlash<O, U, TPath, TProps & { [K in Arg]: number }, TOp>
		: ContextOnCompoundPath<
				O,
				S,
				keyof S,
				TPath,
				TProps & { [K in Arg]: keyof S },
				TOp
		  > // This is a compound path with a parameter. Add the key and continue evaluating
	: ContextOnCompoundPath<O, S, H, TPath, TProps, TOp>;

// A compound path without parameters
type ContextOnCompoundPath<
	O,
	S,
	H,
	TPath extends Path,
	TProps extends {},
	TOp extends TaskOp,
> = H extends keyof S
	? ContextWithoutSlash<O, S[H], TPath, TProps, TOp>
	: ContextOnArray<O, S, H, TPath, TProps, TOp>; // If H is not a key of the object, it may be that is a number, so check if S is an array

// The type of a context on a path referencing an array, where the first part of the path is a valid index on the array
type ContextOnArray<
	O,
	S,
	H,
	TPath extends Path,
	TProps extends {},
	TOp extends TaskOp,
> = S extends Array<infer U> // If the object of type S is an array
	? H extends `${infer _ extends number}` // and the key is a number
		? ContextWithoutSlash<O, U, TPath, TProps, TOp>
		: never
	: never;
