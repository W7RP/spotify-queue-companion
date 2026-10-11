import { startEventHandlers } from "./src/events.js";
import { installPlaybarCompat } from "./src/playbar-compat.js";
//#region modules/stdlib/load.ts
async function load_default(_ctx) {
	const cancelEventHandlers = startEventHandlers();
	const uninstallPlaybarCompat = installPlaybarCompat();
	return () => {
		uninstallPlaybarCompat();
		cancelEventHandlers();
	};
}
//#endregion
export { load_default as default };

//# sourceMappingURL=load.js.map