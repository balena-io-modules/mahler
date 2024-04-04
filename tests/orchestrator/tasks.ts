import * as Docker from 'dockerode';
import * as tar from 'tar-stream';

import { Task } from 'mahler';
import { logger } from '~/test-utils';
import type { Device, Service, ServiceStatus } from './state';
import { getContainerName, getImageName, getRegistryAndName } from './utils';

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

export const fetchImage = Task.of<Device>().from({
	op: 'create',
	lens: '/images/:imageTag',
	effect: (image, { target }) => {
		const { digest } = getRegistryAndName(target.name);
		image._ = {
			name: target.name,
		};
		if (digest) {
			image._.contentHash = digest;
		}
	},
	action: async (image, { target, imageTag, system: device }) => {
		const { registry, digest } = getRegistryAndName(target.name);

		const pack = tar.pack(); // pack is a stream

		// we use a dockerfile to add image metadata
		pack.entry(
			{ name: 'Dockerfile' },
			[
				`FROM ${target.name}`,
				`LABEL io.balena.image="${target.name}"`,
				...(digest ? [`LABEL io.balena.content-hash="${digest}"`] : []),
			].join('\n'),
		);

		pack.finalize();
		await new Promise((resolve, reject) =>
			docker
				.buildImage(pack, {
					t: imageTag,

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
					stream.on('data', (b) => logger.debug(b.toString()));
					stream.on('error', reject);
					stream.on('close', reject);
					stream.on('end', resolve);
				})
				.catch(reject),
		);

		// Get the image using the name
		const dockerImage = await docker.getImage(imageTag).inspect();

		// try to delete the parent image
		await docker
			.getImage(target.name)
			.remove()
			.catch((e) =>
				logger.warn(`could not remove image tag '${target.name}'`, e),
			);

		image._ = {
			name: target.name,
			dockerId: dockerImage.Id,
		};
		if (digest) {
			image._.contentHash = digest;
		}
	},
	description: ({ imageTag, target }) =>
		`pull image '${target.name}' with tag '${imageTag}'`,
});

/**
 * Pull an image from the registry, this task is applicable to
 * the creation of a service, as pulling an image is only needed
 * in that case.
 *
 * Condition: the image is not already present in the device
 * Effect: add the image to the list of images
 * Action: pull the image from the registry and set the image tag to match the app uuid and release before adding it to the list of images
 */
export const fetch = Task.of<Device>().from({
	op: 'create',
	lens: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	// Only pull the image if it's not already present
	method: (_, ctx) =>
		fetchImage({
			imageTag: getImageName(ctx),
			target: { name: ctx.target.image },
		}),
	description: (ctx) =>
		`pull image '${ctx.target.image}' for service '${ctx.serviceName}' of app '${ctx.appUuid}'`,
});

/**
 * Initialize an app
 *
 * The planner cannot infer what is an "empty" app, so we need to define
 * an initializer task that creates an empty app object in the state.
 *
 * Because we are using the `create` operation, the task condition automatically
 * checks that the object is not already present in the state.
 */
export const createApp = Task.of<Device>().from({
	op: 'create',
	lens: '/apps/:appUuid',
	effect: (app, { target }) => {
		app._ = {
			name: target.name,
			releases: {},
		};
	},
	// Without a description the initializer will default to "create '/apps/a0'"
});

/**
 * Initialize release
 *
 * The planner cannot infer what is an "empty" release, so we need to define
 * an initializer task that creates an empty object in the state.
 *
 * Because we are using the `create` operation, the task condition automatically
 * checks that the object is not already present in the state.
 */
export const createRelease = Task.of<Device>().from({
	op: 'create',
	lens: '/apps/:appUuid/releases/:releaseUuid',
	// Return an empty release
	effect: (release) => {
		release._ = { services: {} };
	},
	// Without a function definition that defines what the parent 'State'
	// object is, the compiler cannot infer the type of `ctx` so we just use
	// any here
	description: ({ releaseUuid, appUuid }) =>
		`initialize release '${releaseUuid}' for app '${appUuid}'`,
});

/**
 * Create a new service container from service data
 *
 * Condition: the service is not already present in the `services` object and the service image has already been downloaded
 * Effect: add the service to the `services` object, with a `status` of `created`
 * Action: create a new container using the docker API and set the `containerId` property of the service in the `services` object
 */
