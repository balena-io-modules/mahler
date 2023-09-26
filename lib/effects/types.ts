// These types are only exported for internal use within the module
export type AsyncReturn<T> = Promise<T> | AsyncGenerator<T, T | void, void>;
export type Async<T> = () => AsyncReturn<T>;
export type Sync<T> = () => T;

// Generic unary function type (used by pipe and flow)
export type Fn<A, B> = (a: A) => B;
