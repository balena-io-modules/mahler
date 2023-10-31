// Utility type to normalize intersections
export type Identity<T> = T extends object
	? object & {
			[P in keyof T]: T[P];
	  }
	: T;
