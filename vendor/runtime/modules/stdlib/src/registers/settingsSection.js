import { React } from "../expose/React.js";
import { Registry } from "./registry.js";
import registry$1 from "./route.js";
import { SETTINGS_HEADER_CLASS, SETTINGS_HEADER_CONTAINER_CLASS } from "../../lib/primitives-classes.js";
import { CorsProxySettings } from "../settings/corsProxy.js";
//#region modules/stdlib/src/registers/settingsSection.ts
const SPICETIFY_SETTINGS_ROUTE = "/bespoke/settings";
const listeners = /* @__PURE__ */ new Set();
const notify = () => {
	for (const listener of listeners) listener();
};
var SettingsRegistry = class extends Registry {
	add(value) {
		super.add(value);
		notify();
		return this;
	}
	delete(value) {
		const deleted = super.delete(value);
		if (deleted) notify();
		return deleted;
	}
};
const registry = new SettingsRegistry();
const settingsAction = new SettingsRegistry();
const SpicetifySettingsPage = () => {
	const [, forceRender] = React.useReducer((value) => value + 1, 0);
	React.useEffect(() => {
		listeners.add(forceRender);
		return () => void listeners.delete(forceRender);
	}, []);
	const sections = registry.all();
	const actions = settingsAction.all();
	return React.createElement("main", { className: "spicetify-settings-page x-settings-container" }, React.createElement("div", { className: SETTINGS_HEADER_CONTAINER_CLASS }, React.createElement("h1", {
		className: SETTINGS_HEADER_CLASS,
		style: { paddingBlockEnd: "16px" }
	}, "Spicetify Settings")), ...sections.map((section, index) => React.createElement(React.Fragment, { key: `section-${index}` }, section)), React.createElement(CorsProxySettings, { key: "cors-proxy" }), ...actions.map((action, index) => React.createElement(React.Fragment, { key: `action-${index}` }, action)));
};
if (typeof document !== "undefined") CHUNKS.xpui.promise.then(() => {
	registry$1.add(React.createElement("route", {
		path: SPICETIFY_SETTINGS_ROUTE,
		element: React.createElement(SpicetifySettingsPage)
	}));
});
//#endregion
export { SPICETIFY_SETTINGS_ROUTE, registry as default, settingsAction };

//# sourceMappingURL=settingsSection.js.map