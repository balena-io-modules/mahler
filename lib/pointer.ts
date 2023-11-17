import { Path } from './path';
import { isArrayIndex } from './is-array-index';

export type Pointer<O, P extends Path> = PointerWithSlash<O, P>;

type PointerWithSlash<O, P extends Path> = P extends `/${infer R}`
	? PointerWithoutSlash<O, R>
	: never;
type PointerWithoutSlash<O, P extends Path> = P extends `${infer H}/${infer T}`
	? PointerWithCompoundPath<O, H, T>
	: PointerWithSinglePath<O, P>;
type PointerWithCompoundPath<
	O,
	H extends string,
	T extends Path,
> = O extends any[]
	? PointerWithoutSlash<O[number], T>
	: H extends keyof O
	  ? PointerWithoutSlash<O[H], T>
	  : never;
type PointerWithSinglePath<O, H extends string> = O extends any[]
	? O[number]
	: H extends keyof O
	  ? O[H]
	  : never;

export class InvalidPointer extends Error {
	constructor(path: Path, obj: unknown) {
		super(
			`Path ${path} is not a valid pointer for object ${JSON.stringify(obj)}`,
		);
	}
}

function from<O = any, P extends Path = '/'>(
	obj: O,
	path: P,
): Pointer<O, P> | undefined {
	Path.assert(path);
	const parts = Path.elems(path);

	let o = obj as any;
	for (const p of parts) {
		if (!Array.isArray(o) && typeof o !== 'object') {
			throw new InvalidPointer(path, obj);
		}

		if (Array.isArray(o) && !isArrayIndex(p)) {
			throw new InvalidPointer(path, obj);
		}

		// Pointer is permissive, if the object does not exist in the type,
		// it doesn't mean it cannot exist so we return undefined
		if (!(p in o)) {
			return undefined;
		}
		o = o[p];
	}

	return o;
}

export const Pointer = {
	from: from,
};
