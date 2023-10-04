import * as Docker from 'dockerode';
import { console, expect } from '~/test-utils';

import { Agent, DELETED } from 'mahler';
import { planner } from './planner';
import { Device } from './state';

const docker = new Docker();

describe('orchestrator/agent', () => {
	const cleanup = async () => {
		const containers = await docker.listContainers({ all: true });
		await Promise.all(
			containers
				.filter(({ Names }) =>
					Names.some(
						(name) => name.startsWith(`/r0_`) || name.startsWith('/r1_'),
					),
				)
				.map(({ Id }) => docker.getContainer(Id).remove({ force: true })),
		);

		await docker.pruneImages({ filters: { dangling: { false: true } } });
	};

	beforeEach(async () => {
		await cleanup();
	});

	after(async () => {
		await cleanup();
	});

	it('can execute a single service plan', async () => {
		const agent = Agent.from<Device>({
			initial: {
				name: 'test-device',
				uuid: 'd0',
				apps: {},
				keys: {},
				images: [],
			},
			planner,
			opts: { minWaitMs: 1000, logger: console },
		});

		agent.seek({
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									image: 'alpine:latest',
									command: ['sleep', 'infinity'],
									status: 'running',
								},
							},
						},
					},
				},
			},
		});

		expect(await agent.wait(), 'starting a single container should succeed')
			.to.have.property('success')
			.that.equals(true);

		const device = agent.state();
		expect(device.apps.a0).to.not.be.undefined;
		expect(device.apps.a0.releases).to.not.be.undefined;
		expect(device.apps.a0.releases.r0).to.not.be.undefined;
		expect(device.apps.a0.releases.r0.services).to.not.be.undefined;

		const service = device.apps.a0.releases.r0.services.main;
		expect(service).to.not.be.undefined;
		expect(service.containerId).to.not.be.undefined;

		expect(
			(await docker.getContainer(service.containerId!).inspect()).State,
			'container is running after plan is executed',
		)
			.to.have.property('Running')
			.that.equals(true);

		// Update the target
		console.info('Stopping container');
		agent.seek({
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									status: 'stopped',
								},
							},
						},
					},
				},
			},
		});

		expect(await agent.wait(), 'stopping the container should succeed')
			.to.have.property('success')
			.that.equals(true);
		expect(
			(await docker.getContainer(service.containerId!).inspect()).State,
			'container is stopped after the plan is executed',
		)
			.to.have.property('Running')
			.that.equals(false);

		console.info('Restarting container');
		agent.seek({
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									status: 'running',
								},
							},
						},
					},
				},
			},
		});
		expect(await agent.wait(), 'starting the container should succeed')
			.to.have.property('success')
			.that.equals(true);
		expect(
			(await docker.getContainer(service.containerId!).inspect()).State,
			'container is running after the plan is executed',
		)
			.to.have.property('Running')
			.that.equals(true);

		// Update to a new release
		console.info('Update to a new release');
		agent.seek({
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: DELETED,
						r1: {
							services: {
								main: {
									image: 'alpine:3.13',
									status: 'running',
									command: ['sleep', 'infinity'],
								},
							},
						},
					},
				},
			},
		});
		expect(await agent.wait(), 'updating to a new release should succeed')
			.to.have.property('success')
			.that.equals(true);

		const newDevice = agent.state();
		const newService = newDevice.apps.a0.releases.r1.services.main;
		expect(newService).to.not.be.undefined;
		expect(newService.containerId).to.not.be.undefined;
		expect(newDevice.apps.a0.releases.r0).to.be.undefined;
		expect(
			newService.containerId,
			'the container is recreated during execution',
		).to.not.equal(service.containerId);
		expect((await docker.getContainer(newService.containerId!).inspect()).State)
			.to.have.property('Running')
			.that.equals(true);

		// Update to a new release
		console.info('Uninstall app');
		agent.seek({
			apps: {
				a0: DELETED,
			},
		});
		expect(await agent.wait(), 'delete the release should succeed')
			.to.have.property('success')
			.that.equals(true);

		expect(agent.state().apps).to.be.empty;
		await expect(docker.getContainer('r1_main').inspect()).to.be.rejected;
	});
});
