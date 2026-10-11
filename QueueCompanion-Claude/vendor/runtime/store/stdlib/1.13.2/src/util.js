//#region modules/stdlib/src/util.ts
const stringify = (x) => {
	if (x == null) return "";
	try {
		return String(x);
	} catch {
		try {
			return Function.prototype.toString.call(x);
		} catch {
			return "";
		}
	}
};
const sources = /* @__PURE__ */ new WeakMap();
const sourceOf = (x) => {
	if (typeof x !== "object" && typeof x !== "function" || x === null) return stringify(x);
	let source = sources.get(x);
	if (source === void 0) {
		source = stringify(x);
		sources.set(x, source);
	}
	return source;
};
function findBy(...tests) {
	const testFns = tests.map((test) => {
		switch (typeof test) {
			case "string": return (x) => sourceOf(x).includes(test);
			case "function": return (x) => test(x);
			default: return (x) => test.test(sourceOf(x));
		}
	});
	const testFn = (x) => testFns.every((t) => t(x));
	return (xs) => xs.find(testFn);
}
const matchLast = (str, pattern) => {
	const matches = str.matchAll(pattern);
	return Array.from(matches).at(-1);
};
const WORD_OR_NUMBER = /\p{Lu}\p{Ll}+|\p{Lu}+(?=(\p{Lu}\p{Ll})|\P{L}|\b)|(\p{Ll}+)|\p{L}+|\p{N}+/gu;
const splitToWords = (input) => input.match(WORD_OR_NUMBER) ?? [];
const capitalizeWord = (word) => word ? word[0].toLocaleUpperCase() + word.slice(1).toLocaleLowerCase() : word;
function toPascalCase(input) {
	return splitToWords(input.trim()).map(capitalizeWord).join("");
}
//#endregion
export { findBy, matchLast, sourceOf, toPascalCase };

//# sourceMappingURL=util.js.map