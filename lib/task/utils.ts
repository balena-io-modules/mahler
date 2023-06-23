import { createHash } from 'crypto';

export function createInstructionId(id: string, path: string, target?: any) {
	return createHash('sha256')
		.update(
			JSON.stringify({
				id,
				path,
				...(target && { target }),
			}),
		)
		.digest('hex');
}
