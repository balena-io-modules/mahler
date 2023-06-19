export type ServiceStatus = 'created' | 'stopped' | 'running';

export interface Service {
	readonly image: string;
	readonly status?: ServiceStatus;
	readonly createdAt?: Date;
	readonly startedAt?: Date;
	readonly finishedAt?: Date;
	readonly containerId?: string;
	readonly command: string[];
}

export interface Image {
	readonly name: string;
	readonly contentHash?: string;
	readonly imageId?: string;
}

export type UUID = string;

export type Release = {
	services: Record<string, Service>;
};

export type App = {
	name: string;
	// We accept multiple releases as part of the state but only
	// one should be running at all times
	releases: Record<UUID, Release>;
};

export type Device = {
	name: string;
	uuid: string;
	keys: { [url: string]: string };
	apps: Record<UUID, App>;
	images: Image[];
};
