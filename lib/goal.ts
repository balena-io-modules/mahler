// NOTE: this type returns exactly what is passed in, but
// in the future we want to support predicate goals, i.e. some
// way to specify a condition different than `equals` for an
// element of the state
export type Goal<T> = T extends object
	? {
			[P in keyof T]: Goal<T[P]>;
	  }
	: T;
