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

type WithOptional<S> = S extends any[] | ((...args: any) => any)
	? S
	: S extends object
	? {
			[P in keyof S]: IsOptional<S, P> extends true
				? // Only optional properties can be undefined
				  WithOptional<S[P]> | undefined
				: WithOptional<S[P]>;
	  }
	: S;

/**
 * Create a new target from the current state and
 * a partial state. This is useful to have a cleaner interface
 * that just provides the values that need to be changed.
 */
function from<S>(state: S, target: WithOptional<S>): Target<S> {
	const queue: Array<{ s: any; t: any }> = [{ s: state, t: target }];

	while (queue.length > 0) {
		const { s, t } = queue.shift()!;

		for (const key of Object.keys(s)) {
			if (!(key in t) || (t[key] === undefined && s[key] !== undefined)) {
				// UNDEFINED means delete the value
				t[key] = UNDEFINED;
			} else if (typeof t[key] === 'object') {
				// If the value is an object, we need to recurse
				queue.push({ s: s[key], t: t[key] });
			}
		}
	}

	return target;
}

export const Target = {
	from,
};
