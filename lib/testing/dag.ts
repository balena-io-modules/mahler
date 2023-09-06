/**
 * Our very simple representation of a DAG
 * for testing
 */
export type Branch = DAG;
export type Fork = Branch[];
export type DAG = Array<string | Fork>;

function indentIf(r: number, cond = true) {
	if (!cond) {
		return '';
	}
	return '  '.repeat(r);
}

function toStr(plan: DAG, depth = 0, branchIdx = 0): string {
	let accum: string = '';
	plan.forEach((item, itemIndex) => {
		if (typeof item === 'string') {
			accum += `${indentIf(depth, itemIndex > 0)}- ${item}\n`;
		} else {
			accum += `${indentIf(depth, Math.max(itemIndex, branchIdx) > 0)}+ `;

			item.forEach((branch, i) => {
				accum += `${indentIf(depth + 1, i > 0)}~ `;
				accum += toStr(branch, depth + 2, Math.min(i, branchIdx));
			});
		}
	});

	return accum;
}

function toString(plan: DAG): string {
	return toStr(plan).trimEnd();
}

export const DAG = {
	empty(): DAG {
		return [];
	},
	toString,
};
