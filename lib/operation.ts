import { Path } from './path';
import { Pointer } from './pointer';

interface CreateOperation<T, P extends Path> {
	op: 'create';
	path: P;
	target: Pointer<T, P>;
}
interface DeleteOperation<P extends Path> {
	op: 'delete';
	path: P;
}
interface UpdateOperation<T, P extends Path> {
	op: 'update';
	path: P;
	source: Pointer<T, P>;
	target: Pointer<T, P>;
}

export type Operation<T = any, P extends Path = '/'> =
	| CreateOperation<T, P>
	| DeleteOperation<P>
	| UpdateOperation<T, P>;

export type Op = Operation['op'];
