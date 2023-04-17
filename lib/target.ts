export const DELETED: unique symbol = Symbol();
export type DELETED = typeof DELETED;

type IsOptional<S extends object, K extends keyof S> = Omit<S, K> extends S
	? true
	: false;

export type Target<S> = S extends any[] | ((...args: any) => any)
	? S
	: S extends object
	? {
			[P in keyof S]?: IsOptional<S, P> extends true
				? // Only optional properties can be deleted
				  Target<S[P]> | DELETED
				: Target<S[P]>;
	  }
	: S;
