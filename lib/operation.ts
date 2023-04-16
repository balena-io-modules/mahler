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
				value: value as any,
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
				value: value as any,
			};
		default:
			throw new OperationNotSupported(op);
	}
}

export const Operation = {
	of,
};
