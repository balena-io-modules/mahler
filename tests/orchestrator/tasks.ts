import * as Docker from 'dockerode';
import * as tar from 'tar-stream';

import { console } from '~/tests';
import { Task, Constructor, Pure } from '~/lib';
import { Device, Service, ServiceStatus } from './state';
import { getImageName, getRegistryAndName, getContainerName } from './utils';

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

// Pull an image from the registry
export const fetch = Task.of({
	op: 'create',
	path: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	condition: (device: Device, ctx) =>
		!device.images.some((img) => img.name === getImageName(ctx)),
	effect: (device, ctx) => {
		const { digest } = getRegistryAndName(ctx.target.image);
		return {
			...device,
			images: [
				...device.images,
				{
					name: getImageName(ctx),
					...(digest && { contentHash: digest }),
				},
			],
		};
	},
	action: async (device, ctx) => {
		const { registry, digest } = getRegistryAndName(ctx.target.image);

		const imageName = getImageName(ctx);
		const pack = tar.pack(); // pack is a stream

		// we use a dockerfile to add image metadata
		pack.entry(
			{ name: 'Dockerfile' },
			[
				`FROM ${ctx.target.image}`,
				`LABEL io.balena.image="${ctx.target.image}"`,
				...(digest ? [`LABEL io.balena.content-hash="${digest}"`] : []),
			].join('\n'),
		);

		pack.finalize();

		await new Promise((resolve, reject) =>
			docker
				.buildImage(pack, {
					t: imageName,

					// Add authentication to the registry if a key
					// has been provided
					...(registry &&
						device.keys[registry] && {
							authconfig: {
								username: `d_${device.uuid}`,
								password: device.keys[registry],
								serverAddress: registry,
							},
						}),
				} as Docker.ImageBuildOptions)
				.then((stream) => {
					stream.on('data', (b) => console.debug(b.toString()));
					stream.on('error', reject);
					stream.on('close', reject);
					stream.on('end', resolve);
				})
				.catch(reject),
		);

		// Get the image using the name
		const dockerImage = await docker.getImage(imageName).inspect();

		// try to delete the parent image
		await docker
			.getImage(ctx.target.image)
			.remove()
			.catch((e) =>
				console.warn(`could not remove image tag '${ctx.target.image}'`, e),
			);

		return {
			...device,
			images: [
				...device.images,
				{
					name: imageName,
					imageId: dockerImage.Id,
					...(digest && { contentHash: digest }),
				},
			],
		};
	},
	description: (ctx) =>
		`pull image '${ctx.target.image}' for service '${ctx.serviceName}' of app '${ctx.appUuid}'`,
});

export const createApp = Constructor.of({
	path: '/apps/:appUuid',
	effect: (device: Device, ctx) =>
		ctx.set(device, { name: ctx.target.name, releases: {} }),
	description: (ctx) => `prepare app '${ctx.target.name}'`,
});

export const createRelease = Constructor.of({
	path: '/apps/:appUuid/releases/:releaseUuid',
	effect: (device: Device, ctx) => ctx.set(device, { services: {} }),
	description: (ctx) => `prepare release '${ctx.releaseUuid}'`,
});

/**
 * Task to install a service, i.e. create the container if
 * it does not exist yet
 */
export const installService = Task.of({
	op: 'create',
	path: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	condition: (device: Device, ctx) =>
		// The image has already been downloaded
		device.images.some((img) => img.name === getImageName(ctx)) &&
		// The service has not been created yet
		ctx.get(device) == null,
	effect: (device: Device, ctx) => {
		return ctx.set(device, {
			...ctx.target,
			...ctx.get(device),
			status: 'created',
			containerId: 'deadbeef',
		});
	},
	action: async (device: Device, ctx) => {
		const containerName = getContainerName(ctx);

		// This is our way to update the internal agent state, we look for
		// the service before we do anything, and if it exists, we update
		// the state with the service metadata.
		const existing = await docker
			.getContainer(containerName)
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
				// QUESTION: perhaps we need to check that the existing
				// service image has the same image name in the label?
				// that should only happen if someone is trying to mess with
				// the engine state so we would need to abort
				image: ctx.target.image,
				startedAt: new Date(existing.State.StartedAt),
				createdAt: new Date(existing.Created),
				containerId: existing.Id,
				status,
				command: existing.Config.Cmd,
			};

			// If the service has a different config to what we are expecting
			// the service start step will fail and we'll need to re-plan
			return ctx.set(device, s);
		}

		const container = await docker.createContainer({
			name: containerName,
			Image: getImageName(ctx),
			Cmd: ctx.target.command || [],
			Labels: {
				'io.balena.app-uuid': ctx.appUuid,
			},
		});

		const { Id: containerId, Created } = await container.inspect();

		return ctx.set(device, {
			...ctx.target,
			...ctx.get(device),
			status: 'created',
			containerId,
			createdAt: new Date(Created),
		});
	},
	description: (ctx) =>
		`create container for service '${ctx.serviceName}' of app '${ctx.appUuid}' and release '${ctx.releaseUuid}'`,
});

