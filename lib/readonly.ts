type ReadOnlyPrimitive =
	| undefined
	| null
	| boolean
	| string
	| number
	| ((...args: any[]) => any)
	| Date;

export type ReadOnly<T> = T extends ReadOnlyPrimitive
	? T
	: T extends Array<infer U>
		? T & Array<ReadOnly<U>>
		: T extends Map<infer K, infer V>
			? T & Map<ReadOnly<K>, ReadOnly<V>>
			: T extends Set<infer M>
				? T & Set<ReadOnly<M>>
				: { readonly [K in keyof T]: ReadOnly<T[K]> };
