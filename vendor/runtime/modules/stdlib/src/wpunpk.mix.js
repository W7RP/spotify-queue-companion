//#region modules/stdlib/src/wpunpk.mix.ts
var Subject = class {
	observers = /* @__PURE__ */ new Set();
	subscribe(fn) {
		this.observers.add(fn);
		return { unsubscribe: () => this.observers.delete(fn) };
	}
	next(value) {
		for (const fn of this.observers) fn(value);
	}
};
var BehaviorSubject = class extends Subject {
	current;
	constructor(current) {
		super();
		this.current = current;
	}
	subscribe(fn) {
		const sub = super.subscribe(fn);
		fn(this.current);
		return sub;
	}
	next(value) {
		this.current = value;
		super.next(value);
	}
	getValue() {
		return this.current;
	}
};
const chunkLoadedSubjectPre = new Subject();
const chunkLoadedSubjectPost = new Subject();
const moduleLoadedSubject = new Subject();
const pendingHooks = [];
const postWebpackRequireHooks = { push(hook) {
	if (typeof globalThis.__webpack_require__ === "function") {
		try {
			hook(globalThis.__webpack_require__);
		} catch (e) {
			console.error(e);
		}
		return 0;
	}
	pendingHooks.push(hook);
	ensureDrainTimer();
	return pendingHooks.length;
} };
const webpackRequire = new Proxy(function() {}, {
	get: (_, k) => globalThis.__webpack_require__?.[k] ?? (k === "m" ? {} : void 0),
	apply: (_, __, args) => globalThis.__webpack_require__(...args)
});
const drain = () => {
	if (typeof globalThis.__webpack_require__ !== "function") return false;
	for (const hook of pendingHooks.splice(0)) try {
		hook(globalThis.__webpack_require__);
	} catch (e) {
		console.error(e);
	}
	return true;
};
let drainTimer;
const ensureDrainTimer = () => {
	if (drainTimer !== void 0) return;
	let tries = 0;
	drainTimer = setInterval(() => {
		if (drain() || ++tries > 400) {
			clearInterval(drainTimer);
			drainTimer = void 0;
		}
	}, 50);
};
//#endregion
export { BehaviorSubject, Subject, chunkLoadedSubjectPost, chunkLoadedSubjectPre, moduleLoadedSubject, postWebpackRequireHooks, webpackRequire };

//# sourceMappingURL=wpunpk.mix.js.map