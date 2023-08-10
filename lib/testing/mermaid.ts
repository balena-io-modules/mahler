import { createHash } from 'crypto';

import { PlanningEvent, PlanningError } from '../planner';
import { Method, Action, Parallel } from '../task';
import { Node } from '../planner';
import { assert } from '../assert';

type GraphState = {
	parentId?: string;
	levelId?: string;
	depth?: number;
};

export type MermaidOpts = {
	meta: boolean;
	/**
	 * Mermaid class for errors
	 */
	error: string;
	selected: string;
};

function htmlEncode(s: string) {
	return s.replace(/"/g, () => '&quot;');
}

function instructionId(s: any, i: Method | Action | Parallel): string {
	if (Action.is(i)) {
		const n = Node.of(s, i);
		return n.id;
	}

	return createHash('md5')
		.update(
			JSON.stringify({
				id: i.id,
				path: i.path,
				state: s,
				target: i.target,
			}),
		)
		.digest('hex');
}

/**
 * Return a trace function that generates
 * a mermaid graph
 */
export function mermaid(
	title: string,
	{
		meta = false,
		error = 'stroke:#f00',
		selected = 'stroke:#0f0',
	}: Partial<MermaidOpts> = {},
) {
	// The graph description, for now we store it
	// in memory
	const graph = ['---', `title: ${title}`, `---`];

	const state: GraphState = {};

	return Object.assign(
		function (e: PlanningEvent<any> | PlanningError) {
			// We set the default node to the event type
			let node = e.event as string;
			switch (e.event) {
				case 'start':
					graph.push('graph TD');
					graph.push(`	${node}(( ))`);
					state.parentId = node;

					break;

				case 'find-next':
					assert(state.parentId != null);
					node = `d${e.depth}`;

					graph.push(`	${state.parentId} -.- ${node}{ }`);

					state.parentId = node;
					state.levelId = node;
					state.depth = e.depth;
					break;

				case 'try-instruction':
					assert(state.parentId != null);
					assert(state.depth != null);
					// check if the instruction is an action or a method
					// and set the ID and node accordingly
					node = instructionId(e.state, e.instruction);
					if (Method.is(e.instruction)) {
						graph.push(
							`	${state.parentId} -.- ${node}[["${htmlEncode(
								e.instruction.description,
							)}"]]`,
						);
					} else if (Parallel.is(e.instruction)) {
						graph.push(
							`	${state.parentId} -.- ${node}[/"${htmlEncode(
								e.instruction.description,
							)}"\]`,
						);
					} else {
						graph.push(
							`	${state.parentId} -.- ${node}("${htmlEncode(
								e.instruction.description,
							)}")`,
						);
					}
					state.parentId = node;

					break;

				case 'success':
					graph.push(`	start:::selected`);
					let n = e.start;
					let p = 'start';
					while (n != null) {
						graph.push(`	${p} --> ${n.id}`);
						graph.push(`	${n.id}:::selected`);
						p = n.id;
						n = n.next;
					}

					graph.push(`	${p} --> stop(( ))`);
					graph.push(`	stop:::finish`);
					graph.push(`	classDef error ${error}`);
					graph.push(`	classDef selected ${selected}`);
					graph.push(`	classDef finish stroke:#000,fill:#000`);
					return;

				case 'failed':
					graph.push(`	start:::error`);
					graph.push(`	classDef error ${error}`);
					return;

				case 'error':
					assert(state.parentId != null);
					assert(state.depth != null);
					if (e.cause === 'search-failed') {
						if (state.depth > 0) {
							state.levelId = `d${state.depth - 1}`;
						}

						if (state.depth > 1) {
							state.parentId = `d${state.depth - 2}`;
						} else {
							state.parentId = 'start';
						}
						return;
					}

					node = `${state.parentId}-err`;
					graph.push(`	${state.parentId} -.- ${node}[ ]`);
					graph.push(`	${node}:::error`);

					// We reset the parent ID to the previous level
					state.parentId = state.levelId;
			}

			// We add metadata as a clickable event on the node
			// metadata can be pretty large, so `meta` defaults
			// to `false`
			if (meta) {
				graph.push(`click ${node} meta "${htmlEncode(JSON.stringify(e))}"`);
			}
		},
		{
			build() {
				return graph.join('\n');
			},
		},
	);
}
