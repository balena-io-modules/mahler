import * as Docker from 'dockerode';
import { console, expect } from '~/tests';

import { Agent } from '~/lib';
import { planner } from './planner';
import { Device } from './state';

const docker = new Docker();

describe('orchestrator/agent', () => {
	const cleanup = async () => {
		const containers = await docker.listContainers({ all: true });
		await Promise.all(
			containers
				.filter(({ Names }) => Names.some((name) => name.startsWith(`/r0_`)))
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
		const agent = Agent.of<Device>({
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

		agent.start({
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

		expect(
			await agent.result(),
			'starting a single container should succeed',
		).to.deep.equal({ success: true });

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
		await agent.target({
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

		expect(
			await agent.result(),
			'stopping the container should succeed',
		).to.deep.equal({ success: true });
		expect(
			(await docker.getContainer(service.containerId!).inspect()).State,
			'container is stopped after the plan is executed',
		)
			.to.have.property('Running')
			.that.equals(false);

		await agent.target({
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									image: 'alpine:3.13',
									status: 'running',
								},
							},
						},
					},
				},
			},
		});
		expect(
			await agent.result(),
			'modifying the service image should succeed',
		).to.deep.equal({ success: true });

		const newDevice = agent.state();
		const newService = newDevice.apps.a0.releases.r0.services.main;
		expect(newService).to.not.be.undefined;
		expect(newService.containerId).to.not.be.undefined;
		expect(
			newService.containerId,
			'the container is recreated during execution',
		).to.not.equal(service.containerId);
		expect((await docker.getContainer(newService.containerId!).inspect()).State)
			.to.have.property('Running')
			.that.equals(true);
	});
});
