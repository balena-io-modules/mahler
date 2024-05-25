import { expect } from '~/test-utils';
import type { Observer } from '../observable';
import { Ref } from '../ref';
import { observe } from './observe';
import type { Operation } from '../operation';

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
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/',
			target: 1,
		});
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/',
			target: 2,
		});
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/',
			target: 3,
		});
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

		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/',
			target: 1,
		});
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/',
			target: 2,
		});
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/',
			target: 3,
		});
		expect(n._).to.equal(0);
	});

	it('observes changes to strings', () => {
		const s = Ref.of('hello');

		const values: Array<Operation<string>> = [];
		const next = (o: Operation<string>) => values.push(o);

		observe((r: Ref<string>) => {
			r._ += ' world';
			r._ += ' Bob';
			r._ += ', and Alice';
		}, observerFrom(next))(s);

		expect(values.length).to.equal(3);
		expect(values).to.deep.equal([
			{
				op: 'update',
				path: '/',
				target: 'hello world',
			},
			{
				op: 'update',
				path: '/',
				target: 'hello world Bob',
			},
			{
				op: 'update',
				path: '/',
				target: 'hello world Bob, and Alice',
			},
		]);
		expect(s._).to.equal('hello world Bob, and Alice');
	});

	it('observes changes to objects', () => {
		type S = { a: number; b: { c: string; d: { e: boolean; f: number[] } } };
		const s = Ref.of<S>({ a: 1, b: { c: 'hello', d: { e: true, f: [0] } } });

		const values: Array<Operation<S>> = [];
		const next = (o: Operation<S>) => values.push(o);

		observe((r: Ref<S>) => {
			r._.a++;
			r._.b.c += ' world';
			r._.b.d.e = false;
			r._.b.d.f.push(1);
		}, observerFrom(next))(s);

		expect(values).to.have.deep.members([
			{
				op: 'update',
				path: '/a',
				target: 2,
			},
			{
				op: 'update',
				path: '/b/c',
				target: 'hello world',
			},
			{
				op: 'update',
				path: '/b/d/e',
				target: false,
			},
			{
				op: 'create',
				path: '/b/d/f/1',
				target: 1,
			},
		]);
		expect(s._).to.deep.equal({
			a: 2,
			b: { c: 'hello world', d: { e: false, f: [0, 1] } },
		});
	});

	it('observes changes to nested re-assignments', () => {
		type S = { foo?: string; bar?: S };
		const s = Ref.of<S>({ foo: 'hello', bar: { foo: 'world' } });

		const values: Array<Operation<S>> = [];
		const next = (o: Operation<S>) => values.push(structuredClone(o));

		observe((r: Ref<S>) => {
			r._.foo = 'hello world';
			r._.bar!.foo = 'world hello';
			r._.bar!.bar = { foo: 'goodbye' };
			delete r._.bar!.bar;
			r._.bar!.bar = { foo: 'goodbye' };
			r._.bar!.bar.foo = 'goodbye world';
			r._.bar = { foo: 'hello again' };
			r._.bar!.foo = 'goodbye again';
		}, observerFrom(next))(s);

		expect(values).to.have.deep.members([
			{
				op: 'update',
				path: '/foo',
				target: 'hello world',
			},
			{
				op: 'update',
				path: '/bar/foo',
				target: 'world hello',
			},
			{
				op: 'create',
				path: '/bar/bar',
				target: { foo: 'goodbye' },
			},
			{
				op: 'delete',
				path: '/bar/bar',
			},
			{
				op: 'create',
				path: '/bar/bar',
				target: { foo: 'goodbye' },
			},
			{
				op: 'update',
				path: '/bar/bar/foo',
				target: 'goodbye world',
			},
			{
				op: 'update',
				path: '/bar',
				target: { foo: 'hello again' },
			},
			{
				op: 'update',
				path: '/bar/foo',
				target: 'goodbye again',
			},
		]);
	});

	it('reverts changes to nested re-assignments', () => {
		type S = { foo?: string; bar?: S };
		const s = Ref.of<S>({ foo: 'hello', bar: { foo: 'world' } });

		const values: Array<Operation<S>> = [];
		const next = (o: Operation<S>) => values.push(structuredClone(o));

		expect(() =>
			observe((r: Ref<S>) => {
				r._.foo = 'hello world';
				r._.bar!.foo = 'world hello';
				r._.bar!.bar = { foo: 'goodbye' };
				r._.bar!.bar.foo = 'goodbye world';
				r._.bar = { foo: 'hello again' };
				r._.bar!.foo = 'goodbye again';
				throw new Error('something happened!');
			}, observerFrom(next))(s),
		).to.throw('something happened!');

		expect(values).to.have.deep.members([
			{
				op: 'update',
				path: '/foo',
				target: 'hello world',
			},
			{
				op: 'update',
				path: '/bar/foo',
				target: 'world hello',
			},
			{
				op: 'create',
				path: '/bar/bar',
				target: { foo: 'goodbye' },
			},
			{
				op: 'update',
				path: '/bar/bar/foo',
				target: 'goodbye world',
			},
			{
				op: 'update',
				path: '/bar',
				target: { foo: 'hello again' },
			},
			{
				op: 'update',
				path: '/bar/foo',
				target: 'goodbye again',
			},
			{
				op: 'update',
				path: '/',
				target: { foo: 'hello', bar: { foo: 'world' } },
			},
		]);

		expect(s._).to.deep.equal({ foo: 'hello', bar: { foo: 'world' } });
	});

	it('observes changes to nested re-assignments in arrays', () => {
		type S = { foo?: string; bar?: S[] };
		const s = Ref.of<S>({ foo: 'hello', bar: [{ foo: 'world' }] });

		const values: Array<Operation<S>> = [];
		const next = (o: Operation<S>) => values.push(structuredClone(o));

		observe((r: Ref<S>) => {
			r._.foo = 'hello world';
			r._.bar![0].foo = 'world hello';
			r._.bar![0].bar = [{ foo: 'goodbye' }];
			r._.bar![0].bar[0].foo = 'goodbye world';
			r._.bar![0] = { foo: 'hello again' };
			r._.bar![0].foo = 'goodbye again';
		}, observerFrom(next))(s);

		expect(values).to.have.deep.members([
			{
				op: 'update',
				path: '/foo',
				target: 'hello world',
			},
			{
				op: 'update',
				path: '/bar/0/foo',
				target: 'world hello',
			},
			{
				op: 'create',
				path: '/bar/0/bar',
				target: [{ foo: 'goodbye' }],
			},
			{
				op: 'update',
				path: '/bar/0/bar/0/foo',
				target: 'goodbye world',
			},
			{
				op: 'update',
				path: '/bar/0',
				target: { foo: 'hello again' },
			},
			{
				op: 'update',
				path: '/bar/0/foo',
				target: 'goodbye again',
			},
		]);
	});

	it('reverts changes to nested re-assignments in arrays', () => {
		type S = { foo?: string; bar?: S[] };
		const s = Ref.of<S>({ foo: 'hello', bar: [{ foo: 'world' }] });

		const values: Array<Operation<S>> = [];
		const next = (o: Operation<S>) => values.push(structuredClone(o));

		expect(() =>
			observe((r: Ref<S>) => {
				r._.foo = 'hello world';
				r._.bar![0].foo = 'world hello';
				r._.bar![0].bar = [{ foo: 'goodbye' }];
				r._.bar![0].bar[0].foo = 'goodbye world';
				r._.bar![0] = { foo: 'hello again' };
				r._.bar![0].foo = 'goodbye again';

				throw new Error('something happened!');
			}, observerFrom(next))(s),
		).to.throw('something happened!');

		expect(values).to.have.deep.members([
			{
				op: 'update',
				path: '/foo',
				target: 'hello world',
			},
			{
				op: 'update',
				path: '/bar/0/foo',
				target: 'world hello',
			},
			{
				op: 'create',
				path: '/bar/0/bar',
				target: [{ foo: 'goodbye' }],
			},
			{
				op: 'update',
				path: '/bar/0/bar/0/foo',
				target: 'goodbye world',
			},
			{
				op: 'update',
				path: '/bar/0',
				target: { foo: 'hello again' },
			},
			{
				op: 'update',
				path: '/bar/0/foo',
				target: 'goodbye again',
			},
			{
				op: 'update',
				path: '/',
				target: { foo: 'hello', bar: [{ foo: 'world' }] },
			},
		]);

		expect(s._).to.deep.equal({ foo: 'hello', bar: [{ foo: 'world' }] });
	});

	it('reverts changes if an error occurs while modifying an object', () => {
		type S = { a: number; b: { c: string; d: { e: boolean; f: number[] } } };
		const s = Ref.of<S>({ a: 1, b: { c: 'hello', d: { e: true, f: [0] } } });

		const values: Array<Operation<S>> = [];
		const next = (o: Operation<S>) => values.push(structuredClone(o));

		expect(() =>
			observe((r: Ref<S>) => {
				r._.a++;
				r._.b.c += ' world';
				r._.b.d.e = false;
				r._.b.d.f.push(1);
				r._.b.d.f[1] = 2;
				r._.b.d.f[2] = 2;
				r._.b.d.f.pop();

				throw new Error('something happened!');
			}, observerFrom(next))(s),
		).to.throw('something happened!');

		expect(values).to.have.deep.members([
			{
				op: 'update',
				path: '/a',
				target: 2,
			},
			{
				op: 'update',
				path: '/b/c',
				target: 'hello world',
			},
			{
				op: 'update',
				path: '/b/d/e',
				target: false,
			},
			{
				op: 'create',
				path: '/b/d/f/1',
				target: 1,
			},
			{
				op: 'update',
				path: '/b/d/f/1',
				target: 2,
			},
			{
				op: 'create',
				path: '/b/d/f/2',
				target: 2,
			},
			{
				op: 'delete',
				path: '/b/d/f/2',
			},
			{
				op: 'update',
				path: '/',
				target: { a: 1, b: { c: 'hello', d: { e: true, f: [0] } } },
			},
		]);
		expect(s._).to.deep.equal({
			a: 1,
			b: { c: 'hello', d: { e: true, f: [0] } },
		});
	});

	it('reverts changes if an error occurs while modifying an object in an async call', async () => {
		type S = { a: number; b: { c: string; d: { e: boolean; f: number[] } } };
		const s = Ref.of<S>({ a: 1, b: { c: 'hello', d: { e: true, f: [0] } } });

		const values: Array<Operation<S>> = [];
		const next = (o: Operation<S>) => values.push(structuredClone(o));

		await expect(
			observe(async (r: Ref<S>) => {
				r._.a++;
				r._.b.c += ' world';
				r._.b.d.e = false;
				r._.b.d.f.push(1);
				r._.b.d.f[1] = 2;
				r._.b.d.f[2] = 2;
				r._.b.d.f.pop();

				throw new Error('something happened!');
			}, observerFrom(next))(s),
		).to.be.rejectedWith('something happened!');

		expect(values).to.have.deep.members([
			{
				op: 'update',
				path: '/a',
				target: 2,
			},
			{
				op: 'update',
				path: '/b/c',
				target: 'hello world',
			},
			{
				op: 'update',
				path: '/b/d/e',
				target: false,
			},
			{
				op: 'create',
				path: '/b/d/f/1',
				target: 1,
			},
			{
				op: 'update',
				path: '/b/d/f/1',
				target: 2,
			},
			{
				op: 'create',
				path: '/b/d/f/2',
				target: 2,
			},
			{
				op: 'delete',
				path: '/b/d/f/2',
			},
			{
				op: 'update',
				path: '/',
				target: { a: 1, b: { c: 'hello', d: { e: true, f: [0] } } },
			},
		]);
		expect(s._).to.deep.equal({
			a: 1,
			b: { c: 'hello', d: { e: true, f: [0] } },
		});
	});
});
