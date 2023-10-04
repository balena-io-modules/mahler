import { Planner } from 'mahler/planner';
import { console } from '~/test-utils';

import { Device } from './state';
import {
	fetch,
	createApp,
	createRelease,
	installService,
	migrateService,
	startService,
	stopService,
	removeService,
	removeRelease,
	removeApp,
} from './tasks';

export const planner = Planner.from<Device>({
	tasks: [
		fetch,
		createApp,
		createRelease,
		// NOTE: right now we need to make sure to put `migrateService` before
		// `installService` in the task list, otherwise the planner will always chose to
		// recreate services even if a migration suffices. This is because the planner
		// just returns the first path it finds instead of the shortest
		migrateService,
		installService,
		startService,
		stopService,
		removeService,
		removeRelease,
		removeApp,
	],
	config: { trace: console.trace },
});
