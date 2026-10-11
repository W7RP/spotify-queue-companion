//#region modules/stdlib/src/webpack/registry-quiet.ts
const QUIET_MS = 300;
const TICK_MS = 25;
const CAP_MS = 1e4;
function watchRegistryQuiet(count, pending, onQuiet) {
	const started = Date.now();
	let last = -1;
	let quietSince = started;
	const timer = setInterval(() => {
		const current = count();
		const at = Date.now();
		if (current !== last || pending() > 0) {
			last = current;
			quietSince = at;
		}
		if (at - quietSince >= QUIET_MS || at - started >= CAP_MS) {
			clearInterval(timer);
			onQuiet();
		}
	}, TICK_MS);
}
//#endregion
export { watchRegistryQuiet };

//# sourceMappingURL=registry-quiet.js.map