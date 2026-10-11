//#region modules/stdlib/src/webpack/capture-readiness.ts
function createCaptureReadiness(options) {
	const settled = Promise.withResolvers();
	let released = false;
	let analyzed = false;
	let timer;
	const scheduleTimeout = options.scheduleTimeout ?? setTimeout;
	const clearScheduledTimeout = options.clearScheduledTimeout ?? clearTimeout;
	const release = () => {
		if (released) return;
		released = true;
		if (timer !== void 0) clearScheduledTimeout(timer);
		settled.resolve(void 0);
	};
	return {
		wait() {
			if (!released && timer === void 0) timer = scheduleTimeout(() => {
				options.onTimeout?.();
				release();
			}, options.timeoutMs);
			return settled.promise;
		},
		run(work, onFailure) {
			if (analyzed) return;
			analyzed = true;
			try {
				work();
			} catch (error) {
				onFailure(error);
			} finally {
				release();
			}
		}
	};
}
//#endregion
export { createCaptureReadiness };

//# sourceMappingURL=capture-readiness.js.map