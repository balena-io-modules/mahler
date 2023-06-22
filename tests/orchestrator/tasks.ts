import * as Docker from 'dockerode';
import * as tar from 'tar-stream';

import { console } from '~/tests';
import { Task, Constructor, Pure, DELETED, Target } from '~/lib';
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

/**
 * Pull an image from the registry, this task is applicable to
 * the creation of a service, as pulling an image is only needed
 * in that case.
 *
 * Condition: the image is not already present in the device
 * Effect: add the image to the list of images
 * Action: pull the image from the registry and set the image tag to match the app uuid and release before adding it to the list of images
 */
export const fetch = Task.of({
	op: 'create',
	path: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	// Only pull the image if it's not already present
	condition: (device: Device, ctx) =>
		!device.images.some((img) => img.name === getImageName(ctx)),
	// The effect of this task is to add the image to the device
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

/**
 * Update the apps state with the new app data
 *
 * Condition: the app is not already present in the `apps` object
 * Effect: add the app to the `apps` object, with an empty `releases` object
 * Action: none, this does not have any effect on the system
 */
export const createApp = Constructor.of({
	path: '/apps/:appUuid',
	effect: (device: Device, ctx) =>
		ctx.set(device, { name: ctx.target.name, releases: {} }),
	description: (ctx) => `prepare app '${ctx.target.name}'`,
});

/**
 * Update the app state with the new release data
 *
 * Condition: the release is not already present in the `releases` object
 * Effect: add the release to the `releases` object, with an empty `services` object
 * Action: none, this does not have any effect on the system
 */
export const createRelease = Constructor.of({
	path: '/apps/:appUuid/releases/:releaseUuid',
	effect: (device: Device, ctx) => ctx.set(device, { services: {} }),
	description: (ctx) => `prepare release '${ctx.releaseUuid}'`,
});

/**
 * Create a new service container from service data
 *
 * Condition: the service is not already present in the `services` object and the service image has already been downloaded
 * Effect: add the service to the `services` object, with a `status` of `created`
 * Action: create a new container using the docker API and set the `containerId` property of the service in the `services` object
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

/**
 * Start a service container
 *
 * Condition: the service container has been created (it has a container id), the container not running, the container configuration
 *            matches the target configuration, and there is no other service with the same name from another release running
 * Effect: set the service status to `running`
 * Action: start the container using the docker API
 */
export const startService = Task.of({
	path: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	// Because we are dealing with releases, this has a more
	// complex condition than the composer example
	condition: (device: Device, ctx) => {
		const { releases } = device.apps[ctx.appUuid];

		// The task can be applied if the following conditions are met:
		return (
			// The container has been created (the state has a containerId)
			ctx.get(device)?.containerId != null &&
			// The configuration of the existing container matches the target
			isEqualConfig(ctx.get(device), ctx.target) &&
			// The container is not running yet
			ctx.get(device)?.status !== 'running' &&
			// And if there is a service with the same name from other release, that
			// service cannot be running
			Object.keys(releases)
				.filter((u) => u !== ctx.releaseUuid)
				.every(
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

/**
 * Rename a service between releases if the image and service configuration has not changed
 *
 * Condition: the service exists (it has a container id), the container is not running, the container configuration
 *            matches the target configuration, and source and target images are the same
 * Effect: move the service from the source release to the target release
 * Action: rename the container using the docker API
 */
export const migrateService = Task.of({
	op: 'create',
	path: '/apps/:appUuid/releases/:releaseUuid/services/:serviceName',
	condition: (device: Device, ctx) => {
		const { releases } = device.apps[ctx.appUuid];
		const [currentRelease] = Object.keys(releases).filter(
			(u) => u !== ctx.releaseUuid,
		);
		const currentService = releases[currentRelease]?.services[ctx.serviceName];
		return (
			ctx.get(device) == null &&
			currentService != null &&
			isEqualConfig(currentService, ctx.target) &&
			ctx.target.image === currentService.image
		);
	},
	effect: (device: Device, ctx) => {
		const { releases } = device.apps[ctx.appUuid];
		const [currentRelease] = Object.keys(releases).filter(
			(u) => u !== ctx.releaseUuid,
		)!;

		const { [ctx.serviceName]: service, ...currentServices } =
			releases[currentRelease].services;

		// Remove the service from the source release
		// and move it to the target release
		return ctx.set(
			{
				...device,
				apps: {
					...device.apps,
					[ctx.appUuid]: {
						...device.apps[ctx.appUuid],
						releases: {
							...device.apps[ctx.appUuid].releases,
							[currentRelease]: {
								...releases[currentRelease],
								services: currentServices,
							},
						},
					},
				},
			},
			service,
		);
	},
	action: async (device: Device, ctx) => {
		const { releases } = device.apps[ctx.appUuid];
		const [currentRelease] = Object.keys(releases).filter(
			(u) => u !== ctx.releaseUuid,
		)!;

		const { [ctx.serviceName]: service, ...currentServices } =
			releases[currentRelease].services;

		// Rename the container
		await docker.getContainer(service.containerId!).rename({
			name: getContainerName(ctx),
		});

		// Remove the service from the source release
		// and move it to the target release
		return ctx.set(
			{
				...device,
				apps: {
					...device.apps,
					[ctx.appUuid]: {
						...device.apps[ctx.appUuid],
						releases: {
							...device.apps[ctx.appUuid].releases,
							[currentRelease]: {
								...releases[currentRelease],
								services: currentServices,
							},
						},
					},
				},
			},
			service,
		);
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
export const stopService = Task.of({
	// Stop is applicable to a service delete or update
	op: '*',
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
export const removeService = Task.of({
	op: '*',
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

/**
 * Remove a release
 *
 * This only removes the release from the state object and has no effect in the system
 *
 * Condition: the release has not been deleted yet and the release has no services
 * Effect: remove the release from the device state
 * Action: none
 */
export const removeRelease = Pure.of({
	op: 'delete',
	path: '/apps/:appUuid/releases/:releaseUuid',
	condition: (device: Device, ctx) =>
		ctx.get(device) != null &&
		Object.keys(ctx.get(device).services).length === 0,
	effect: (device: Device, ctx) => ctx.del(device),
	description: (ctx) => `remove release '${ctx.releaseUuid}'`,
});

/**
 * Remove an app
 *
 * This only removes the app from the state object and has no effect in the system
 *
 * Condition: the app has not been deleted yet and all releases have been uninstalled
 * Effect: remove the app from the device state
 * Action: none
 */
export const removeApp = Pure.of({
	op: 'delete',
	path: '/apps/:appUuid',
	condition: (device: Device, ctx) =>
		ctx.get(device) != null &&
		Object.keys(ctx.get(device).releases).length === 0,
	effect: (device: Device, ctx) => ctx.del(device),
	description: (ctx) => `remove app '${ctx.appUuid}'`,
});

/*
 * Update an app
 *
 * This uses a `redirect` task. We can perform different strategies to
 * update an app depending on the requirements, in this case, if we are udpating
 * an app to a new release we can think of it as three separate steps
 *
 * - First pull images and create any changing services in the target release, any migrating services can be safely
 *   migrated now
 * - Uninstall the running release
 * - Start the services from the target release
 *
 * The redirect task returns intermediate targets for the planner to follow as a way
 * to guide the planning without imposing too many restrictions.
 *
 * Condition: there are releases in the current state that are not
 * in the target state of the same app
 * Redirect: [ update and migrate services, uninstall the running release]
 */
export const updateApp = Task.of({
	op: 'update',
	path: '/apps/:appUuid',
	// This only applies to an app that is updating between releases
	condition: (device: Device, ctx) => {
		const currentReleases = Object.keys(ctx.get(device).releases);
		const targetReleases = Object.keys(ctx.target.releases);

		// There is a release in current that is not part of the target
		// state
		return (
			targetReleases.length > 0 &&
			currentReleases.some((cR) => !targetReleases.find((tR) => cR === tR))
		);
	},
	// NOTE: we need to set the method return otherwise the
	// compiler cannot infer the right generics for the task
	redirect: (device: Device, ctx): Array<Target<Device>> => {
		const currentReleases = Object.keys(ctx.get(device).releases);
		const targetReleases = Object.keys(ctx.target.releases);

		const currentRelease = currentReleases.find(
			(cR) => !targetReleases.find((tR) => cR === tR),
		)!;
		const [targetRelease] = targetReleases;
		const currentServices =
			ctx.get(device).releases[currentRelease]?.services || {};
		const targetServices = ctx.target.releases[targetRelease]?.services || {};

		// find services that need to be updated/installed vs migrated
		const unchangedServices: string[] = [];
		const updatedOrNewServices: string[] = [];
		for (const serviceName of Object.keys(targetServices)) {
			// If the service is in both the current state and target state
			// with the same configuration and image
			if (
				currentServices[serviceName] != null &&
				isEqualConfig(
					currentServices[serviceName],
					targetServices[serviceName],
				) &&
				targetServices[serviceName].image === currentServices[serviceName].image
			) {
				unchangedServices.push(serviceName);
			} else {
				updatedOrNewServices.push(serviceName);
			}
		}

		// The first target keeps both the current and target releases
		const installAndMigrateServices = {
			[currentRelease]: {
				services: Object.keys(currentServices).reduce(
					(services, serviceName) => {
						// Delete from the current state any services that need to be migrated
						if (unchangedServices.includes(serviceName)) {
							return {
								...services,
								[serviceName]: DELETED,
							};
						}

						// Keep the state unchanged for the rest
						return {
							...services,
							[serviceName]: currentServices[serviceName],
						};
					},
					{},
				),
			},
			[targetRelease]: {
				services: Object.keys(targetServices).reduce(
					(services, serviceName) => {
						if (unchangedServices.includes(serviceName)) {
							return {
								...services,
								// Keep the status of the service as this does not need to be changed
								[serviceName]: targetServices[serviceName],
							};
						}

						if (updatedOrNewServices.includes(serviceName)) {
							return {
								...services,
								// Only install the services, do not start them yet
								[serviceName]: {
									...targetServices[serviceName],
									status: 'created',
								},
							};
						}

						return services;
					},
					{},
				),
			},
		};

		// This returns two targets
		return [
			// First install the new release and migrate the services
			{
				apps: {
					[ctx.appUuid]: {
						releases: installAndMigrateServices,
					},
				},
			},
			// Then delete the current release keeping the target release
			// state untouched
			{
				apps: {
					[ctx.appUuid]: {
						releases: {
							[currentRelease]: DELETED,
							[targetRelease]: installAndMigrateServices[targetRelease],
						},
					},
				},
			},
		];
	},
	description: (ctx) => `update app '${ctx.appUuid}'`,
});
