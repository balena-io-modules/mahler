import type { Path, PathType } from './path';
import type { Pointer } from './pointer';

export type Create = 'create';
export type Delete = 'delete';
export type Update = 'update';
export type Any = '*';

interface CreateOperation<T, P extends PathType> {
	op: Create;
	path: Path<P>;
	target: Pointer<T, P>;
}
interface DeleteOperation<P extends PathType> {
	op: Delete;
	path: Path<P>;
}

export interface UpdateOperation<T, P extends PathType> {
	op: Update;
	path: Path<P>;
	target: Pointer<T, P>;
}

interface DiffUpdateOperation<T, P extends PathType> {
	op: Update;
	path: Path<P>;
	source: Pointer<T, P>;
	target: Pointer<T, P>;
}

export type Operation<T = unknown, P extends PathType = PathType> =
	| CreateOperation<T, P>
	| DeleteOperation<P>
	| UpdateOperation<T, P>;

export type DiffOperation<T = unknown, P extends PathType = PathType> =
	| CreateOperation<T, P>
	| DeleteOperation<P>
	| DiffUpdateOperation<T, P>;

export type Op = Operation['op'];

export type AnyOp = Op | Any;
