type PositiveNumber = number & { __brand: 'PositiveNumber' };

export function isArrayIndex(x: unknown): x is PositiveNumber {
	return (
		x != null &&
		((typeof x === 'number' && x >= 0) ||
			(typeof x === 'string' &&
				!isNaN(+x) &&
				+x === parseInt(x, 10) &&
				+x >= 0))
	);
}
