import { expect } from '~/test-utils';
import { Effect, IO } from './effect';

import { stub } from 'sinon';

describe('Effect', () => {
	it('allows chaining calculations', () => {
		const effect = Effect.of(0).map((x) => x + 1);
		expect(effect()).to.equal(1);
	});

	it('allows a sync and async executions', async () => {
		const effect = Effect.of(0)
			.map((x) => x + 1)
			.flatMap((x) =>
				Effect.from(
					async () => x + 2,
					() => x + 1,
				),
			)
			.flatMap((x) =>
				Effect.from(
					async () => x + 1,
					() => x + 1,
				),
			);
		expect(effect()).to.equal(3);
		expect(await effect).to.equal(4);
	});

	it('propagates errors in a promise', async () => {
		const effect = Effect.of(0)
			.map((x) => x + 1)
			.flatMap((x) =>
				Effect.from(
					async () => {
						if (x < 2) {
							throw new Error('x is too small');
						}
						// This will never be reached
						return x + 2;
					},
					() => x + 1,
				),
			)
			.flatMap((x) =>
				Effect.from(
					async () => x + 1,
					() => x + 1,
				),
			);
		expect(effect()).to.equal(3);
		await expect(effect).to.be.rejected;
	});
});

it('allows using an async generator as IO', async () => {
	const effect = Effect.of(0)
		.map((x) => x + 1)
		.flatMap((x) =>
			IO(
				async function* () {
					yield x + 1;
					yield x + 2;
				},
				() => x + 1,
			),
		)
		.map((x) => x + 1);

	const next = stub();

	// Create a new promise to wait for the effect to
	// finish
	const promise = new Promise<void>((resolve, reject) => {
		const subscriber = effect.subscribe({
			next,
			error: reject,
			complete: () => {
				resolve();
				subscriber.unsubscribe();
			},
		});
	});
	await promise;
	expect(effect()).to.equal(3);
	expect(next).to.have.been.calledTwice;
	expect(next).to.have.been.calledWith(3);
	expect(next).to.have.been.calledWith(4);
	expect(await effect).to.equal(4);
});
