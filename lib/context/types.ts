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
	TState,
	TPath extends Path,
	TOp extends TaskOp,
	TChildState,
	TProps extends {},
> = TPath extends `/${infer TTail}`
	? ContextWithoutSlash<TState, TPath, TOp, TChildState, TTail, TProps> // If the path starts with a slash, evaluate the remaining part of the path
	: never; // Otherwise, the path is invalid

// A context to evaluate paths that start without a slash, e.g. `key1/key2` or `key`
type ContextWithoutSlash<
	TState,
	TPath extends Path,
	TOp extends TaskOp,
	TChildState,
	TSubPath extends Path,
	TProps extends {},
> = TSubPath extends `${infer THead}/${infer TTail}`
	? ContextOnCompoundPathWithParameter<
			TState,
			TPath,
			TOp,
			TChildState,
			THead,
			TTail,
			TProps
	  > // If the path is compound, evaluate it recursively
	: ContextOnSinglePathWithParameter<
			TState,
			TPath,
			TOp,
			TChildState,
			TSubPath,
			TProps
	  >; // Otherwise extract the type from the single path if possible

// The context for an operation on a single path, e.g. `:param` or `key`
type ContextOnSinglePathWithParameter<
	TState,
	TPath extends Path,
	TOp extends TaskOp,
	TChildState,
	TParam extends string,
	TProps extends {},
> = TParam extends `:${infer Arg}`
	? TChildState extends Array<infer _>
		? ContextOnSinglePath<
				TState,
				TPath,
				TOp,
				TChildState,
				number,
				TProps & { [key in Arg]: number }
		  >
		: ContextOnSinglePath<
				TState,
				TPath,
				TOp,
				TChildState,
				keyof TChildState,
				TProps & { [key in Arg]: keyof TChildState }
		  >
	: ContextOnSinglePath<TState, TPath, TOp, TChildState, TParam, TProps>;

// A context on a single path, e.g. 'key'. In this case, the path is either a valid key for the object
// or else it has to be an empty path '' in order to be valid
type ContextOnSinglePath<
	TState,
	TPath extends Path,
	TOp extends TaskOp,
	TChildState,
	TKey,
	TProps extends {},
> = TKey extends ''
	? ContextOnEmptyPath<TState, TPath, TOp, TChildState, TProps>
	: // If the key is a valid key on the object of type S
	TKey extends keyof TChildState
	? ContextOnEmptyPath<TState, TPath, TOp, TChildState[TKey], TProps> // Then evaluate the empty path
	: never; // If the key is not empty at this point, then the path is invalid

// The type of a change for an empty path, where the key is an empty string
type ContextOnEmptyPath<
	TState,
	TPath extends Path,
	TOp extends TaskOp,
	TChildState,
	TProps extends {},
> = keyof TProps extends never // If A has no keys, then this will hold true. In that case, do not add params
	? TOp extends '*' | 'delete'
		? {
				path: TPath;
				get(state: TState): TChildState;
				set(state: TState, value: TChildState): TState;
				del(state: TState): TState;
		  }
		: {
				path: TPath;
				target: TChildState;
				get(state: TState): TChildState;
				set(state: TState, value: TChildState): TState;
				del(state: TState): TState;
		  }
	: TOp extends '*' | 'delete'
	? Identity<
			TProps & {
				path: TPath;
				get(state: TState): TChildState;
				set(state: TState, value: TChildState): TState;
				del(state: TState): TState;
			}
	  >
	: Identity<
			TProps & {
				path: TPath;
				target: TChildState;
				get(state: TState): TChildState;
				set(state: TState, value: TChildState): TState;
				del(state: TState): TState;
			}
	  >;

// Utility type to check if the key is a parameter
type ContextOnCompoundPathWithParameter<
	TState,
	TPath extends Path,
	TOp extends TaskOp,
	TChildState,
	THead extends string,
	TTail extends Path,
	TProps extends {},
> = THead extends `:${infer Arg}` // Check if the key is a route parameters first
	? TChildState extends Array<infer U> // Immediately check if the object is an array, in which case continue the evaluation o the tail
		? ContextWithoutSlash<
				TState,
				TPath,
				TOp,
				U,
				TTail,
				TProps & { [K in Arg]: number }
		  >
		: ContextOnCompoundPath<
				TState,
				TPath,
				TOp,
				TChildState,
				keyof TChildState,
				TTail,
				TProps & { [K in Arg]: keyof TChildState }
		  > // This is a compound path with a parameter. Add the key and continue evaluating
	: ContextOnCompoundPath<
			TState,
			TPath,
			TOp,
			TChildState,
			THead,
			TTail,
			TProps
	  >;

// A compound path without parameters
type ContextOnCompoundPath<
	TState,
	TPath extends Path,
	TOp extends TaskOp,
	TChildState,
	THead,
	TTail extends Path,
	TProps extends {},
> = THead extends keyof TChildState
	? ContextWithoutSlash<TState, TPath, TOp, TChildState[THead], TTail, TProps>
	: ContextOnArray<TState, TPath, TOp, TChildState, THead, TTail, TProps>; // If H is not a key of the object, it may be that is a number, so check if S is an array

// The type of a context on a path referencing an array, where the first part of the path is a valid index on the array
type ContextOnArray<
	TState,
	TPath extends Path,
	TOp extends TaskOp,
	TChildState,
	THead,
	TTail extends Path,
	TProps extends {},
> = TChildState extends Array<infer U> // If the object of type S is an array
	? THead extends `${infer _ extends number}` // and the key is a number
		? ContextWithoutSlash<TState, TPath, TOp, U, TTail, TProps>
		: never
	: never;
