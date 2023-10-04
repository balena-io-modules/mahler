import { expect } from '~/test-utils';
import { Observer } from '../observable';
import { Ref } from '../ref';
import { observe } from './observe';

import { stub } from 'sinon';

describe('observe', () => {
	function observerFrom<T>(next: (t: T) => void): Observer<T> {
		return {
			next,
			error: () => void 0,
			complete: () => void 0,
		};
	}

	it('observes changes to numbers', () => {
		const n = Ref.of(0);

		const next = stub();

		observe((r: Ref<number>) => {
			for (let i = 0; i < 3; i++) {
				r._++;
			}
		}, observerFrom(next))(n);

		expect(next).to.have.been.calledThrice;
		expect(next).to.have.been.calledWith(1);
		expect(next).to.have.been.calledWith(2);
		expect(next).to.have.been.calledWith(3);
		expect(n._).to.equal(3);
	});

	it('observes changes to strings', () => {
		const s = Ref.of('hello');

		const next = stub();

		observe((r: Ref<string>) => {
			r._ += ' world';
			r._ += ' Bob';
			r._ += ', and Alice';
		}, observerFrom(next))(s);

		expect(next).to.have.been.calledThrice;
		expect(next).to.have.been.calledWith('hello world');
		expect(next).to.have.been.calledWith('hello world Bob');
		expect(next).to.have.been.calledWith('hello world Bob, and Alice');
		expect(s._).to.equal('hello world Bob, and Alice');
	});

	it('observes changes to objects', () => {
		type O = { a: number; b: { c: string; d: { e: boolean; f: number[] } } };
		const o = Ref.of<O>({ a: 1, b: { c: 'hello', d: { e: true, f: [0] } } });

		const values: string[] = [];
		const next = (v: O) => values.push(JSON.stringify(v));

		observe((r: Ref<O>) => {
			r._.a++;
			r._.b.c += ' world';
			r._.b.d.e = false;
			r._.b.d.f.push(1);
		}, observerFrom(next))(o);

		expect(values).to.have.deep.members(
			[
				{
					a: 2,
					b: { c: 'hello', d: { e: true, f: [0] } },
				},
				{
					a: 2,
					b: { c: 'hello world', d: { e: true, f: [0] } },
				},
				{
					a: 2,
					b: { c: 'hello world', d: { e: false, f: [0] } },
				},
				{
					a: 2,
					b: { c: 'hello world', d: { e: false, f: [0, 1] } },
				},
			].map((v) => JSON.stringify(v)),
		);
		expect(o._).to.deep.equal({
			a: 2,
			b: { c: 'hello world', d: { e: false, f: [0, 1] } },
		});
	});
});
