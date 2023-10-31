import { Planner } from 'mahler/planner';
import { mermaid } from 'mahler/testing';

export const trace = mermaid();

import { App } from './state';
import {
	fetchServiceImage,
	installService,
	uninstallService,
	startService,
	stopService,
} from './tasks';

export const planner = Planner.from<App>({
	tasks: [
		fetchServiceImage,
		installService,
		startService,
		stopService,
		uninstallService,
	],
	config: { trace },
});
