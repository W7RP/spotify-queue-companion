import { React } from "../expose/React.js";
import { transformer } from "../../mixin.js";
import { Registry } from "./registry.js";
import { mountRegistryAnchor } from "./mount.js";
//#region modules/stdlib/src/registers/root.ts
var RootRegistry = class RootRegistry extends Registry {
	refresh = Object.assign(Promise.withResolvers(), { value: void 0 });
	static queueRefresh(refresh) {
		if (refresh.value) refresh.value();
		else refresh.promise.then((value) => value());
	}
	add(value) {
		const ret = super.add(value);
		RootRegistry.queueRefresh(this.refresh);
		return ret;
	}
	delete(value) {
		const ret = super.delete(value);
		RootRegistry.queueRefresh(this.refresh);
		return ret;
	}
};
const childrenRegistry = new RootRegistry();
const providersRegistry = new RootRegistry();
var root_default = [childrenRegistry, providersRegistry];
globalThis.__renderRootChildren = () => React.createElement(() => {
	const [, refresh] = React.useReducer((n) => n + 1, 0);
	if (!childrenRegistry.refresh.value) childrenRegistry.refresh.resolve(refresh);
	childrenRegistry.refresh.value = refresh;
	return childrenRegistry.all();
});
globalThis.__renderRootProviders = (providers) => {
	const MultiProvider = ({ children }) => {
		const [, refresh] = React.useReducer((n) => n + 1, 0);
		if (!providersRegistry.refresh.value) providersRegistry.refresh.resolve(refresh);
		providersRegistry.refresh.value = refresh;
		return providersRegistry.all().reduceRight((acc, e) => React.cloneElement(e, void 0, acc), React.createElement(React.Fragment, void 0, children));
	};
	return React.useMemo(() => [providers, React.createElement(MultiProvider)].flat(), [providers]);
};
transformer((emit) => (str) => {
	emit();
	str = str.replace(/\bproviders:([a-zA-Z_\$][\w\$]*),children:\[([^\]]+"data-testid.:.root")/, "providers:__renderRootProviders($1),children:[__renderRootChildren(),$2");
	return str;
}, { glob: /^\/xpui\.js/ });
mountRegistryAnchor({
	className: "spicetify-root-children",
	registry: childrenRegistry,
	setRefresh: (cb) => {
		if (cb && !childrenRegistry.refresh.value) childrenRegistry.refresh.resolve(cb);
		childrenRegistry.refresh.value = cb;
	},
	findSlot: () => document.body ? { parent: document.body } : null
});
//#endregion
export { root_default as default };

//# sourceMappingURL=root.js.map