import type { Task, TaskOp } from '../task';
import type { PathType, Root } from '../path';
import { Path } from '../path';
import type { Operation } from '../operation';

/**
 * Identify if a task is applicable for a specific operation
 *
 * A task is applicable if the task operation as the operation op, and if the task path matches the operation
 * path
 */
export function isTaskApplicable<
	TState = any,
	TPath extends PathType = Root,
	TOp extends TaskOp = 'update',
>(t: Task<TState, TPath, TOp>, o: Operation<any, any>) {
	if (t.op !== '*' && t.op !== o.op) {
		return false;
	}

	const taskParts = Path.split(t.lens);
	const opParts = Path.split(o.path);

	if (taskParts.length !== opParts.length) {
		return false;
	}

	for (const tElem of taskParts) {
		const oElem = opParts.shift();
		if (!tElem.startsWith(':') && tElem !== oElem) {
			return false;
		}
	}

	return true;
}
