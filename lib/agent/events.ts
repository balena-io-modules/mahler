import type { Target } from '../target';
import type { ReadOnly } from '../readonly';
import type { PlanNode, PlanningStats } from '../planner';
import type { Action } from '../task';

export type AgentRuntimeEvent<TState = unknown> =
	| {
			event: 'start';
			target: Target<TState>;
	  }
	| {
			event: 'find-plan';
			state: ReadOnly<TState>;
			target: Target<TState>;
	  }
	| { event: 'plan-found'; start: PlanNode<TState>; stats: PlanningStats }
	| { event: 'plan-not-found'; cause: unknown; stats: PlanningStats }
	| { event: 'plan-timeout'; timeout: number }
	| { event: 'backoff'; tries: number; delayMs: number }
	| { event: 'success' }
	| { event: 'failure'; cause: unknown }
	| { event: 'plan-executed' }
	// Actions can run in parallel so all these events need an action property
	| { event: 'action-next'; action: Action<TState> }
	| { event: 'action-condition-failed'; action: Action<TState> }
	| { event: 'action-start'; action: Action<TState> }
	| { event: 'action-failure'; action: Action<TState>; cause: unknown }
	| { event: 'action-success'; action: Action<TState> };
