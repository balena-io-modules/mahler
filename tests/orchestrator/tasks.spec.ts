import * as Docker from 'dockerode';
import { expect } from '~/test-utils';

import type { Device } from './state';
import { fetch, installService, startService } from './tasks';
import { zip } from 'mahler/testing';

const docker = new Docker();

describe('orchestrator/tasks', () => {
	const cleanup = async (appUuid: string) => {
		const containers = await docker.listContainers({
			all: true,
			filters: {
				label: [`io.balena.app-uuid=${appUuid}`],
			},
		});
		await Promise.all(
			containers.map(({ Id, Image }) =>
				docker
					.getContainer(Id)
					.remove({ force: true })
					.then(() => docker.getImage(Image).remove({ force: true })),
			),
		);

		await docker.pruneImages({ filters: { dangling: { false: true } } });
	};

	describe('fetchService', () => {
		const doFetch = zip(
			fetch({
				appUuid: 'a0',
				releaseUuid: 'r0',
				serviceName: 'my-service',
				target: { image: 'alpine:latest', command: ['sleep', 'infinity'] },
			}),
		);

		afterEach(async () => {
			await cleanup('a0');
		});

		it('should pull an image', async () => {
			let s: Device = {
				name: 'my-device',
				uuid: 'd0',
				keys: {},
				apps: {
					a0: {
						name: 'my-app',
						releases: {},
					},
				},
				images: {},
			};

			s = await doFetch(s);
			expect(s.apps['a0']).to.not.be.undefined;
			expect(s.images).to.have.property('a0_my-service:r0');
			const { dockerId: imageId } = s.images['a0_my-service:r0']!;
			expect(imageId).to.not.be.undefined;
			expect(await docker.getImage(imageId!).inspect())
				.to.have.property('RepoTags')
				.that.contains('a0_my-service:r0');

			// The parent tag should be removed
			await expect(docker.getImage('alpine:latest').inspect()).to.be.rejected;

			// If we run the task again, it should not pull the image again
			// i.e. the image should have the same id as before
			s = await doFetch({
				name: 'my-device',
				uuid: 'd0',
				keys: {},
				apps: {
					a0: {
						name: 'my-app',
						releases: {},
					},
				},
				images: {},
			});

			expect(s.apps['a0']).to.not.be.undefined;
			expect(s.images).to.have.property('a0_my-service:r0');
			expect(s.images['a0_my-service:r0'].dockerId).to.not.be.undefined;
			expect(s.images['a0_my-service:r0'].dockerId).to.equal(imageId);
			expect(
				await docker.getImage(s.images['a0_my-service:r0'].dockerId!).inspect(),
			)
				.to.have.property('RepoTags')
				.that.contains('a0_my-service:r0');
		});
	});

	describe('installService', () => {
		let s0: Device = {
			name: 'my-device',
			uuid: 'd0',
			keys: {},
			apps: {
				a0: {
					name: 'my-app',
					releases: {
						r0: {
							services: {},
						},
					},
				},
			},
			images: {},
		};

		beforeEach(async () => {
			s0 = await zip(
				fetch({
					appUuid: 'a0',
					releaseUuid: 'r0',
					serviceName: 'my-service',
					target: { image: 'alpine:latest', command: ['sleep', 'infinity'] },
				}),
			)(s0);
		});

		afterEach(async () => {
			await cleanup('a0');
		});

		const doInstall = zip(
			installService({
				appUuid: 'a0',
				releaseUuid: 'r0',
				serviceName: 'my-service',
				target: { image: 'alpine:latest', command: ['sleep', 'infinity'] },
			}),
		);

		it('should create a container', async () => {
			let s = await doInstall(s0);
			expect(s.apps['a0']!.releases['r0']).to.not.be.undefined;
			expect(s.apps['a0']!.releases['r0']!.services['my-service']).to.not.be
				.undefined;

			const { containerId } =
				s.apps['a0']!.releases['r0']!.services['my-service']!;

			expect(containerId).to.not.be.undefined;
			const container = await docker.getContainer(containerId!).inspect();
			expect(container.Name).to.equal('/r0_my-service');
			expect(container.Config.Labels['io.balena.app-uuid']).to.equal('a0');

			// Installing again with an outated state should
			// not create a new container
			s = await doInstall(s0);
			expect(s.apps['a0']!.releases['r0']).to.not.be.undefined;
			expect(s.apps['a0']!.releases['r0']!.services['my-service']).to.not.be
				.undefined;

			expect(await docker.getContainer(containerId!).inspect())
				.to.have.property('Id')
				.that.equals(containerId);
		});
	});

	describe('startService', () => {
		let s0: Device = {
			name: 'my-device',
			uuid: 'd0',
			keys: {},
			apps: {
				a0: {
					name: 'my-app',
					releases: {
						r0: {
							services: {},
						},
					},
				},
			},
			images: {},
		};

		beforeEach(async () => {
			s0 = await zip(
				fetch({
					appUuid: 'a0',
					releaseUuid: 'r0',
					serviceName: 'my-service',
					target: { image: 'alpine:latest', command: ['sleep', 'infinity'] },
				}),
			)(s0);
			s0 = await zip(
				installService({
					appUuid: 'a0',
					releaseUuid: 'r0',
					serviceName: 'my-service',
					target: {
						image: 'alpine:latest',
						command: ['sleep', 'infinity'],
						status: 'created',
					},
				}),
			)(s0);
		});

		const doStart = zip(
			startService({
				appUuid: 'a0',
				releaseUuid: 'r0',
				serviceName: 'my-service',
				target: {
					image: 'alpine:latest',
					command: ['sleep', 'infinity'],
					status: 'running',
				},
			}),
		);

		afterEach(async () => {
			await cleanup('a0');
		});

		it('should start a container', async () => {
			let s = await doStart(s0);
			expect(s.apps['a0']!.releases['r0']).to.not.be.undefined;
			expect(s.apps['a0']!.releases['r0']!.services['my-service']).to.not.be
				.undefined;
			expect(
				s.apps['a0']!.releases['r0']!.services['my-service']!.status,
			).to.equal('running');

			const { containerId } =
				s.apps['a0']!.releases['r0']!.services['my-service']!;

			expect(containerId).to.not.be.undefined;
			const container = await docker.getContainer(containerId!).inspect();
			expect(container.Name).to.equal('/r0_my-service');
			expect(container.Config.Labels['io.balena.app-uuid']).to.equal('a0');
			expect(container.State.Status).to.equal('running');

			// Starting again with an outated state should
			// not start the container again
			s = await doStart(s0);
			expect(s.apps['a0']!.releases['r0']).to.not.be.undefined;
			expect(s.apps['a0']!.releases['r0']!.services['my-service']).to.not.be
				.undefined;

			expect(await docker.getContainer(containerId!).inspect())
				.to.have.property('Id')
				.that.equals(containerId);
		});
	});
	// TODO: add more tests for other tasks
});