export const installService = Task.of<Device>().from({
	op: 'create',
	lens: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	condition: (_, { system, ...ctx }) =>
		// The image has already been downloaded
		getImageName(ctx) in system.images,
	effect: (service, { target }) => {
		service._ = {
			image: target.image,
			command: target.command || [],
			status: 'created',
		};
		service._.containerId = 'deadbeef';
	},
	action: async (service, { target, ...ctx }) => {
		const containerName = getContainerName(ctx);

		// This is our way to update the internal agent state, we look for
		// the service before we do anything, and if it exists, we update
		// the state with the service metadata.
		// Note that this will probably cause actions further on the plan to
		// fail if the condition is that the container should have a `created` state.
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
				image: target.image,
				startedAt: new Date(existing.State.StartedAt),
				createdAt: new Date(existing.Created),
				containerId: existing.Id,
				status,
				command: existing.Config.Cmd,
			};

			// If the service has a different config to what we are expecting
			// the service start step will fail and we'll need to re-plan
			service._ = s;

			return;
		}

		const container = await docker.createContainer({
			name: containerName,
			Image: getImageName(ctx),
			Cmd: target.command || [],
			Labels: {
				'io.balena.app-uuid': ctx.appUuid,
			},
		});

		const { Id: containerId, Created } = await container.inspect();

		service._ = {
			image: target.image,
			command: target.command || [],
			status: 'created',
			containerId,
			createdAt: new Date(Created),
		};
	},
	description: ({ serviceName, appUuid, releaseUuid }) =>
		`create container for service '${serviceName}' of app '${appUuid}' and release '${releaseUuid}'`,
});

/**
 * Start a service container
 *
 * Condition: the service container has been created (it has a container id), the container not running, the container configuration
 *            matches the target configuration, and there is no other service with the same name from another release running
 * Effect: set the service status to `running`
 * Action: start the container using the docker API
 */
export const startService = Task.of<Device>().from({
	lens: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	// Because we are dealing with releases, this has a more
	// complex condition than the composer example
	condition: (
		service,
		{ releaseUuid, appUuid, serviceName, system: device, target },
	) => {
		const { releases } = device.apps[appUuid];

		// The task can be applied if the following conditions are met:
		return (
			// The container has been created
			service.containerId != null &&
			// The configuration of the existing container matches the target
			isEqualConfig(service, target) &&
			// The container is not running yet
			service.status !== 'running' &&
			// And if there is a service with the same name from other release, that
			// service cannot be running
			Object.keys(releases)
				.filter((u) => u !== releaseUuid)
				.every((u) => releases[u].services[serviceName]?.status !== 'running')
		);
	},
	effect: (service) => {
		service._.status = 'running';
	},
	action: async (service) => {
		const container = docker.getContainer(service._.containerId!);
		await container.start().catch((e) => {
			if (isStatusError(e) && e.statusCode === 304) {
				return;
			}
			throw e;
		});

		const { State } = await container.inspect();
		// TODO: perhaps check if the container is actually running and fail if not?
		service._.status = 'running';
		service._.startedAt = new Date(State.StartedAt);
	},
	description: ({ serviceName, appUuid, releaseUuid }) =>
		`start container for service '${serviceName}' of app '${appUuid}' and release '${releaseUuid}'`,
});

/**
 * Rename a service between releases if the image and service configuration has not changed
 *
 * Condition: the service exists (it has a container id), the container is not running, the container configuration
 *            matches the target configuration, and source and target images are the same
 * Effect: move the service from the source release to the target release
 * Action: rename the container using the docker API
 */
