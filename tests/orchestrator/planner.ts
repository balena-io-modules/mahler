import { Planner } from 'mahler/planner';
import { log } from '~/test-utils';

import type { Device } from './state';
import {
	fetch,
	createApp,
	createRelease,
	installService,
	migrateService,
	startService,
	stopService,
	uninstallService,
	removeRelease,
	removeApp,
} from './tasks';

export const planner = Planner.from<Device>({
	tasks: [
		fetch,
		createApp,
		createRelease,
		migrateService,
		installService,
		startService,
		stopService,
		uninstallService,
		removeRelease,
		removeApp,
	],
	config: { trace: log },
});
