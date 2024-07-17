import type { PathType, Root } from './path';
import { Path } from './path';
import { isArrayIndex } from './is-array-index';

export type Pointer<O, P extends PathType> = PointerWithSlash<O, P>;

type IsLiteral<T> = T extends string
	? string extends T
		? false
		: true
	: false;

type PointerWithSlash<O, P extends PathType> = P extends `/${infer R}`
	? PointerWithoutSlash<O, R>
	: IsLiteral<P> extends true
		? never
		: // If the string is not a literal we cannot know what the pointer type is
			unknown;
type PointerWithoutSlash<
	O,
	P extends PathType,
> = P extends `${infer H}/${infer T}`
	? PointerWithCompoundPath<O, H, T>
	: PointerWithSinglePath<O, P>;
type PointerWithCompoundPath<
	O,
	H extends string,
	T extends PathType,
> = O extends any[]
	? PointerWithoutSlash<O[number], T>
	: H extends keyof O
		? PointerWithoutSlash<O[H], T>
		: never;
type PointerWithSinglePath<O, H extends string> = O extends any[]
	? O[number]
	: H extends keyof O
		? O[H]
		: H extends ''
			? O
			: undefined;

export class InvalidPointer extends Error {
	constructor(path: PathType, obj: unknown) {
		super(
			`Path ${path} is not a valid pointer for object ${JSON.stringify(obj)}`,
		);
	}
}

function from<O = any, P extends PathType = Root>(
	obj: O,
	path: Path<P>,
): Pointer<O, P> {
	const parts = Path.split(path);

	// Save the last element of the path so we can delete it
	const last = parts.pop();

	let o = obj as any;
	for (const p of parts) {
		if (!Array.isArray(o) && typeof o !== 'object') {
			throw new InvalidPointer(path, obj);
		}

		if (Array.isArray(o) && !isArrayIndex(p)) {
			throw new InvalidPointer(path, obj);
		}

		if (!(p in o)) {
			throw new InvalidPointer(path, obj);
		}
		o = o[p];
	}

	if (last != null) {
		if (!Array.isArray(o) && typeof o !== 'object') {
			throw new InvalidPointer(path, obj);
		}

		if (Array.isArray(o) && !isArrayIndex(last)) {
			throw new InvalidPointer(path, obj);
		}

		return o[last];
	}

	return o;
}

export const Pointer = {
	from,
};