export const startService = Task.of({
	op: 'update',
	path: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	condition: (device: Device, ctx) => {
		const { releases } = device.apps[ctx.appUuid];

		return (
			ctx.get(device)?.containerId != null &&
			isEqualConfig(ctx.get(device), ctx.target) &&
			ctx.get(device)?.status !== 'running' &&
			Object.keys(releases)
				.filter((u) => u !== ctx.releaseUuid)
				.every(
					// There are no services from other release still running
					(u) => releases[u].services[ctx.serviceName]?.status !== 'running',
				)
		);
	},
	effect: (device: Device, service) =>
		service.set(device, {
			...service.get(device),
			status: 'running',
		}),
	action: async (device: Device, service) => {
		const container = docker.getContainer(service.get(device).containerId!);
		await container.start().catch((e) => {
			if (isStatusError(e) && e.statusCode === 304) {
				return;
			}
			throw e;
		});

		const { State } = await container.inspect();
		// TODO: perhaps check if the container is actually running and fail if not?

		return service.set(device, {
			...service.get(device),
			status: 'running',
			startedAt: new Date(State.StartedAt),
		});
	},
	description: (ctx) =>
		`start container for service '${ctx.serviceName}' of app '${ctx.appUuid}' and release '${ctx.releaseUuid}'`,
});

export const stopService = Task.of({
	path: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	condition: (device: Device, ctx) => {
		const { releases } = device.apps[ctx.appUuid];
		return (
			ctx.get(device)?.containerId != null &&
			ctx.get(device)?.status === 'running' &&
			Object.keys(releases)
				.filter((u) => u !== ctx.releaseUuid)
				.every(
					// If there are equivalent services from other releases they should at least have a container
					(u) => releases[u].services[ctx.serviceName]?.containerId != null,
				)
		);
	},
	effect: (device: Device, service) =>
		service.set(device, {
			...service.get(device),
			status: 'stopped',
		}),
	action: async (device: Device, service) => {
		const container = docker.getContainer(service.get(device).containerId!);
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

		return service.set(device, {
			...service.get(device),
			status: 'stopped',
			finishedAt: new Date(State.FinishedAt),
		});
	},
	description: ({ serviceName, appUuid, releaseUuid }) =>
		`stop container for service '${serviceName}' of app '${appUuid}' and release '${releaseUuid}'`,
});

export const removeService = Task.of({
	op: 'delete',
	path: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	condition: (device: Device, service) =>
		service.get(device)?.containerId != null &&
		service.get(device)?.status !== 'running',
	effect: (device: Device, ctx) => ctx.del(device),
	action: async (device: Device, ctx) => {
		const container = docker.getContainer(ctx.get(device).containerId!);
		await container.remove({ v: true });

		return ctx.del(device);
	},
	description: ({ serviceName, appUuid, releaseUuid }) =>
		`remove container for service '${serviceName}' of app '${appUuid}' and release '${releaseUuid}'`,
});

export const removeRelease = Pure.of({
	op: 'delete',
	path: '/apps/:appUuid/releases/:releaseUuid',
	condition: (device: Device, ctx) =>
		ctx.get(device) != null &&
		Object.keys(ctx.get(device).services).length === 0,
	effect: (device: Device, ctx) => ctx.del(device),
	description: (ctx) => `remove release '${ctx.releaseUuid}'`,
});
