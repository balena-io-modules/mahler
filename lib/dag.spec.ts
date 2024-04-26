import dedent from 'dedent';
import { expect } from '~/test-utils';
import type { Value } from './dag';
import { find, reduceWhile, Node, toString, mapReduce, reverse } from './dag';
import type { Label } from './testing';
import { plan, branch, fork } from './testing';

import { spy } from 'sinon';

interface Element extends Value {
	readonly id: number;
	readonly data: string;
}

const Element = {
	of(id: number, data: string): Element {
		return Node.value({ id, data });
	},
};

describe('DAG', () => {
	describe('reduceWhile', () => {
		it('visits every node in a DAG', () => {
			const root = Node.fork();
			const left = Element.of(0, 'L0');
			left.next = Element.of(1, 'L1');
			left.next.next = Element.of(2, 'L2');

			const join = Node.join();
			left.next.next.next = join;

			const rght = Element.of(3, 'R0');
			rght.next = Element.of(4, 'R1');
			rght.next.next = Element.of(5, 'R2');
			rght.next.next.next = join;
			root.next = [left, rght];

			join.next = Element.of(6, 'N3');

			const inc = spy((i) => i + 1);
			const res = reduceWhile(root, 0, inc);

			expect(res).to.equal(9);
			expect(inc.getCalls().length).to.equal(9);
		});
	});

	describe('mapReduce', () => {
		it('combines the results from forking DAG', () => {
			const root = plan()
				.fork(branch('h', 'e', 'l', 'l', 'o'), branch('w', 'o', 'r', 'l', 'd'))
				.root();
			expect(
				mapReduce(
					root,
					'',
					(l: Label, s) => s + l.id,
					(acc) => acc.join(' '),
				),
			).to.equal('hello world');
		});

		it('combines the results from multiple forks', () => {
			const root = plan()
				.fork(branch('h', 'e', 'l', 'l', 'o'), branch('m', 'y'), branch(''))
				.fork(
					branch('b', 'a', 'b', 'y', ','),
					branch('d', 'a', 'r', 'l', 'i', 'n', 'g'),
				)
				.root();
			expect(
				mapReduce(
					root,
					'',
					(l: Label, s) => s + l.id,
					(acc) => acc.join(' '),
				),
			).to.equal('hello my baby, hello my darling');
		});
	});

	describe('reverse', () => {
		it('reverses linked list', () => {
			const root = plan().actions('a', 'b', 'c', 'd').root();
			expect(toString(reverse(root), (l: Label) => l.id)).to.deep.equal(
				plan().actions('d', 'c', 'b', 'a').end(),
			);
		});

		it('reverses forking dag', () => {
			const root = plan()
				.action('a')
				.fork(branch('b', 'c'), branch('d', 'e'))
				.action('f')
				.root();
			expect(toString(reverse(root), (l: Label) => l.id)).to.deep.equal(
				plan()
					.action('f')
					.fork(branch('c', 'b'), branch('e', 'd'))
					.action('a')
					.end(),
			);
		});

		it('reverses complex dag', () => {
			const root = plan()
				.action('a')
				.fork(
					branch(fork(branch('b0', 'c0'), branch('b1', 'c1'))),
					branch('d', 'e'),
				)
				.action('f')
				.fork(branch('g', 'h'), branch(fork(branch('i'), branch('j'))))
				.action('k')
				.root();
			expect(toString(reverse(root), (l: Label) => l.id)).to.deep.equal(
				plan()
					.action('k')
					.fork(branch('h', 'g'), branch(fork(branch('i'), branch('j'))))
					.action('f')
					.fork(
						branch(fork(branch('c0', 'b0'), branch('c1', 'b1'))),
						branch('e', 'd'),
					)
					.action('a')
					.end(),
			);
		});
	});

	describe('find', () => {
		it('finds element in a linked list', () => {
			const root = Element.of(0, '0');
			let elem: Node = root;
			for (let i = 1; i < 10; i++) {
				const node = Element.of(i, i.toString());
				elem.next = node;
				elem = elem.next;
			}

			const res = find(root, (n: Element) => n.data === '10');
			expect(res).to.be.null;

			expect(find(root, (n: Element) => n.data === '5'))
				.to.have.property('data')
				.that.equals('5');
			expect(find(root, (n: Element) => n.id > 4))
				.to.have.property('data')
				.that.equals('5');
		});

		it('finds element in a branching dag', () => {
			const root = Node.fork();
			const left = Element.of(0, 'L0');
			left.next = Element.of(1, 'L1');
			left.next.next = Element.of(2, 'L2');
			left.next.next.next = Element.of(3, 'L4');
			const rght = Element.of(4, 'R0');
			rght.next = Element.of(5, 'R1');
			rght.next.next = Element.of(6, 'R2');
			rght.next.next.next = Element.of(7, 'R3');
			root.next = [left, rght];

			const res = find(root, (n: Element) => n.data === '10');
			expect(res).to.be.null;

			const lookup0 = spy((n: Element) => n.data === 'L2');
			expect(find(root, lookup0)).to.have.property('id').that.equals(2);
			expect(lookup0.getCalls().length).to.equal(3);

			const lookup1 = spy((n: Element) => n.data === 'R2');
			expect(find(root, lookup1)).to.have.property('id').that.equals(6);
			expect(lookup1.getCalls().length).to.equal(7);
		});

		it('finds element in a branching dag with continuation', () => {
			const root = Node.fork();
			const left = Element.of(0, 'L0');
			left.next = Element.of(1, 'L1');
			left.next.next = Element.of(2, 'L2');

			const join = Node.join();
			left.next.next.next = join;

			const rght = Element.of(3, 'R0');
			rght.next = Element.of(4, 'R1');
			rght.next.next = Element.of(5, 'R2');
			rght.next.next.next = join;
			root.next = [left, rght];

			join.next = Element.of(6, 'N3');

			const lookup0 = spy((n: Element) => n.data === 'N3');
			const res0 = find(root, lookup0);
			expect(res0).to.not.be.null;
			expect(res0).to.have.property('id').that.equals(6);
			expect(lookup0.getCalls().length).to.equal(7);

			const lookup1 = spy((n: Element) => n.data === 'R2');
			const res1 = find(root, lookup1);
			expect(res1).to.not.be.null;
			expect(res1).to.have.property('id').that.equals(5);
			expect(lookup1.getCalls().length).to.equal(6);
		});

		it('finds element in a DAG starting with JOIN node', () => {
			const forkNode = Node.fork();
			const root = Node.join(forkNode);
			const left = Element.of(0, 'A');

			const joinNode = Node.join();
			left.next = joinNode;

			const rght = Element.of(0, 'B');
			rght.next = joinNode;
			forkNode.next = [left, rght];

			joinNode.next = Element.of(1, 'C');

			const res0 = find(root, (n: Element) => n.data === 'A');
			expect(res0).to.not.be.null;
			expect(res0).to.have.property('data').that.equals('A');

			const res1 = find(root, (n: Element) => n.data === 'B');
			expect(res1).to.not.be.null;
			expect(res1).to.have.property('data').that.equals('B');
		});
	});

	describe('toString', () => {
		it('converts a linked list to string representation', () => {
			const root = Element.of(0, 'A');
			root.next = Element.of(1, 'B');
			root.next.next = Element.of(2, 'C');
			root.next.next.next = Element.of(3, 'D');

			expect(toString(root, (e: Element) => e.data)).to.equal(
				dedent`
					- A
					- B
					- C
					- D
				`,
			);
		});

		it('converts a branching dag to string representation', () => {
			const root = Node.fork();
			const left = Element.of(0, 'A');
			left.next = Element.of(1, 'B');

			const join = Node.join();
			left.next.next = join;

			const rght = Element.of(2, 'C');
			rght.next = Element.of(3, 'D');
			rght.next.next = Element.of(4, 'E');
			rght.next.next.next = join;
			root.next = [left, rght];

			join.next = Element.of(5, 'F');
			expect(toString(root, (e: Element) => e.data)).to.equal(
				dedent`
					+ ~ - A
					    - B
					  ~ - C
					    - D
					    - E
					- F
				`,
			);
		});

		it('converts a complex dag to string representation', () => {
			const root = Element.of(0, 'A');
			const forkNode = Node.fork();
			root.next = forkNode;
			const left = Element.of(0, 'B');
			left.next = Element.of(0, 'C');

			const f1 = Node.fork();
			left.next.next = f1;

			const f1L = Element.of(0, 'D');
			f1L.next = Element.of(0, 'E');

			const j1 = Node.join();
			f1L.next.next = j1;

			const join = Node.join();
			j1.next = join;

			const f1R = Element.of(0, 'F');
			f1R.next = j1;

			f1.next = [f1L, f1R];

			const rght = Element.of(0, 'G');
			rght.next = Element.of(0, 'H');
			rght.next.next = Element.of(0, 'I');
			rght.next.next.next = join;
			forkNode.next = [left, rght];

			join.next = Element.of(0, 'J');
			join.next.next = Element.of(0, 'K');
			expect(toString(root, (e: Element) => e.data)).to.equal(
				dedent`
					- A
					+ ~ - B
					    - C
					    + ~ - D
					        - E
					      ~ - F
					  ~ - G
					    - H
					    - I
					- J
					- K
				`,
			);
		});
	});
});
