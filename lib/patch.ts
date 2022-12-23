import merge from 'ts-deepmerge';

export type Patch<T> = T extends object
	? {
			[P in keyof T]?: Patch<T[P]>;
	  }
	: T;

export function patch<T = any>(src: T, p: Patch<T>): T {
	return merge.withOptions({ mergeArrays: false }, src as any, p) as T;
}

export default patch;
