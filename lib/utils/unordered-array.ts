import { deepEqual } from './deep-equal';

/**
 * UnorderedArray provides an interface for array comparisons where the comparison
 * is independent of the order. This is useful when for a state model where someone
 * might not want to consider reordering of data in an array to be considered a state
 * change.
 */
export interface UnorderedArray<T> extends Array<T> {
	equals(o: ArrayLike<T>): boolean;
}

class UnorderedArrayImpl<T> extends Array<T> implements UnorderedArray<T> {
	static of<T>(...items: T[]): UnorderedArray<T> {
		return new UnorderedArrayImpl(...items);
	}

	static from<T>(items: ArrayLike<T> | Iterable<T> = []): UnorderedArray<T> {
		return new UnorderedArrayImpl(...Array.from(items));
	}

	includes(value: T): boolean {
		for (const elem of this) {
			if (deepEqual(value, elem)) {
				return true;
			}
		}
		return false;
	}

	private difference(other: UnorderedArray<T>): T[] {
		const result = [];

		for (const elem of this) {
			if (!other.includes(elem)) {
				result.push(elem);
			}
		}

		return result;
	}

	equals(other: ArrayLike<T>): boolean {
		// If the arrays have different length then return false
		// immediately
		if (this.length !== other.length) {
			return false;
		}

		// Otherwise the arrays are equal if A - B = B - A = 0
		const otherArr = new UnorderedArrayImpl(...Array.from(other));
		const diffA = this.difference(otherArr);
		const diffB = otherArr.difference(this);
		return diffA.length === 0 && diffB.length === 0;
	}
}

export const UnorderedArray = UnorderedArrayImpl;
