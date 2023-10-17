import { expect } from '~/test-utils';
import { Observable } from './observable';
import { promisify } from 'util';

import { stub, useFakeTimers } from 'sinon';

const interval = (period: number): Observable<number> => {
	const sleep = promisify(setTimeout);
	return Observable.from(
		(async function* () {
			let i = 0;
			while (true) {
				await sleep(period);
				yield i++;
			}
		})(),
	);
};

describe('Observable', () => {
	let clock: sinon.SinonFakeTimers;

	beforeEach(() => {
		clock = useFakeTimers();
	});

	afterEach(() => {
		clock.restore();
	});

	it('creates observables from promises', async () => {
		const o = Observable.from(Promise.resolve(42));

		// Add a subscriber
		const next = stub();

		const promise = new Promise<void>((resolve, reject) => {
			const subscriber = o.subscribe({
				next,
				error: reject,
				complete: () => {
					resolve();
					subscriber.unsubscribe();
				},
			});
		});
		await promise;
		expect(next).to.have.been.calledOnce;
		expect(next).to.have.been.calledWith(42);
	});

	it('creates observables from values', async () => {
		const o = Observable.of(42);

		// Add a subscriber
		const next = stub();

		const promise = new Promise<void>((resolve, reject) => {
			const subscriber = o.subscribe({
				next,
				error: reject,
				complete: () => {
					resolve();
					subscriber.unsubscribe();
				},
			});
		});
		await promise;
		expect(next).to.have.been.calledOnce;
		expect(next).to.have.been.calledWith(42);
	});

	it('only starts reading values when a subscriber is added', async () => {
		const read = stub();
		const o = interval(10).map(read);

		// The sensor function should not be called before a subscriber is added
		expect(read).to.not.have.been.called;

		// Add a subscriber
		const next = stub();
		const subscriber = o.subscribe(next);

		await clock.tickAsync(30);

		// Only now the sensor function should be called
		expect(read).to.have.been.calledThrice;
		expect(next).to.have.been.calledThrice;

		subscriber.unsubscribe();
	});

	it('returns a stream of values', async () => {
		const o = interval(10);

		// Add a subscriber
		const next = stub();
		const subscriber = o.subscribe(next);

		await clock.tickAsync(30);

		// Only now the sensor function should be called
		expect(next).to.have.been.calledThrice;
		expect(next).to.have.been.calledWith(0);
		expect(next).to.have.been.calledWith(1);
		expect(next).to.have.been.calledWith(2);

		subscriber.unsubscribe();

		const next2 = stub();

		// Testing unsubcribe
		next.reset();
		const subscriber2 = o.subscribe(next2);
		await clock.tickAsync(30);

		expect(next2).to.have.been.calledThrice;
		expect(next2).to.have.been.calledWith(3);
		expect(next2).to.have.been.calledWith(4);
		expect(next2).to.have.been.calledWith(5);
		expect(next).to.not.have.been.called;

		subscriber2.unsubscribe();
	});

	it('multiplexes iterable values between subscribers', async () => {
		const o = interval(10);

		// Add a subscriber
		const next = stub();
		const next2 = stub();
		const subscriber = o.subscribe(next);
		const subscriber2 = o.subscribe(next2);

		await clock.tickAsync(30);

		// Only now the sensor function should be called
		expect(next).to.have.been.calledThrice;
		expect(next2).to.have.been.calledThrice;
		expect(next).to.have.been.calledWith(0);
		expect(next2).to.have.been.calledWith(0);
		expect(next).to.have.been.calledWith(1);
		expect(next2).to.have.been.calledWith(1);
		expect(next).to.have.been.calledWith(2);
		expect(next2).to.have.been.calledWith(2);

		subscriber.unsubscribe();

		next.reset();
		next2.reset();
		await clock.tickAsync(10);

		// Since the first subscriber unsubscribed, no more
		// values should be emitted
		expect(next).to.not.have.been.called;
		expect(next2).to.have.been.calledWith(3);

		subscriber2.unsubscribe();
	});

	it('allows mapping over values', async () => {
		const o = interval(10).map((x) => x * 2);

		// Add a subscriber
		const next = stub();
		const subscriber = o.subscribe(next);

		await clock.tickAsync(30);

		// Only now the sensor function should be called
		expect(next).to.have.been.calledThrice;
		expect(next).to.have.been.calledWith(0);
		expect(next).to.have.been.calledWith(2);
		expect(next).to.have.been.calledWith(4);

		subscriber.unsubscribe();
	});

	it('propagates errors', async () => {
		const letters = Observable.from(
			(function* () {
				yield 'a';
				yield 'b';
				throw new Error('test');
			})(),
		);

		// Add a subscriber
		const next = stub();

		const promise = new Promise<void>((resolve, reject) => {
			const subscriber = letters.subscribe({
				next,
				error: reject,
				complete: () => {
					resolve();
					subscriber.unsubscribe();
				},
			});
		});
		await expect(promise).to.be.rejected;
		expect(next).to.have.been.calledTwice;
		expect(next).to.have.been.calledWith('a');
		expect(next).to.have.been.calledWith('b');
	});

	it('ignores the error if no error handler is provided', async () => {
		const letters = Observable.from(
			(function* () {
				yield 'a';
				yield 'b';
				throw new Error('test');
			})(),
		);

		const next = stub();
		const rejection = stub();

		// This will produce an unhandled rejection
		process.once('unhandledRejection', rejection);

		const subscriber = letters.subscribe(next);
		// There is no clock here, but observable promisifies the called function
		// whether it is async or not so we need
		// to await something in order for the observable to get a chance to complete
		await clock.tickAsync(10);
		expect(rejection).to.have.been.called;
		subscriber.unsubscribe();
	});
});
