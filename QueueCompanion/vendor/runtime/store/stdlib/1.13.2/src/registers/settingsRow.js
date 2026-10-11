import { React } from "../expose/React.js";
import { Registry } from "./registry.js";
import { SettingsSection } from "../../lib/primitives.js";
import registry$1 from "./settingsSection.js";
import { jsx } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/src/registers/settingsRow.tsx
const listeners = /* @__PURE__ */ new Set();
const registry = new class extends Registry {
	add(value) {
		super.add(value);
		for (const l of listeners) l();
		return this;
	}
	delete(value) {
		const deleted = super.delete(value);
		for (const l of listeners) l();
		return deleted;
	}
}();
const SpicetifyGroup = () => {
	const [, force] = React.useReducer((n) => n + 1, 0);
	React.useEffect(() => {
		listeners.add(force);
		return () => void listeners.delete(force);
	}, []);
	const rows = registry.all();
	if (rows.length === 0) return null;
	return /* @__PURE__ */ jsx(SettingsSection, {
		title: "General",
		children: rows.map((row, i) => /* @__PURE__ */ jsx(React.Fragment, { children: row }, i))
	});
};
if (typeof document !== "undefined") CHUNKS.xpui.promise.then(() => {
	registry$1.add(React.createElement(SpicetifyGroup));
});
//#endregion
export { registry as default };

//# sourceMappingURL=settingsRow.js.map