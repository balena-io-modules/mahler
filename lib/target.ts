export const UNDEFINED: unique symbol = Symbol('m_undefined');
export type UNDEFINED = typeof UNDEFINED;

type IsOptional<S extends object, K extends keyof S> = Omit<S, K> extends S
	? true
	: false;

export type Target<S> = S extends any[] | ((...args: any) => any)
	? S
	: S extends object
	? {
			[P in keyof S]?: IsOptional<S, P> extends true
				? // Only optional properties can be deleted
				  Target<S[P]> | UNDEFINED
				: Target<S[P]>;
	  }
	: S;
