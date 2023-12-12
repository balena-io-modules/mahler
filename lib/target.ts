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

function globToRegExp(glob: string): RegExp {
	const parts = glob.split('*');
	const regex = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return new RegExp(`^${regex.join('[^/]*')}$`);
}

/**
 * Create a new target from the current state and
 * a partial state. This is useful to have a cleaner interface
 * that just provides the values that need to be changed.
 *
 * The process will skip any target paths matching the given globs. Note that glob
 * support is very limited, and only supports `*` as special characters.
 */
function from<S>(
	state: S,
	target: WithOptional<S>,
	ignoreGlobs = [] as string[],
): Target<S> {
	const queue: Array<{ s: any; t: any; p: string }> = [
		{ s: state, t: target, p: '' },
	];

	const ignore = ignoreGlobs.map(globToRegExp);

	while (queue.length > 0) {
		const { s, t, p } = queue.shift()!;

		for (const key of Object.keys(s)) {
			if (key in t && t[key] === undefined && s[key] !== undefined) {
				t[key] = UNDEFINED;
			} else if (ignore.some((r) => r.test(`${p}/${key}`))) {
				continue;
			} else if (!(key in t)) {
				// UNDEFINED means delete the value
				t[key] = UNDEFINED;
			} else if (typeof t[key] === 'object') {
				// If the value is an object, we need to recurse
				queue.push({ s: s[key], t: t[key], p: `${p}/${key}` });
			}
		}
	}

	return target;
}

export const Target = {
	from,
};
