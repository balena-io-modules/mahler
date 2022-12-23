import { createPatch } from 'rfc6902';

type Person = {
	name: string;
	age: number;
};

type State = {
	people: {
		[k: string]: Person;
	};
	taxis: string[];
};

const initial: State = {
	people: {
		pipe: { name: 'Felipe', age: 40 },
		vale: { name: 'Valentina', age: 31 },
	},
	taxis: ['one', 'two'],
};

const target: State = {
	people: {
		pipe: { name: 'Felipe L', age: 41 },
		naty: { name: 'Natalia', age: 35 },
	},
	taxis: ['one'],
};

console.log(JSON.stringify(createPatch(initial, target), null, 2));
