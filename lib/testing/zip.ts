import { Ref } from '../ref';
import type { Action } from '../task';
import { Method } from '../task';

function expand<T>(s: T, method: Method<T>): Array<Action<T>> {
	if (!method.condition(s)) {
		throw new Error(
			`${method.description}: condition not met for expanding method`,
		);
	}

	const res = method(s);
	const instructions = Array.isArray(res) ? res : [res];

	return instructions.flatMap((i) => (Method.is(i) ? expand(s, i) : i));
}

/**
 * Packs an instruction into something that can be tested as a function
 *
 * If the instruction is a method, it will be expanded into a list of actions before
 * being executed. If a condition in the action sequence fails, no changes will be performed
 * to the state.
 */
export function zip<T>(ins: Method<T> | Action<T>): (t: T) => Promise<T> {
	return async function (s) {
		let actions: Array<Action<T>>;
		if (Method.is(ins)) {
			actions = expand(s, ins);
		} else {
			actions = [ins];
		}

		const ref = Ref.of(structuredClone(s));

		for (const action of actions) {
			if (!action.condition(s)) {
				throw new Error(
					`${action.description}: condition not met for running action`,
				);
			}
			await action(ref);
		}

		return ref._;
	};
}
