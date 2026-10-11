import { moduleLoadedSubject, webpackRequire } from "./wpunpk.mix.js";
//#region modules/stdlib/src/wpunpk.ts
function matchWebpackModuleSync(moduleMatcher) {
	if (webpackRequire) {
		for (const [id, module] of Object.entries(webpackRequire.m)) if (moduleMatcher(id, module)) return [id, module];
	}
	return null;
}
function matchWebpackModule(moduleMatcher, callback) {
	const sync = matchWebpackModuleSync(moduleMatcher);
	if (sync) {
		callback(...sync);
		return;
	}
	const subscription = moduleLoadedSubject.subscribe(([id, module]) => {
		if (moduleMatcher(id, module)) {
			subscription.unsubscribe();
			callback(id, module);
		}
	});
}
//#endregion
export { matchWebpackModule, matchWebpackModuleSync };

//# sourceMappingURL=wpunpk.js.map