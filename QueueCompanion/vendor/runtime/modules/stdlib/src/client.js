//#region modules/stdlib/src/client.ts
const runtime = () => {
	const value = globalThis.Spicetify;
	if (!value) throw new Error("Spicetify client runtime is unavailable");
	return value;
};
const nonEmptyVersion = (value) => typeof value === "string" && value.trim() ? value : void 0;
let modalRequestGeneration = 0;
const reportModalFailure = (error) => console.error("[stdlib] failed to load the owned modal:", error);
const popupModalCompatibility = {
	display(options) {
		const generation = ++modalRequestGeneration;
		import("../lib/modal.js").then(({ display }) => {
			if (generation === modalRequestGeneration) display(options);
		}).catch(reportModalFailure);
	},
	hide() {
		++modalRequestGeneration;
		import("../lib/modal.js").then(({ hide }) => hide()).catch(reportModalFailure);
	}
};
const client = {
	get player() {
		return runtime().Player;
	},
	get platform() {
		return runtime().Platform;
	},
	get storage() {
		return runtime().LocalStorage;
	},
	get uri() {
		return runtime().URI;
	},
	get cosmos() {
		return runtime().CosmosAsync;
	},
	get corsProxy() {
		return runtime().CORSProxy;
	},
	get graphQL() {
		return runtime().GraphQL;
	},
	get locale() {
		return runtime().Locale;
	},
	get icons() {
		return runtime().SVGIcons;
	},
	get keyboard() {
		return runtime().Keyboard;
	},
	get mousetrap() {
		return runtime().Mousetrap;
	},
	get contextMenu() {
		return runtime().ContextMenu;
	},
	get popupModal() {
		return popupModalCompatibility;
	},
	get config() {
		return runtime().Config;
	},
	get modules() {
		return runtime().Modules;
	},
	get spicetifyVersion() {
		const current = runtime();
		return nonEmptyVersion(current.Modules?.manifest?.cliVersion) ?? nonEmptyVersion(current.Modules?.registry?.manifest?.cliVersion) ?? nonEmptyVersion(current.Config?.version);
	},
	get daemon() {
		return runtime().Daemon;
	},
	get snackbar() {
		return runtime().Snackbar;
	},
	get react() {
		return runtime().React;
	},
	get reactDOM() {
		return runtime().ReactDOM;
	},
	get tippy() {
		return runtime().Tippy;
	},
	get tippyProps() {
		return runtime().TippyProps;
	},
	get playbar() {
		return runtime().Playbar;
	},
	get notify() {
		return runtime().showNotification;
	}
};
//#endregion
export { client };

//# sourceMappingURL=client.js.map