import * as Docker from 'dockerode';
import { console, expect } from '~/test-utils';

import { Agent } from 'mahler';
import { planner } from './planner';
import { App } from './state';

const docker = new Docker();

describe('composer/agent', () => {
	const appname = 'testapp';

	const cleanup = async () => {
		const containers = await docker.listContainers({ all: true });
		await Promise.all(
			containers
				.filter(({ Names }) =>
					Names.some((name) => name.startsWith(`/${appname}_`)),
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
		const agent = Agent.of<App>({
			initial: { name: appname, services: {}, images: [] },
			planner,
			opts: { minWaitMs: 1000, logger: console },
		});

		agent.seek({
			services: {
				main: {
					status: 'running',
					image: 'alpine:3.12',
					command: ['sleep', 'infinity'],
				},
			},
		});

		expect(await agent.wait(), 'starting a single container should succeed')
			.to.have.property('success')
			.that.equals(true);

		const service = agent.state().services.main;
		expect(service).to.not.be.undefined;
		expect(service.containerId).to.not.be.undefined;

		expect(
			(await docker.getContainer(service.containerId!).inspect()).State,
			'container is running after plan is executed',
		)
			.to.have.property('Running')
			.that.equals(true);

		// Update the target
		agent.seek({
			services: {
				main: {
					status: 'stopped',
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

		agent.seek({
			services: {
				main: {
					status: 'running',
					image: 'alpine:3.13',
				},
			},
		});
		expect(await agent.wait(), 'modifying the service image should succeed')
			.to.have.property('success')
			.that.equals(true);

		const newService = agent.state().services.main;
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
