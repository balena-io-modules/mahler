import { createHash } from 'crypto';

import { PlanningEvent, PlanningError, EmptyNode } from '../planner';
import { Method, Action, Parallel } from '../task';
import { Node } from '../planner';
import { assert } from '../assert';

type GraphState = {
	parentMap?: Map<string, string[]>;
	parentId?: string;
	levelId?: string;
	depth?: number;
};

/**
 * Mermaid classses for nodes
 */
const ERROR_NODE = 'stroke:#f00';
const SELECTED_NODE = 'stroke:#0f0';

export type MermaidOpts = {
	meta: boolean;
};

function htmlEncode(s: string) {
	return s.replace(/"/g, () => '&quot;');
}

function hash(o: any) {
	return createHash('md5')
		.update(JSON.stringify(o))
		.digest('hex')
		.substring(0, 7);
}

function instructionId(s: any, i: Method | Action | Parallel): string {
	if (Action.is(i)) {
		const n = Node.of(s, i);
		return n.id;
	}

	return hash({
		id: i.id,
		path: i.path,
		state: s,
		target: i.target,
	});
}

function actionId(action: string, parent: string) {
	return hash({ parent, action });
}

function nodeId<T>(
	n: Node<T> | null,
	fallbackId: string,
	parentMap: Map<string, string[]>,
): string {
	if (n == null) {
		return fallbackId;
	}

	if (Node.isAction(n)) {
		const parentId = getParent(n.id, parentMap);
		return actionId(n.id, parentId);
	}

	if (Node.isFork(n)) {
		const actions = n.next.filter(Node.isAction);
		if (actions.length > 0) {
			return `j` + actions[0].id.substring(0, 7);
		}

		const forks = n.next.filter(Node.isFork);
		if (forks.length > 0) {
			const ids = forks.map((f) => nodeId(f, 'none', parentMap));

			// Not sure if this is necessary as this is covered
			// by the assert below
			assert(ids.every((i) => i !== 'none'));

			// We combine the parent ids into a new (deterministic) id
			return hash(ids);
		}

		// This is an empty fork and should
		// never happen
		assert(false);
	}

	return fallbackId;
}

function expandPlan(
	node: Node<any> | null,
	prev: string,
	graph: string[],
	parentMap: Map<string, string[]>,
): [EmptyNode<any>, string] | undefined {
	if (node == null) {
		// If we reached the end of the plan, add a stop node
		graph.push(`	${prev} --> stop`);
		return;
	}

	if (Node.isAction(node)) {
		const pId = getParent(node.id, parentMap);
		const nId = actionId(node.id, pId);
		graph.push(`	${prev} --> ${nId}`, `	${nId}:::selected`);
		return expandPlan(node.next, nId, graph, parentMap);
	}

	if (Node.isFork(node)) {
		const joinId = nodeId(node, 'none', parentMap);
		const forkId = 'f' + joinId;
		graph.push(`	${prev} --> ${forkId}(( ))`, `	${forkId}:::selected`);
		const ends = node.next.map((n) => expandPlan(n, forkId, graph, parentMap)!);

		graph.push(`	${joinId}(( ))`);
		ends.forEach(([_, p]) => graph.push(`	${p} --> ${joinId}`));
		graph.push(`	${joinId}:::selected`);

		const [first] = ends[0];

		return expandPlan(first.next, joinId, graph, parentMap);
	}

	// If the node is an empty node, ignore it
	return [node, prev];
}

function addJoinNodes(
	next: string,
	node: Node<any> | null,
	graph: string[],
	parentMap = new Map<string, string[]>(),
	isFirst = true,
): string | undefined {
	if (node == null || !(Node.isFork(node) || Node.isAction(node))) {
		return;
	}

	const nId = nodeId(node, 'start', parentMap);
	if (parentMap.has(next)) {
		const p = getParent(next, parentMap);
		if (p.includes(nId)) {
			return nId;
		}
	}

	if (Node.isAction(node)) {
		if (!isFirst) {
			graph.push(`	${nId} -.- ${next}`);
			setParent(next, nId, parentMap);
		}
		return nId;
	}

	// Add any additional join found in the linked fork nodes
	node.next.forEach((n) => addJoinNodes(nId, n, graph, parentMap, false));

	// Add the last join node linked to the target
	if (!isFirst) {
		graph.push(`	${nId}(( )) -.- ${next}`);
		setParent(next, nId, parentMap);
	} else {
		graph.push(`	${nId}(( ))`);
	}

	return nId;
}

function setParent(id: string, parent: string, graph: Map<string, string[]>) {
	const p = graph.get(id);
	if (p == null) {
		graph.set(id, [parent]);
	} else if (!p.includes(parent)) {
		p.push(parent);
	}
}

function getParent(id: string, graph: Map<string, string[]>): string {
	const p = graph.get(id);
	assert(p != null && p.length > 0);

	return p[p.length - 1];
}

/**
 * Return a trace function that generates
 * a mermaid graph
 */
export function mermaid(
	title: string,
	{ meta = false }: Partial<MermaidOpts> = {},
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
					state.parentMap = new Map();

					break;

				case 'find-next':
					assert(state.parentMap != null);
					node = `d${e.depth}`;

					// Add any missing join nodes
					let fnParentId = addJoinNodes(node, e.prev, graph, state.parentMap);

					fnParentId = fnParentId || nodeId(e.prev, 'start', state.parentMap);

					graph.push(`	${fnParentId} -.- ${node}{ }`);

					// A find-next node always has a single parent
					setParent(node, fnParentId, state.parentMap);

					state.levelId = node;
					state.parentId = node;
					state.depth = e.depth;

					break;

				case 'try-instruction':
					assert(state.depth != null);
					assert(state.levelId != null);
					assert(state.parentId != null);
					assert(state.parentMap != null);

					// check if the instruction is an action or a method
					// and set the ID and node accordingly
					const insId = instructionId(e.state, e.instruction);

					// If this the immediate call after a level node
					// then use the levelId
					let parentId = state.levelId;

					if (state.parentId !== state.levelId) {
						// We are either the first child of a compound task
						// or we have a previous node
						assert(e.prev != null || e.parent != null);

						if (e.parent != null) {
							parentId = instructionId(e.state, e.parent);

							if (e.prev != null) {
								const prevNodeId = nodeId(e.prev, parentId, state.parentMap);

								// If this is the first child of the compound task
								// the parent id and the node parent id will be the same
								if (
									!state.parentMap.has(parentId) ||
									getParent(parentId, state.parentMap) !== prevNodeId
								) {
									parentId = prevNodeId;
								}
							} else {
								// addJoinNodes handles the case where the previous node
								// is a fork node.
								const joinParent = addJoinNodes(
									node,
									e.prev,
									graph,
									state.parentMap,
								);

								parentId =
									joinParent || nodeId(e.prev, parentId, state.parentMap);
							}
						}
					}

					// Non action nodes have an id equal to the instruction
					node = insId;
					setParent(node, parentId, state.parentMap);

					if (Method.is(e.instruction) || Parallel.is(e.instruction)) {
						graph.push(
							`	${parentId} -.- ${node}[["${htmlEncode(
								e.instruction.description,
							)}"]]`,
						);
					} else {
						// An action node id is not unique, only the
						// pairing with the parent is unique
						node = actionId(node, parentId);
						graph.push(
							`	${parentId} -.- ${node}("${htmlEncode(
								e.instruction.description,
							)}")`,
						);
					}

					// Parent id only is useful in case of error
					state.parentId = node;

					break;

				case 'found':
					assert(state.parentMap != null);
					const sParentId =
						addJoinNodes('stop', e.prev, graph, state.parentMap) || 'start';
					graph.push(`	${sParentId} -.- stop(( ))`);
					graph.push(`	stop:::finish`);
					graph.push(`	classDef finish stroke:#000,fill:#000`);

					return;

				case 'success':
					assert(state.parentMap != null);
					graph.push(`	start:::selected`);
					const n = e.start;

					// Expand the plan
					expandPlan(n, 'start', graph, state.parentMap);

					// Add the style data
					graph.push(`	classDef error ${ERROR_NODE}`);
					graph.push(`	classDef selected ${SELECTED_NODE}`);
					return;

				case 'failed':
					graph.push(`	start:::error`);
					graph.push(`	classDef error ${ERROR_NODE}`);
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
