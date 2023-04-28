import { expect } from '~/tests';

import { Task, Planner, Agent } from '~/lib';
import * as Docker from 'dockerode';

type ServiceStatus = 'created' | 'stopped' | 'running';

interface Service {
	readonly image: string;
	readonly status?: ServiceStatus;
	readonly createdAt?: Date;
	readonly startedAt?: Date;
	readonly finishedAt?: Date;
	readonly containerId?: string;
	readonly command: string[];
}

interface Image {
	readonly name: string;
	readonly tag?: string;
	readonly imageId?: string;
}

type App = {
	name: string;
	services: Record<string, Service>;
	images: Image[];
};

interface StatusError extends Error {
	statusCode: number;
}

function isStatusError(x: unknown): x is StatusError {
	return x instanceof Error && typeof (x as any).statusCode === 'number';
}

const docker = new Docker();

const fetch = Task.of({
	path: '/services/:name',
	condition: (app: App, service) =>
		!app.images.some((img) => img.name === service.target.image),
	effect: (state: App, service) => ({
		...state,
		images: [
			...state.images,
			{
				name: service.target.image,
				tag: `${state.name}_${service.name}:latest`,
			},
		],
	}),
	action: async (app: App, service) => {
		await new Promise((resolve, reject) =>
			docker
				.pull(service.target.image)
				.catch(reject)
				.then((stream) => {
					stream.on('data', () => void 0);
					stream.on('error', reject);
					stream.on('close', resolve);
					stream.on('finish', resolve);
				}),
		);

		// Get the image using the name
		const dockerImage = await docker.getImage(service.target.image).inspect();

		return {
			...app,
			images: [
				...app.images,
				{ name: service.target.image, imageId: dockerImage.Id },
			],
		};
	},
	description: (service) =>
		`pulling image '${service.target.image}' for service '${service.name}'`,
});

const install = Task.of({
	path: '/services/:name',
	condition: (app: App, service) =>
		app.images.some((img) => img.name === service.target.image) &&
		service.get(app)?.status == null,
	effect: (app: App, service) =>
		service.set(app, {
			...service.target,
			...service.get(app),
			status: 'created',
			// We just need a random string here
			containerId: 'deadbeef',
		}),
	action: async (app: App, service) => {
		const container = await docker.createContainer({
			name: `${app.name}_${service.name}`,
			Image: service.target.image,
			Cmd: service.target.command || [],
		});

		const { Id: containerId, Created } = await container.inspect();

		return service.set(app, {
			...service.target,
			...service.get(app),
			status: 'created',
			containerId,
			createdAt: new Date(Created),
		});
	},
	description: ({ name }) => `installing container for service '${name}'`,
});

const start = Task.of({
	path: '/services/:name',
	condition: (app: App, service) =>
		service.get(app)?.containerId != null &&
		service.get(app)?.status !== 'running',
	effect: (app: App, service) =>
		service.set(app, {
			...service.get(app),
			status: 'running',
		}),
	action: async (app: App, service) => {
		const container = docker.getContainer(service.get(app).containerId!);
		await container.start();

		const { State } = await container.inspect();

		return service.set(app, {
			...service.get(app),
			status: 'running',
			startedAt: new Date(State.StartedAt),
		});
	},
	description: ({ name }) => `starting container for service '${name}'`,
});

const stop = Task.of({
	path: '/services/:name',
	condition: (app: App, service) =>
		service.get(app)?.containerId != null &&
		service.get(app)?.status === 'running',
	effect: (app: App, service) =>
		service.set(app, {
			...service.get(app),
			status: 'stopped',
		}),
	action: async (app: App, service) => {
		const container = docker.getContainer(service.get(app).containerId!);
		await container.stop().catch((e) => {
			if (isStatusError(e)) {
				if (e.statusCode !== 304 && e.statusCode !== 404) {
					throw e;
				}
			} else {
				throw e;
			}
		});

		const { State } = await container.inspect();

		return service.set(app, {
			...service.get(app),
			status: 'stopped',
			startedAt: new Date(State.FinishedAt),
		});
	},
	description: ({ name }) => `stopping container for service '${name}'`,
});

const planner = Planner.of<App>([fetch, install, start, stop]);

describe('container-compose', () => {
	describe('plan', () => {
		it('pulls images if it does not exist yet', () => {
			const app = {
				name: 'test',
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sleep', 'infinity'],
					},
				},
				images: [],
			};

			const plan = planner.plan(app, {
				services: {
					main: {
						status: 'running',
					},
				},
			});

			expect(plan.map((a) => a.description)).to.deep.equal([
				"pulling image 'alpine:latest' for service 'main'",
				"installing container for service 'main'",
				"starting container for service 'main'",
			]);
		});

		it('skips pull if it image already exists', () => {
			const app = {
				name: 'test',
				services: {},
				images: [{ name: 'alpine:latest', imageId: '123' }],
			};

			const plan = planner.plan(app, {
				services: {
					main: {
						status: 'running',
						image: 'alpine:latest',
						command: ['sleep', 'infinity'],
					},
				},
			});

			expect(plan.map((a) => a.description)).to.deep.equal([
				"installing container for service 'main'",
				"starting container for service 'main'",
			]);
		});

		it('stops running service if target state is "stopped"', () => {
			const app = {
				name: 'test',
				services: {
					main: {
						status: 'running' as ServiceStatus,
						image: 'alpine:latest',
						containerId: 'deadbeef',
						command: ['sleep', 'infinity'],
					},
				},
				images: [{ name: 'alpine:latest', imageId: '123' }],
			};

			const plan = planner.plan(app, {
				services: {
					main: {
						status: 'stopped',
					},
				},
			});

			expect(plan.map((a) => a.description)).to.deep.equal([
				"stopping container for service 'main'",
			]);
		});

		it('installs and stops service if service does not exist and target state is "stopped"', () => {
			const app = {
				name: 'test',
				services: {},
				images: [],
			};

			const plan = planner.plan(app, {
				services: {
					main: {
						status: 'stopped',
						image: 'alpine:latest',
						containerId: 'deadbeef',
						command: ['sleep', 'infinity'],
					},
				},
			});

			expect(plan.map((a) => a.description)).to.deep.equal([
				"pulling image 'alpine:latest' for service 'main'",
				"installing container for service 'main'",
				"starting container for service 'main'",
				"stopping container for service 'main'",
			]);
		});
	});

	describe('agent', () => {
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

			await docker.pruneImages();
		};

		beforeEach(async () => {
			await cleanup();
		});

		after(async () => {
			await cleanup();
		});

		it('runs the plan', async () => {
			const agent = Agent.of<App>({
				initial: { name: appname, services: {}, images: [] },
				tasks: [fetch, install, start],
				opts: { pollIntervalMs: 1000 },
			});

			agent.start({
				services: {
					main: {
						status: 'running',
						image: 'alpine:latest',
						command: ['sleep', 'infinity'],
					},
				},
			});

			expect(await agent.result())
				.to.have.property('success')
				.that.equals(true);

			const service = agent.state().services.main;
			expect(service).to.not.be.undefined;
			expect(service.containerId).to.not.be.undefined;

			expect(await docker.getContainer(service.containerId!).inspect())
				.to.have.property('Name')
				.that.equals('/testapp_main');
		});
	});
});