export const migrateService = Task.of<Device>().from({
	op: 'create',
	lens: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	condition: (
		_,
		{ appUuid, releaseUuid, serviceName, system: device, target },
	) => {
		const { releases } = device.apps[appUuid];
		const [currentRelease] = Object.keys(releases).filter(
			(u) => u !== releaseUuid,
		);
		const currService = releases[currentRelease]?.services[serviceName];
		return (
			currService != null &&
			isEqualConfig(currService, target) &&
			target.image === currService.image
		);
	},
	effect: (service, { system: device, appUuid, serviceName, releaseUuid }) => {
		const { releases } = device.apps[appUuid];
		const currRelease = Object.keys(releases).find((u) => u !== releaseUuid)!;
		const currService = releases[currRelease]?.services[serviceName];

		// Remove the release from the current release
		delete releases[currRelease].services[serviceName];

		// Move the service to the new release
		service._ = currService;
	},
	action: async (
		service,
		{ system: device, appUuid, serviceName, releaseUuid },
	) => {
		const { releases } = device.apps[appUuid];
		const currRelease = Object.keys(releases).find((u) => u !== releaseUuid)!;

		const currService = releases[currRelease]?.services[serviceName];
		delete releases[currRelease].services[serviceName];

		// Rename the container
		await docker.getContainer(currService.containerId!).rename({
			name: getContainerName({ releaseUuid, serviceName }),
		});

		// Move the container to the new release
		service._ = currService;
	},
	description: (ctx) =>
		`migrate unchanged service '${ctx.serviceName}' of app '${ctx.appUuid} to release '${ctx.releaseUuid}' '`,
});

/**
 * Stop a service container
 *
 * This task is applicable to `update` operations, e.g when purposely stopping a service,
 * and `delete` operations, e.g. when uninstalling a release
 *
 * Condition: the service exists (it has a container id), the container is running, and
 *            if there are other services with the same name from other releases, their containers
 *            have already been created
 * Effect: set the service status to `stopped`
 * Action: stop the container using the docker API
 */
export const stopService = Task.of<Device>().from({
	// Stop is applicable to a service delete or update
	op: '*',
	lens: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	condition: (
		service,
		{ system: device, appUuid, releaseUuid, serviceName },
	) => {
		const { releases } = device.apps[appUuid];
		return (
			service?.containerId != null &&
			service?.status === 'running' &&
			Object.keys(releases)
				.filter((u) => u !== releaseUuid)
				.every(
					// If there are equivalent services from other releases they should at least have a container
					(u) => releases[u].services[serviceName]?.containerId != null,
				)
		);
	},
	effect: (service) => {
		service._.status = 'stopped';
	},
	action: async (service) => {
		const container = docker.getContainer(service._.containerId!);
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

		service._.status = 'stopped';
		service._.finishedAt = new Date(State.FinishedAt);
	},
	description: ({ serviceName, appUuid, releaseUuid }) =>
		`stop container for service '${serviceName}' of app '${appUuid}' and release '${releaseUuid}'`,
});

/**
 * Remove a service container
 *
 * This task is applicable to `update` operations, e.g. when recreating a container or `delete`
 * operations, e.g. when removing a release
 *
 * Condition: the service exists (it has a container id), the container is not running
 * Effect: remove the service from the device state
 * Action: remove the container using the docker API
 */
export const removeService = Task.of<Device>().from({
	op: '*',
	lens: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	condition: (service) =>
		service?.containerId != null && service?.status !== 'running',
	effect: (service) => service.delete(),
	action: async (service) => {
		const container = docker.getContainer(service._.containerId!);
		await container.remove({ v: true });

		service.delete();
	},
	description: ({ serviceName, appUuid, releaseUuid }) =>
		`remove container for service '${serviceName}' of app '${appUuid}' and release '${releaseUuid}'`,
});

/**
 * Remove a release
 *
 * This only removes the release from the state object and has no effect in the system
 *
 * This task uses the Disposer task helper that already performs some checks and does the actual
 * removal of the property from the state object. For that reason no `effect` is defined
 *
 * Condition: the release has not been deleted yet and the release has no services
 * Effect: cleanup the release from the device state
 */
export const removeRelease = Task.of<Device>().from({
	op: 'delete',
	lens: '/apps/:appUuid/releases/:releaseUuid',
	condition: (release) => Object.keys(release.services).length === 0,
	effect: () => {
		/* void */
	},
	description: (ctx) => `remove release '${ctx.releaseUuid}'`,
});

/**
 * Remove an app
 *
 * This only removes the app from the state object and has no effect in the system
 *
 * This task uses the Disposer task helper that already performs some checks and does the actual
 * removal of the property from the state object. For that reason no `effect` is defined
 *
 * Condition: the app has not been deleted yet and all releases have been uninstalled
 * Effect: remove the app from the device state
 */
export const removeApp = Task.of<Device>().from({
	op: 'delete',
	lens: '/apps/:appUuid',
	effect: () => void 0,
	condition: (app) => Object.keys(app.releases).length === 0,
	description: (ctx) => `remove app '${ctx.appUuid}'`,
});
