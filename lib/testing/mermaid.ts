import { createHash } from 'crypto';

import { PlanningEvent, PlanningError, EmptyNode } from '../planner';
import { Method, Action, Parallel } from '../task';
import { Node } from '../planner';
import { assert } from '../assert';

type GraphState = {
	parentGraph?: Map<string, string | string[]>;
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

function nodeId<T>(n: Node<T> | null, fallbackId: string): string {
	if (n == null) {
		return fallbackId;
	}

	if (Node.isAction(n)) {
		return n.id;
	}

	if (Node.isFork(n)) {
		const actions = n.next.filter(Node.isAction);
		if (actions.length > 0) {
			return `j` + actions[0].id;
		}

		const forks = n.next.filter(Node.isFork);
		if (forks.length > 0) {
			const ids = forks.map((f) => nodeId(f, 'none'));

			// Not sure if this is necessary as this is covered
			// by the assert below
			assert(ids.every((i) => i !== 'none'));

			// We combine the parent ids into a new (deterministic) id
			return `j` + createHash('md5').update(JSON.stringify(ids)).digest('hex');
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
): [EmptyNode<any>, string] | undefined {
	if (node == null) {
		// If we reached the end of the plan, add a stop node
		graph.push(`	${prev} --> stop`);
		return;
	}

	if (Node.isAction(node)) {
		graph.push(`	${prev} --> ${node.id}`, `	${node.id}:::selected`);
		return expandPlan(node.next, node.id, graph);
	}

	if (Node.isFork(node)) {
		const joinId = nodeId(node, 'none');
		const forkId = 'f' + joinId;
		graph.push(`	${prev} --> ${forkId}(( ))`, `	${forkId}:::selected`);
		const ends = node.next.map((n) => expandPlan(n, forkId, graph)!);

		graph.push(`	${joinId}(( ))`);
		ends.forEach(([_, p]) => graph.push(`	${p} --> ${joinId}`));
		graph.push(`	${joinId}:::selected`);

		const [first] = ends[0];

		return expandPlan(first.next, joinId, graph);
	}

	// If the node is an empty node, ignore it
	return [node, prev];
}

function addJoinNodes(
	next: string,
	node: Node<any> | null,
	graph: string[],
	parentGraph = new Map<string, string | string[]>(),
	isFirst = true,
): string | undefined {
	if (node == null || !(Node.isFork(node) || Node.isAction(node))) {
		return;
	}

	const nId = nodeId(node, 'start');
	let pList: string[] = [];
	if (parentGraph.has(next)) {
		const p = parentGraph.get(next)!;
		pList = Array.isArray(p) ? p : [p];

		if (pList.includes(nId)) {
			return nId;
		}
	}

	if (Node.isAction(node)) {
		if (!isFirst) {
			graph.push(`	${nId} -.- ${next}`);

			pList.push(nId);
			parentGraph.set(next, pList.length === 1 ? pList[0] : pList);
		}
		return node.id;
	}

	// Add any additional join found in the linked fork nodes
	node.next.forEach((n) => addJoinNodes(nId, n, graph, parentGraph, false));

	// Add the last join node linked to the target
	if (!isFirst) {
		graph.push(`	${nId}(( )) -.- ${next}`);
		parentGraph.set(next, nId);
	} else {
		graph.push(`	${nId}(( ))`);
	}

	return nId;
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
					state.parentGraph = new Map();

					break;

				case 'find-next':
					assert(state.parentGraph != null);
					node = `d${e.depth}`;

					// Add any missing join nodes
					let fnParentId = addJoinNodes(node, e.prev, graph, state.parentGraph);

					// Node Id will return start if prev is null
					fnParentId = fnParentId || nodeId(e.prev, 'start');

					graph.push(`	${fnParentId} -.- ${node}{ }`);

					// A find-next node always has a single parent
					state.parentGraph.set(node, fnParentId);
					state.levelId = node;
					state.parentId = node;
					state.depth = e.depth;

					break;

				case 'try-instruction':
					assert(state.depth != null);
					assert(state.levelId != null);
					assert(state.parentId != null);
					assert(state.parentGraph != null);

					// check if the instruction is an action or a method
					// and set the ID and node accordingly
					node = instructionId(e.state, e.instruction);

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
								const prevNodeId = nodeId(e.prev, parentId);

								// If this is the first child of the compound task
								// the parent id and the node parent id will be the same
								if (
									!state.parentGraph.has(parentId) ||
									state.parentGraph.get(parentId) !== prevNodeId
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
									state.parentGraph,
								);

								parentId = joinParent || nodeId(e.prev, parentId);
							}
						}
					}

					if (Method.is(e.instruction) || Parallel.is(e.instruction)) {
						graph.push(
							`	${parentId} -.- ${node}[["${htmlEncode(
								e.instruction.description,
							)}"]]`,
						);
					} else {
						graph.push(
							`	${parentId} -.- ${node}("${htmlEncode(
								e.instruction.description,
							)}")`,
						);
					}

					state.parentGraph.set(node, parentId);

					// Parent id only is useful in case of error
					state.parentId = node;

					break;

				case 'found':
					assert(state.parentGraph != null);
					const sParentId =
						addJoinNodes('stop', e.prev, graph, state.parentGraph) || 'start';
					graph.push(`	${sParentId} -.- stop(( ))`);
					graph.push(`	stop:::finish`);
					graph.push(`	classDef finish stroke:#000,fill:#000`);

					return;

				case 'success':
					graph.push(`	start:::selected`);
					const n = e.start;

					// Expand the plan
					expandPlan(n, 'start', graph);

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
