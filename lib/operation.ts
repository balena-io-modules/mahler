import { Path, PathString, Root } from './path';
import { Pointer } from './pointer';

interface CreateOperation<T, P extends PathString> {
	op: 'create';
	path: Path<P>;
	target: Pointer<T, P>;
}
interface DeleteOperation<P extends PathString> {
	op: 'delete';
	path: Path<P>;
}
interface UpdateOperation<T, P extends PathString> {
	op: 'update';
	path: Path<P>;
	source: Pointer<T, P>;
	target: Pointer<T, P>;
}

export type Operation<T = any, P extends PathString = Root> =
	| CreateOperation<T, P>
	| DeleteOperation<P>
	| UpdateOperation<T, P>;

export type Op = Operation['op'];
