//#region modules/stdlib/src/logger.ts
const DIAGNOSTICS_CAP = 200;
const safeString = (value) => {
	try {
		return String(value);
	} catch {
		return "[unprintable]";
	}
};
const warn = (...args) => {
	console.warn(...args);
	try {
		const buffer = globalThis.__SPICETIFY_DIAGNOSTICS__;
		if (!buffer) return;
		buffer.push({
			ts: Date.now(),
			level: "warn",
			message: args.map(safeString).join(" ")
		});
		if (buffer.length > DIAGNOSTICS_CAP) buffer.splice(0, buffer.length - DIAGNOSTICS_CAP);
	} catch {}
};
//#endregion
export { warn };

//# sourceMappingURL=logger.js.map