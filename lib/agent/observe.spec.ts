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

	it('reverts changes if an error happens', () => {
		const n = Ref.of(0);

		const next = stub();

		try {
			observe((r: Ref<number>) => {
				for (let i = 0; i < 3; i++) {
					r._++;
				}
				throw new Error('something happened');
			}, observerFrom(next))(n);
		} catch {
			/* noop */
		}

		expect(next).to.have.been.calledWith(1);
		expect(next).to.have.been.calledWith(2);
		expect(next).to.have.been.calledWith(3);
		expect(n._).to.equal(0);
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

		const values: O[] = [];
		const next = (v: O) => values.push(v);

		observe((r: Ref<O>) => {
			r._.a++;
			r._.b.c += ' world';
			r._.b.d.e = false;
			r._.b.d.f.push(1);
		}, observerFrom(next))(o);

		expect(values).to.have.deep.members([
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
		]);
		expect(o._).to.deep.equal({
			a: 2,
			b: { c: 'hello world', d: { e: false, f: [0, 1] } },
		});
	});

	it('reverts changes if an error occurs while modifying an object', () => {
		type O = { a: number; b: { c: string; d: { e: boolean; f: number[] } } };
		const o = Ref.of<O>({ a: 1, b: { c: 'hello', d: { e: true, f: [0] } } });

		const values: O[] = [];
		const next = (v: O) => values.push(v);

		try {
			observe((r: Ref<O>) => {
				r._.a++;
				r._.b.c += ' world';
				r._.b.d.e = false;
				r._.b.d.f.push(1);
				r._.b.d.f[1] = 2;
				r._.b.d.f[2] = 2;
				r._.b.d.f.pop();

				throw new Error('something happened!');
			}, observerFrom(next))(o);
		} catch {
			/* noop */
		}

		expect(values).to.have.deep.members([
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
			{
				a: 2,
				b: { c: 'hello world', d: { e: false, f: [0, 2] } },
			},
			{
				a: 2,
				b: { c: 'hello world', d: { e: false, f: [0, 2, 2] } },
			},
			{
				a: 2,
				b: { c: 'hello world', d: { e: false, f: [0, 2] } },
			},
			{ a: 1, b: { c: 'hello', d: { e: true, f: [0] } } },
		]);
		expect(o._).to.deep.equal({
			a: 1,
			b: { c: 'hello', d: { e: true, f: [0] } },
		});
	});

	it('reverts changes if an error occurs while modifying an object in an async call', async () => {
		type O = { a: number; b: { c: string; d: { e: boolean; f: number[] } } };
		const o = Ref.of<O>({ a: 1, b: { c: 'hello', d: { e: true, f: [0] } } });

		const values: O[] = [];
		const next = (v: O) => values.push(v);

		try {
			await observe(async (r: Ref<O>) => {
				r._.a++;
				r._.b.c += ' world';
				r._.b.d.e = false;
				r._.b.d.f.push(1);
				r._.b.d.f[1] = 2;
				r._.b.d.f[2] = 2;
				r._.b.d.f.pop();

				throw new Error('something happened!');
			}, observerFrom(next))(o);
		} catch {
			/* noop */
		}

		expect(values).to.have.deep.members([
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
			{
				a: 2,
				b: { c: 'hello world', d: { e: false, f: [0, 2] } },
			},
			{
				a: 2,
				b: { c: 'hello world', d: { e: false, f: [0, 2, 2] } },
			},
			{
				a: 2,
				b: { c: 'hello world', d: { e: false, f: [0, 2] } },
			},
			// After failure the state gets reset to the original value
			{ a: 1, b: { c: 'hello', d: { e: true, f: [0] } } },
		]);
		expect(o._).to.deep.equal({
			a: 1,
			b: { c: 'hello', d: { e: true, f: [0] } },
		});
	});
});
