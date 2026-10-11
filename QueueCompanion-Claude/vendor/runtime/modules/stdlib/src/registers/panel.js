import { React, ReactDOM } from "../expose/React.js";
import { Registry } from "./registry.js";
import { createItemBoundary } from "./mount.js";
import { createPanelCoordinator } from "./panel-logic.js";
//#region modules/stdlib/src/registers/panel.ts
const mountReactPanel = (host, panel, close) => {
	const root = ReactDOM.createRoot(host);
	const PanelBoundary = createItemBoundary(React, "panel");
	const PanelContent = () => React.createElement("div", { className: "spicetify-panel-content" }, panel.render());
	const PanelSurface = () => React.createElement(React.Fragment, null, React.createElement("header", { className: "spicetify-panel-header" }, React.createElement("h2", { className: "spicetify-panel-title" }, panel.label), React.createElement("button", {
		className: "spicetify-panel-close spicetify-button-circle",
		"aria-label": `Close ${panel.label}`,
		onClick: close
	}, "×")), React.createElement(PanelBoundary, null, React.createElement(PanelContent)));
	root.render(React.createElement(PanelSurface));
	return () => root.unmount();
};
const panelCoordinatorKey = Symbol.for("spicetify.stdlib.panel-coordinator");
const shared = globalThis;
shared[panelCoordinatorKey]?.dispose();
const panelCoordinator = createPanelCoordinator({
	document,
	window,
	mount: mountReactPanel
});
shared[panelCoordinatorKey] = panelCoordinator;
var PanelRegistry = class extends Registry {
	controllers = /* @__PURE__ */ new Map();
	add(panel) {
		this.controllers.set(panel, panelCoordinator.register(panel));
		return super.add(panel);
	}
	delete(panel) {
		this.controllers.get(panel)?.dispose();
		this.controllers.delete(panel);
		return super.delete(panel);
	}
	controller(panel) {
		return this.controllers.get(panel);
	}
};
var panel_default = new PanelRegistry();
//#endregion
export { panel_default as default, panelCoordinator };

//# sourceMappingURL=panel.js.map