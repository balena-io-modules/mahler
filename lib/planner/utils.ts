import { Task } from '../task';
import { TaskOp } from '../context';
import { Path } from '../path';
import { Operation } from '../operation';

/**
 * Identify if a task is applicable for a specific operation
 *
 * A task is applicable if the task operation as the operation op, and if the task path matches the operation
 * path
 */
export function isTaskApplicable<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
>(t: Task<TState, TPath, TOp>, o: Operation<any, any>) {
	if (t.op !== '*' && t.op !== o.op) {
		return false;
	}

	const taskParts = Path.elems(t.path);
	const opParts = Path.elems(o.path);

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
