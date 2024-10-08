import { createHash } from 'crypto';

import type { PlanningEvent, PlanningError } from '../planner';
import { SearchFailed } from '../planner';
import type { Instruction } from '../task';
import { Method, Action } from '../task';
import { PlanAction } from '../planner';
import { assert } from '../assert';

import * as DAG from '../dag';

function htmlEncode(s: string) {
	return s.replace(/"/g, () => '&quot;');
}

function hash(o: any) {
	return createHash('md5')
		.update(JSON.stringify(o))
		.digest('hex')
		.substring(0, 7);
}

function instructionId(s: any, i: Method | Action): string {
	if (Action.is(i)) {
		const n = PlanAction.from(s, i);
		return n.id;
	}

	return hash({
		id: i.id,
		path: i.path,
		state: s,
		target: i.target,
	});
}

interface DiagramNode {
	id: string;
	toString(): string;
	isAction(): boolean;
}

function fromNode(n: DAG.Join | null, map: DiagramAdjacency): undefined;
function fromNode<T>(
	n: PlanAction<T> | DAG.Fork,
	map: DiagramAdjacency,
): DiagramNode;
function fromNode(
	n: DAG.Node | null,
	map: DiagramAdjacency,
): DiagramNode | undefined;
function fromNode(
	node: DAG.Node | null,
	adj: DiagramAdjacency,
): DiagramNode | undefined {
	if (node == null) {
		return;
	}

	if (PlanAction.is(node)) {
		// Action nodes always have a parent on the diagram
		const parent = adj.get(DiagramNode.fromId(node.id));
		return DiagramNode.action(node, parent.id);
	}

	if (DAG.isFork(node)) {
		const actions = node.next.filter(PlanAction.is);
		if (actions.length > 0) {
			const [first] = actions;
			// In this case we just use id of the first action in the
			// fork as we really should not have multiple fork nodes in the
			// diagram pointing to the same actions
			return DiagramNode.fromId(`j${first!.id.substring(0, 7)}`);
		}

		const forks = node.next.filter(DAG.isFork);
		if (forks.length > 0) {
			const ids = forks.map((f) => fromNode(f, adj)).map((n) => n.id);
			return DiagramNode.fromId(hash(ids));
		}

		// An empty fork should never happen
		assert(false);
	}
}

const DiagramNode = {
	fromId(id: string): DiagramNode {
		return {
			id,
			toString() {
				return id;
			},
			isAction() {
				return false;
			},
		};
	},
	start(): DiagramNode {
		return DiagramNode.fromId('start');
	},

	level(depth: number) {
		return DiagramNode.fromId(`d${depth}`);
	},

	action<T>(n: PlanAction<T>, parentId: string) {
		return {
			id: n.id,
			toString() {
				// The node representation in the diagram
				// is dependent on the parent
				return hash({ parent: parentId, action: n.id });
			},
			isAction() {
				return true;
			},
		};
	},

	instruction<T>(s: T, i: Instruction<T>, parentId?: string) {
		if (Action.is(i)) {
			assert(parentId != null);
			const n = PlanAction.from(s, i);
			return DiagramNode.action(n, parentId);
		}

		return DiagramNode.fromId(instructionId(s, i));
	},

	fromNode,

	stop(): DiagramNode {
		return DiagramNode.fromId('stop');
	},
};

class DiagramAdjacency {
	private map = new Map<string, DiagramNode[]>();

	set(child: DiagramNode, parent: DiagramNode) {
		const p = this.map.get(child.id);
		if (p == null) {
			this.map.set(child.id, [parent]);
		} else {
			p.push(parent);
		}
	}

	has(node: DiagramNode): boolean {
		return this.map.has(node.id);
	}

	get(node: DiagramNode): DiagramNode {
		const p = this.map.get(node.id);
		assert(p != null && p.length > 0);

		// The official parent of a node is the last parent
		// in the list
		return p[p.length - 1]!;
	}

	getAll(node: DiagramNode): DiagramNode[] {
		const p = this.map.get(node.id);
		assert(p != null && p.length > 0);

		return p;
	}
}

/**
 * Mermaid classses for nodes
 */
const ERROR_NODE = 'stroke:#f00';
const SELECTED_NODE = 'stroke:#0f0';

class Diagram {
	adjacency = new DiagramAdjacency();
	parent: DiagramNode | null = null;
	depth = 0;
	graph: string[] = [];
	// Keeps track of the index where the method (identified by instruction id)
	// was added to the graph to allow backtracking when switching from parallel to
	// sequential
	callStack = new Map<string, number>();

	meta: Record<string, PlanningError | PlanningEvent<any>> = {};

	constructor() {
		this.graph = [];
	}

	private drawJoins(
		child: DiagramNode,
		prev: DAG.Node | null,
		first = true,
	): DiagramNode | undefined {
		if (prev == null || !(DAG.isFork(prev) || PlanAction.is(prev))) {
			return;
		}

		const pNode = DiagramNode.fromNode(prev, this.adjacency);

		if (this.adjacency.has(child)) {
			const list = this.adjacency.getAll(child);

			// If there already a link between the child
			// and the the previous node then
			// we just terminate returning pNode
			if (list.findIndex((n) => n.id === pNode.id) >= 0) {
				return pNode;
			}
		}

		if (PlanAction.is(prev)) {
			if (!first) {
				this.graph.push(`	${pNode} -.- ${child}`);
				this.adjacency.set(child, pNode);
			}
			return pNode;
		}

		// If the node is a fork then we need to keep joining up
		prev.next.forEach((n) => this.drawJoins(pNode, n, false));

		// If we are here, we need to add the new nodes to the graph
		if (!first) {
			this.graph.push(`	${pNode}(( )) -.- ${child}`);
			this.adjacency.set(child, pNode);
		} else {
			this.graph.push(`	${pNode}(( ))`);
		}

		return pNode;
	}

	drawPlan(
		node: DAG.Node | null,
		prev: DiagramNode,
	): [DAG.Join, DiagramNode] | undefined {
		if (node == null) {
			// If we reached the end of the plan, add a stop node
			this.graph.push(`	${prev} --> ${DiagramNode.stop()}`);
			return;
		}

		if (PlanAction.is(node)) {
			const parent = this.adjacency.get(DiagramNode.fromId(node.id));
			const child = DiagramNode.action(node, parent.id);
			this.graph.push(`	${prev} --> ${child}`, `	${child}:::selected`);
			return this.drawPlan(node.next, child);
		}

		if (DAG.isFork(node)) {
			const join = DiagramNode.fromNode(node, this.adjacency);
			const fork = DiagramNode.fromId('f' + join.id);
			this.graph.push(`	${prev} --> ${fork}(( ))`, `	${fork}:::selected`);
			const ends = node.next.map((n) => this.drawPlan(n, fork)!);

			this.graph.push(`	${join}(( ))`);
			ends.forEach(([_, p]) => this.graph.push(`	${p} --> ${join}`));
			this.graph.push(`	${join}:::selected`);

			const [end] = ends;
			assert(end != null);

			const [first] = end;

			return this.drawPlan(first.next, join);
		}

		// If the node is an empty node, ignore it
		return [node as DAG.Join, prev];
	}

	onStart(): DiagramNode {
		const node = DiagramNode.start();
		this.graph.push('graph TD');
		this.graph.push(`	${node}(( ))`);
		this.parent = node;

		return node;
	}

	onFindNext<T>(e: PlanningEvent<T> & { event: 'find-next' }): DiagramNode {
		assert(this.parent != null);

		const currNode = DiagramNode.level(e.depth);

		// The parent of a next node is either the immediate join after
		// joining branches upwards or is the diagram node for the previous
		// action or is 'start'
		const parentNode = this.drawJoins(currNode, e.prev) ?? DiagramNode.start();
		this.graph.push(`	${parentNode} -.- ${currNode}{ }`);
		this.adjacency.set(currNode, parentNode);
		this.parent = currNode;
		this.depth = e.depth;

		return currNode;
	}

	onTryInstruction<T>(
		e: PlanningEvent<T> & { event: 'try-instruction' },
	): DiagramNode {
		// If this is being called we already had previous events
		assert(this.parent != null);

		// check if the instruction is an action or a method
		// and set the ID and node accordingly
		const insId = instructionId(e.state, e.instruction);

		// By default we assume the parent node is the level node
		let parent = DiagramNode.level(this.depth);

		// If that's not the case we need to figure out
		// who the right parent is
		if (this.parent.id !== parent.id) {
			// The current node is either the first child of a compound task
			// or there is a previous node in the plan
			assert(e.prev != null || e.parent != null);

			if (e.parent != null) {
				parent = DiagramNode.instruction(e.state, e.parent);

				if (e.prev != null) {
					const prevNode =
						DiagramNode.fromNode(e.prev, this.adjacency) ?? parent;

					// We go up the adjacency map to find the first action
					// node that links to the compound task. If that node is the
					// same as the previous node id, then this is the first child
					// of the compound task
					let p = parent;
					while (this.adjacency.has(p) && !this.adjacency.get(p).isAction()) {
						p = this.adjacency.get(p);
					}

					if (
						!this.adjacency.has(p) ||
						this.adjacency.get(p).id !== prevNode.id
					) {
						parent = prevNode;
					}
				} else {
					// If there are empty nodes before the current action
					// on the plan we use those as the parent, otherwise we use
					// the already defined parent
					parent = this.drawJoins(DiagramNode.fromId(insId), e.prev) ?? parent;
				}
			}
		}

		const node = DiagramNode.instruction(e.state, e.instruction, parent.id);
		if (Method.is(e.instruction)) {
			this.graph.push(
				`	${parent} -.- ${node}[["${htmlEncode(e.instruction.description)}"]]`,
			);
			this.callStack.set(node.id, this.graph.length - 1);
		} else {
			this.graph.push(
				`	${parent} -.- ${node}("${htmlEncode(e.instruction.description)}")`,
			);
		}

		this.adjacency.set(node, parent);
		this.parent = node;

		return node;
	}

	onBacktracking<T>(e: PlanningEvent<T> & { event: 'backtrack-method' }): void {
		const node = DiagramNode.instruction(e.state, e.method);
		const pos = this.callStack.get(node.id);
		assert(pos !== undefined);
		this.graph.splice(pos + 1);
		this.parent = node;
	}

	onError(e: PlanningError): DiagramNode {
		assert(this.parent != null);

		const node = DiagramNode.fromId(`${this.parent}-err`);
		// Go up the stack to the level the search can continue
		if (e === SearchFailed) {
			if (this.depth > 0) {
				this.depth--;
				this.parent = DiagramNode.level(this.depth);
			}
			return node;
		}

		this.graph.push(`	${this.parent} -.- ${node}[ ]`);
		this.graph.push(`	${node}:::error`);

		// We reset the parent ID to the current search depth
		this.parent = DiagramNode.level(this.depth);

		return node;
	}

	onFound<T>(e: PlanningEvent<T> & { event: 'found' }) {
		const node = DiagramNode.stop();
		const parent = this.drawJoins(node, e.prev) ?? DiagramNode.start();
		this.graph.push(`	${parent} -.- ${node}(( ))`);
		this.graph.push(`	${node}:::finish`);
		this.graph.push(`	classDef finish stroke:#000,fill:#000`);
	}

	onSuccess<T>(e: PlanningEvent<T> & { event: 'success' }) {
		const start = DiagramNode.start();
		this.graph.push(`	${start}:::selected`);
		const n = e.start;

		// Draw the plan
		this.drawPlan(n, start);

		// Add the style data
		this.graph.push(`	classDef error ${ERROR_NODE}`);
		this.graph.push(`	classDef selected ${SELECTED_NODE}`);
		return;
	}

	onFailed() {
		this.graph.push(`	start:::error`);
		this.graph.push(`	classDef error ${ERROR_NODE}`);
	}

	updateMeta<T>(node: DiagramNode, e: PlanningEvent<T> | PlanningError) {
		this.graph.push(`click ${node} meta "${node}"`);
		this.meta[`${node}`] = e;
	}

	render(): string {
		return this.graph.join('\n');
	}
}

export type MermaidOpts = {
	meta: boolean;
};

/**
 * Return a trace function that generates
 * a mermaid graph
 */
export function mermaid({ meta = false }: Partial<MermaidOpts> = {}) {
	let diagram = new Diagram();

	return Object.assign(
		function (e: PlanningEvent<any> | PlanningError) {
			// We set the default node to the event type
			let node: DiagramNode | null = null;
			switch (e.event) {
				case 'start':
					diagram = new Diagram();
					node = diagram.onStart();

					break;

				case 'find-next':
					node = diagram.onFindNext(e);

					break;

				case 'try-instruction':
					node = diagram.onTryInstruction(e);

					break;
				case 'backtrack-method': {
					diagram.onBacktracking(e);
					return;
				}

				case 'found':
					diagram.onFound(e);

					return;

				case 'success':
					diagram.onSuccess(e);
					return;

				case 'failed':
					diagram.onFailed();
					return;

				case 'error':
					node = diagram.onError(e);
					break;
			}
			// We add metadata as a clickable event on the node
			// we only do this if the meta option is set to avoid storing
			// unnecessary data in memory
			if (meta && node) {
				diagram.updateMeta(node, e);
			}
		},
		{
			/**
			 * Generate a mermaid diagram from the planning trace
			 */
			render() {
				return diagram.render();
			},
			/**
			 * Return the metadata associated with the diagram.
			 *
			 * The metadata is a record that maps each node to the event
			 * the node represents.
			 */
			metadata() {
				return diagram.meta;
			},
		},
	);
}
