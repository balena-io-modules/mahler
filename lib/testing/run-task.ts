import { zip } from './zip';

import type { Task, TaskOp, TaskArgs } from '../task';
import type { Root, PathType } from '../path';

/**
 * Run the task on a given state and context
 *
 * If the given task is a Method task, it expands the task first in
 * a sequential fashion and runs all the returned actions
 */
export async function runTask<
	TState = unknown,
	TPath extends PathType = Root,
	TOp extends TaskOp = 'update',
>(
	task: Task<TState, TPath, TOp>,
	state: TState,
	args: TaskArgs<TState, TPath, TOp>,
): Promise<TState> {
	const doTask = zip(task(args));
	return doTask(state);
}
