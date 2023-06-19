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
	readonly imageId?: string;
}

export type App = {
	name: string;
	services: Record<string, Service>;
	images: Image[];
};
