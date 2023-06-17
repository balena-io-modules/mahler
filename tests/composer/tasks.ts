import * as Docker from 'dockerode';
import { Task } from '~/lib';
import { App, Service, ServiceStatus } from './state';

interface StatusError extends Error {
	statusCode: number;
}

function isStatusError(x: unknown): x is StatusError {
	return x instanceof Error && typeof (x as any).statusCode === 'number';
}

function isEqualConfig(s1: Service, s2: Service) {
	return s1.image === s2.image && s1.command.join(' ') === s2.command.join(' ');
}

const docker = new Docker();

export const fetch = Task.of({
	path: '/services/:serviceName',
	condition: (app: App, service) =>
		!app.images.some((img) => img.name === service.target.image),
	effect: (state: App, service) => ({
		...state,
		images: [
			...state.images,
			{
				name: service.target.image,
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
		`pull image '${service.target.image}' for service '${service.serviceName}'`,
});

export const install = Task.of({
	op: 'create',
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
		// This is our way to update the internal agent state, we look for
		// the service before we do anything, and if it exists, we update
		// the state with the service metadata.
		const existing = await docker
			.getContainer(`${app.name}_${service.name}`)
			.inspect()
			.catch((e) => {
				if (isStatusError(e) && e.statusCode === 404) {
					return null;
				}
				throw e;
			});

		if (existing != null) {
			const status: ServiceStatus = (() => {
				if (existing.State.Running) {
					return 'running';
				}
				if (existing.State.ExitCode === 0) {
					return 'stopped';
				}
				return 'created';
			})();
			const s: Service = {
				image:
					(await docker.getImage(existing.Image).inspect()).RepoTags[0] ||
					existing.Image,
				startedAt: new Date(existing.State.StartedAt),
				createdAt: new Date(existing.Created),
				containerId: existing.Id,
				status,
				command: existing.Config.Cmd,
			};

			// If the service has a different config to what we are expecting
			// the service start step will fail and we'll need to re-plan
			return service.set(app, s);
		}

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

export const start = Task.of({
	path: '/services/:name',
	condition: (app: App, service) =>
		service.get(app)?.containerId != null &&
		isEqualConfig(service.get(app), service.target) &&
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

export const stop = Task.of({
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
			finishedAt: new Date(State.FinishedAt),
		});
	},
	description: ({ name }) => `stopping container for service '${name}'`,
});

export const remove = Task.of({
	path: '/services/:name',
	condition: (app: App, service) =>
		service.get(app)?.containerId != null &&
		service.get(app)?.status !== 'running',
	effect: (app: App, service) => {
		const { [service.name]: _, ...services } = app.services;
		return { ...app, services };
	},
	action: async (app: App, service) => {
		const container = docker.getContainer(service.get(app).containerId!);
		await container.remove({ v: true });

		const { [service.name]: _, ...services } = app.services;
		return { ...app, services };
	},
	description: ({ name }) => `removing container for service '${name}'`,
});