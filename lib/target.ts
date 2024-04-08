export const UNDEFINED: unique symbol = Symbol('m_undefined');
export type UNDEFINED = typeof UNDEFINED;

type IsOptional<S extends object, K extends keyof S> =
	Omit<S, K> extends S ? true : false;

/**
 * A target is a partial state that can be used to update
 *
 * A Target in Mahler is by default 'relative', meaning that only property
 * changes and additions should be considered when comparing current and
 * target states for planning. Property deletion need to be done explicitely
 * via the `UNDEFINED` symbol. This allows a cleeaner interface for for
 * defining system targets and allows the system state to have additional properties
 * than the target.
 *
 * Example: let's say we are modelling the state of two variables `x` and `y`.
 *
 * Given the current state `{x: 0}`, the target state `{y: 1}` means that the
 * planner needs to only to find a task that can create the variable `y` and increase its
 * value to `1`. The final expected state should be `{x: 0, y:1}` (assuming nothing else changes `x`).
 *
 * If the goal was to remove the variable `x` at the same time that variable `y` is introduced, the
 * target would need to be `{x: UNDEFINED, y: 1}`.
 *
 * A 'relative' target is the opposite to a 'strict' (or absolute) target, where what is passed to
 * the planner/agent describes exactly the desired state of the system is.
 *
 * In the previous example, the strict target `{y:1}` is equivalent to the relative target `{x: UNDEFINED, y: 1}`,
 * meaning the strict target describes the expected state of the system.
 */
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

/**
 * A strict target describes the desired system state in an 'absolute' way
 *
 * Absolute, in this context, means that after a plan has been successfully been
 * found, the system state should look exactly like the given target.
 */
export type StrictTarget<S> = S extends any[] | ((...args: any) => any)
	? S
	: S extends object
		? {
				[P in keyof S]: IsOptional<S, P> extends true
					? // Only optional properties can be undefined
						StrictTarget<S[P]> | undefined
					: StrictTarget<S[P]>;
			}
		: S;

function globToRegExp(glob: string): RegExp {
	const parts = glob.split('*');
	const regex = parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return new RegExp(`^${regex.join('[^/]*')}$`);
}

/**
 * Create a new relative target from the given strict target and the
 * current state.
 *
 * This will look any missing properties on the target and replace them with
 * `UNDEFINED` symbols in order to mark them for deletion.
 *
 * Because sometimes it is useful to have properties on the current state
 * that are not needed on the target, this function receives a
 * list of 'globs' indicating which properties to ignore. Properties in the `ignoreGlobs`
 * list will be skipped when marking properties to be deleted.
 *
 * Example.
 * ```
 * // Current state
 * const s = {x: 1, y:0, lastUpdated: '20240408T12:00:00Z'};
 *
 * // Calculate target state
 * const target = Target.fromStrict(s, {y: 1}, ['lastUpdated']);
 * console.log(target); // {x: UNDEFINED, y: 1}
 * ```
 *
 * Note that glob support is very limited, and only supports `*` as special characters.
 */
function fromStrict<S>(
	state: S,
	target: StrictTarget<S>,
	ignoreGlobs = [] as string[],
): Target<S> {
	const queue: Array<{ s: any; t: any; p: string }> = [
		{ s: state, t: target, p: '' },
	];

	const ignore = ignoreGlobs.map(globToRegExp);

	while (queue.length > 0) {
		const { s, t, p } = queue.shift()!;

		// Don't recurse into arrays
		if (Array.isArray(s) || Array.isArray(t)) {
			continue;
		}
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
	/**
	 * Create a new relative target from the given strict target and the
	 * current state.
	 *
	 * @deprecated to be replaced by fromStrict
	 */
	from: fromStrict,
	fromStrict,
};
