import { createHash } from 'crypto';

import {
	PlanningEvent,
	PlanningError,
	EmptyNode,
	ActionNode,
	ForkNode,
} from '../planner';
import { Method, Action, Instruction } from '../task';
import { Node } from '../planner';
import { assert } from '../assert';

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

interface DiagramNode {
	id: string;
	toString(): string;
}

function fromNode<T>(n: EmptyNode<T> | null, map: DiagramAdjacency): undefined;
function fromNode<T>(
	n: ActionNode<T> | ForkNode<T>,
	map: DiagramAdjacency,
): DiagramNode;
function fromNode<T>(
	n: Node<T> | null,
	map: DiagramAdjacency,
): DiagramNode | undefined;
function fromNode<T>(
	node: Node<T> | null,
	map: DiagramAdjacency,
): DiagramNode | undefined {
	if (node == null) {
		return;
	}

	if (Node.isAction(node)) {
		// Action nodes always have a parent on the diagram
		const parent = map.get(node);
		return DiagramNode.action(node, parent.id);
	}

	if (Node.isFork(node)) {
		const actions = node.next.filter(Node.isAction);
		if (actions.length > 0) {
			// In this case we just use id of the first action in the
			// fork as we really should not have multiple fork nodes in the
			// diagram pointing to the same actions
			return DiagramNode.fromId(`j${actions[0].id.substring(0, 7)}`);
		}

		const forks = node.next.filter(Node.isFork);
		if (forks.length > 0) {
			const ids = forks.map((f) => fromNode(f, map)).map((n) => n.id);
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
		};
	},
	start(): DiagramNode {
		return DiagramNode.fromId('start');
	},

	level(depth: number) {
		return DiagramNode.fromId(`d${depth}`);
	},

	action<T>(n: ActionNode<T>, parentId: string) {
		return {
			id: n.id,
			toString() {
				// The node representation in the diagram
				// is dependent on the parent
				return hash({ parent: parentId, action: n.id });
			},
		};
	},

	instruction<T>(s: T, i: Instruction<T, any, any>, parentId?: string) {
		if (Action.is(i)) {
			assert(parentId != null);
			const n = Node.of(s, i);
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
	private map: Map<string, DiagramNode[]> = new Map();

	set(child: DiagramNode, parent: DiagramNode) {
		const p = this.map.get(child.id);
		if (p == null) {
			this.map.set(child.id, [parent]);
		} else if (p.every((n) => n.id !== parent.id)) {
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
		return p[p.length - 1];
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

	constructor(title: string) {
		this.graph = ['---', `title: ${title}`, `---`];
	}

	private drawJoins(
		child: DiagramNode,
		prev: Node<any> | null,
		first = true,
	): DiagramNode | undefined {
		if (prev == null || !(Node.isFork(prev) || Node.isAction(prev))) {
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

		if (Node.isAction(prev)) {
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
		node: Node<any> | null,
		prev: DiagramNode,
	): [EmptyNode<any>, DiagramNode] | undefined {
		if (node == null) {
			// If we reached the end of the plan, add a stop node
			this.graph.push(`	${prev} --> ${DiagramNode.stop()}`);
			return;
		}

		if (Node.isAction(node)) {
			const parent = this.adjacency.get(node);
			const child = DiagramNode.action(node, parent.id);
			this.graph.push(`	${prev} --> ${child}`, `	${child}:::selected`);
			return this.drawPlan(node.next, child);
		}

		if (Node.isFork(node)) {
			const join = DiagramNode.fromNode(node, this.adjacency);
			const fork = DiagramNode.fromId('f' + join.id);
			this.graph.push(`	${prev} --> ${fork}(( ))`, `	${fork}:::selected`);
			const ends = node.next.map((n) => this.drawPlan(n, fork)!);

			this.graph.push(`	${join}(( ))`);
			ends.forEach(([_, p]) => this.graph.push(`	${p} --> ${join}`));
			this.graph.push(`	${join}:::selected`);

			const [first] = ends[0];

			return this.drawPlan(first.next, join);
		}

		// If the node is an empty node, ignore it
		return [node, prev];
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
		const parentNode = this.drawJoins(currNode, e.prev) || DiagramNode.start();
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
						DiagramNode.fromNode(e.prev, this.adjacency) || parent;

					// If this is the first child of the compound task
					// the parent id and the previous node id will be the same
					if (
						!this.adjacency.has(parent) ||
						this.adjacency.get(parent).id !== prevNode.id
					) {
						parent = prevNode;
					}
				} else {
					// If there are empty nodes before the current action
					// on the plan we use those as the parent, otherwise we use
					// the already defined parent
					parent = this.drawJoins(DiagramNode.fromId(insId), e.prev) || parent;
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
		if (e.cause === 'search-failed') {
			if (this.depth > 1) {
				this.parent = DiagramNode.level(this.depth - 2);
			} else {
				this.parent = DiagramNode.start();
			}

			if (this.depth > 0) {
				this.depth -= 1;
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
		const parent = this.drawJoins(node, e.prev) || DiagramNode.start();
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

	meta<T>(node: DiagramNode, e: PlanningEvent<T> | PlanningError) {
		this.graph.push(`click ${node} meta "${htmlEncode(JSON.stringify(e))}"`);
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
export function mermaid(
	title: string,
	{ meta = false }: Partial<MermaidOpts> = {},
) {
	const diagram = new Diagram(title);

	return Object.assign(
		function (e: PlanningEvent<any> | PlanningError) {
			// We set the default node to the event type
			let node: DiagramNode | null = null;
			switch (e.event) {
				case 'start':
					node = diagram.onStart();

					break;

				case 'find-next':
					node = diagram.onFindNext(e);

					break;

				case 'try-instruction':
					node = diagram.onTryInstruction(e);

					break;
				case 'backtrack-method':
					return diagram.onBacktracking(e);

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
			// metadata can be pretty large, so `meta` defaults
			// to `false`
			if (meta && node) {
				diagram.meta(node, e);
			}
		},
		{
			build() {
				return diagram.render();
			},
		},
	);
}
