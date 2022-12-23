export type Path = string;
export type Operation = 'create' | 'update' | 'delete';

/**
 * A Context type provides information about a desired change on a path
 *
 * The properties of a context object are the following
 *
 * @property op - The operation taking place
 * @property target - The target value of the referenced element (TODO: this probably should be undefined if the operation is `remove`)
 * @property params - If route parameters are given in the path, e.g. /people/:name/location, then this property includes the relevant values for the operation. e.g. if the change is in `/people/alice/location`, the params.name will have the value 'alice'
 * @property get - A function that returns the value of the referenced element on the state
 * @property set - A funciton that allows to modify the referenced element in a state object
 *
 * The functions `get` and `set` make the contet a functional lens, which by definition follows the following laws:
 *
 *  get(set(a)(s)) = a
 *  set(s, get(s)) = s
 *  set(set(s, a), a) = set(s,a)
 */
export type Context<S, P extends Path> = ContextWithSlash<S, S, P, {}>;

// A context to evaluate paths starting with a slash
type ContextWithSlash<
	O,
	S,
	P extends Path,
	A extends {},
> = P extends `/${infer R}`
	? ContextWithoutSlash<O, S, R, A> // If the path starts with a slash, evaluate the remaining part of the path
	: never; // Otherwise, the path is invalid

// A context to evaluate paths that start without a slash, e.g. `key1/key2` or `key`
type ContextWithoutSlash<
	O,
	S,
	P extends Path,
	A extends {},
> = P extends `${infer H}/${infer T}`
	? ContextOnCompoundPathWithParameter<O, S, H, T, A> // If the path is compound, evaluate it recursively
	: ContextOnSinglePathWithParameter<O, S, P, A>; // Otherwise extract the type from the single path if possible

// The context for an operation on a single path, e.g. `:param` or `key`
type ContextOnSinglePathWithParameter<
	O,
	S,
	K extends string,
	A extends {},
> = K extends `:${infer Arg}`
	? S extends Array<infer _>
		? ContextOnSinglePath<O, S, number, A & { [key in Arg]: number }>
		: ContextOnSinglePath<O, S, keyof S, A & { [key in Arg]: keyof S }>
	: ContextOnSinglePath<O, S, K, A>;

// A context on a single path, e.g. 'key'. In this case, the path is either a valid key for the object
// or else it has to be an empty path '' in order to be valid
type ContextOnSinglePath<O, S, K, A extends {}> = K extends keyof S // If the key is a valid key on the object of type S
	? ContextOnEmptyPath<O, S[K], '', A> // Then evaluate the empty path
	: ContextOnEmptyPath<O, S, K, A>; // Otherwise, check if the path is already empty

// The type of a change for an empty path, where the key is an empty string
type ContextOnEmptyPath<O, S, K, A extends {}> = K extends ''
	? keyof A extends never // If A has no keys, then this will hold true. In that case, do not add params
		? {
				op: Operation;
				path: Path;
				target: S;
				get(state: O): S;
				set(state: O, value: S): O;
		  }
		: {
				op: Operation;
				path: Path;
				target: S;
				params: A;
				get(state: O): S;
				set(state: O, value: S): O;
		  } // If the key is an empty string, then the type is S
	: never; // Otherwise, the type is invalid

// Utility type to check if the key is a parameter
type ContextOnCompoundPathWithParameter<
	O,
	S,
	H extends string,
	T extends Path,
	A extends {},
> = H extends `:${infer Arg}` // Check if the key is a route parameters first
	? S extends Array<infer U> // Immediately check if the object is an array, in which case continue the evaluation o the tail
		? ContextWithoutSlash<O, U, T, A & { [K in Arg]: number }>
		: ContextOnCompoundPath<O, S, keyof S, T, A & { [K in Arg]: keyof S }> // This is a compound path with a parameter. Add the key and continue evaluating
	: ContextOnCompoundPath<O, S, H, T, A>;

// A compound path without parameters
type ContextOnCompoundPath<
	O,
	S,
	H,
	T extends Path,
	A extends {},
> = H extends keyof S
	? ContextWithoutSlash<O, S[H], T, A>
	: ContextOnArray<O, S, H, T, A>; // If H is not a key of the object, it may be that is a number, so check if S is an array

// The type of a context on a path referencing an array, where the first part of the path is a valid index on the array
type ContextOnArray<O, S, H, T extends Path, A extends {}> = S extends Array<
	infer U
> // If the object of type S is an array
	? H extends `${infer _ extends number}` // and the key is a number
		? ContextWithoutSlash<O, U, T, A>
		: never
	: never;
