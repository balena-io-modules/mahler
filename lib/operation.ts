import { Operation as RFC6902Operation } from 'rfc6902';
import { Path } from './path';
import { Pointer } from './pointer';

export interface CreateOperation<T, P extends Path> {
	op: 'create';
	path: P;
	value: Pointer<T, P>;
}
export interface DeleteOperation<P extends Path> {
	op: 'delete';
	path: P;
}
export interface UpdateOperation<T, P extends Path> {
	op: 'update';
	path: P;
	value: Pointer<T, P>;
}

export type Operation<T = any, P extends Path = '/'> =
	| CreateOperation<T, P>
	| DeleteOperation<P>
	| UpdateOperation<T, P>;

export type Op = Operation['op'];

export class OperationNotSupported extends Error {
	constructor(op: unknown) {
		super(`Unsupported operation: ${op}`);
	}
}

function fromRFC6902<T = any, P extends Path = '/'>(
	operation: RFC6902Operation & { path: P },
): Operation<T, P> {
	switch (operation.op) {
		case 'add':
			return {
				op: 'create',
				path: operation.path,
				value: operation.value,
			};
		case 'remove':
			return {
				op: 'delete',
				path: operation.path,
			};
		case 'replace':
			return {
				op: 'update',
				path: operation.path,
				value: operation.value,
			};
		default:
			// NOTE: we don't support `move` or `copy` but it seems
			// the `createPatch` function of the rfc6902 library never
			// returns those operations
			throw new OperationNotSupported(operation.op);
	}
}

function of<_ = any, P extends Path = '/'>(o: {
	op: 'delete';
	path: P;
}): DeleteOperation<P>;
function of<T = any, P extends Path = '/'>(o: {
	op: 'create';
	path: P;
	value: Pointer<T, P>;
}): CreateOperation<T, P>;
function of<T = any, P extends Path = '/'>(o: {
	op: 'update';
	path: P;
	value: Pointer<T, P>;
}): UpdateOperation<T, P>;
function of<T = any, P extends Path = '/'>({
	op,
	path,
	value,
}: {
	op: Op;
	path: P;
	value?: Pointer<T, P>;
}): Operation<T, P> {
	switch (op) {
		case 'create':
			return {
				op,
				path,
				value: value!,
			};
		case 'delete':
			return {
				op,
				path,
			};
		case 'update':
			return {
				op,
				path,
				value: value!,
			};
		default:
			throw new OperationNotSupported(op);
	}
}

export const Operation = {
	fromRFC6902,
	of,
};
