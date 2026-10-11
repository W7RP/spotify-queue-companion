import { warn } from "../logger.js";
import { sourceOf } from "../util.js";
import { postWebpackRequireHooks, webpackRequire } from "../wpunpk.mix.js";
import { createCaptureReadiness } from "./capture-readiness.js";
import { watchRegistryQuiet } from "./registry-quiet.js";
//#region modules/stdlib/src/webpack/index.ts
let modules;
let exports;
let exported;
let exportedFunctions;
let exportedReactObjects;
let exportedContexts;
let exportedForwardRefs;
let exportedMemos;
const src = sourceOf;
const analyzeWebpackRequire = (webpackRequire) => {
	const modules = Object.entries(webpackRequire.m);
	const exports = modules.map(([id]) => webpackRequire(id));
	const exported = exports.filter((module) => typeof module === "object").flatMap((module) => {
		try {
			return Object.values(module);
		} catch (_) {}
	}).filter(Boolean);
	const isFunction = (obj) => typeof obj === "function";
	const exportedFunctions = exported.filter(isFunction);
	const exportedReactObjects = Object.groupBy(exported, (x) => x.$$typeof);
	return {
		modules,
		exports,
		exported,
		exportedFunctions,
		exportedReactObjects,
		exportedContexts: exportedReactObjects[Symbol.for("react.context")],
		exportedForwardRefs: exportedReactObjects[Symbol.for("react.forward_ref")],
		exportedMemos: exportedReactObjects[Symbol.for("react.memo")]
	};
};
function resolveChunk(path) {
	const chunk = CHUNKS[path] ??= Promise.withResolvers();
	if (!chunk.resolve) throw new TypeError(`Chunk ${path} has no resolver`);
	chunk.resolve(void 0);
}
CHUNKS["/vendor~xpui.js"] ??= Promise.withResolvers();
CHUNKS["/xpui.js"] ??= Promise.withResolvers();
Object.assign(CHUNKS, { xpui: { promise: Promise.all([CHUNKS["/vendor~xpui.js"].promise, CHUNKS["/xpui.js"].promise]) } });
postWebpackRequireHooks.push((wpr) => {
	let loading = 0;
	if (typeof wpr?.l === "function") {
		const load = wpr.l.bind(wpr);
		wpr.l = (url, done, key, chunkId) => {
			loading++;
			try {
				return load(url, (event) => {
					loading--;
					try {
						resolveChunk(new URL(url, location.href).pathname);
					} catch (error) {
						console.error(`[stdlib] could not resolve chunk ${url}:`, error);
					}
					return done(event);
				}, key, chunkId);
			} catch (error) {
				loading--;
				throw error;
			}
		};
	}
	for (const entry of performance.getEntriesByType("resource")) {
		const url = new URL(entry.name, location.href);
		if (url.pathname === "/vendor~xpui.js" || url.pathname === "/xpui.js") continue;
		if (url.origin === location.origin && url.pathname.endsWith(".js")) resolveChunk(url.pathname);
	}
	watchRegistryQuiet(() => Object.keys(wpr?.m ?? {}).length, () => loading, () => {
		resolveChunk("/vendor~xpui.js");
		resolveChunk("/xpui.js");
	});
});
let captured = false;
const captureSubscribers = [];
const webpackCaptureReadiness = createCaptureReadiness({
	timeoutMs: 12e3,
	onTimeout: () => warn("[stdlib] capture health: webpack capture timed out; module surfaces will be degraded")
});
function waitForWebpackCapture() {
	return webpackCaptureReadiness.wait();
}
function onWebpackCaptured(cb) {
	if (captured) {
		cb();
		return;
	}
	captureSubscribers.push(cb);
}
CHUNKS.xpui.promise.then(() => {
	webpackCaptureReadiness.run(() => {
		const analysis = analyzeWebpackRequire(webpackRequire);
		modules = analysis.modules;
		exports = analysis.exports;
		exported = analysis.exported;
		exportedFunctions = analysis.exportedFunctions;
		exportedReactObjects = analysis.exportedReactObjects;
		exportedContexts = analysis.exportedContexts;
		exportedForwardRefs = analysis.exportedForwardRefs;
		exportedMemos = analysis.exportedMemos;
		captured = true;
		if (!analysis.exported.length) warn("[stdlib] capture health: the webpack capture yielded no exports — every needle-backed surface is degraded");
		for (const cb of captureSubscribers.splice(0)) try {
			cb();
		} catch (e) {
			console.error("[stdlib] capture subscriber failed:", e);
		}
	}, (e) => warn("[stdlib] capture health: webpack capture analysis failed; module surfaces will be degraded:", e));
});
//#endregion
export { analyzeWebpackRequire, exported, exportedContexts, exportedForwardRefs, exportedFunctions, exportedMemos, exportedReactObjects, exports, modules, onWebpackCaptured, src, waitForWebpackCapture };

//# sourceMappingURL=index.js.map