import { warn } from "../logger.js";
import { React, ReactDOM } from "../expose/React.js";
import { byOrder } from "./order.js";
//#region modules/stdlib/src/registers/mount.ts
const createItemBoundary = (R, label) => {
	const isPage = label.includes("route");
	const describe = (error) => {
		try {
			const text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
			return text.length > 300 ? `${text.slice(0, 300)}…` : text;
		} catch {
			return "(unprintable error)";
		}
	};
	return class ItemBoundary extends R.Component {
		state = {
			failed: false,
			message: ""
		};
		static getDerivedStateFromError(error) {
			return {
				failed: true,
				message: describe(error)
			};
		}
		componentDidCatch(error) {
			console.error(`[stdlib] registered ${label} item crashed:`, error);
		}
		render() {
			const { failed, message } = this.state;
			if (!failed) return this.props.children;
			if (!isPage) return R.createElement("span", {
				title: `A Spicetify module item crashed here: ${message}`,
				style: {
					opacity: .6,
					padding: "0 4px",
					cursor: "help"
				}
			}, "⚠");
			return R.createElement("div", { style: {
				maxWidth: "560px",
				margin: "48px auto",
				padding: "24px",
				borderRadius: "8px",
				background: "var(--spice-card, #282828)",
				color: "var(--spice-text, #fff)",
				fontSize: "14px",
				lineHeight: 1.5
			} }, R.createElement("h2", { style: {
				margin: "0 0 8px",
				fontSize: "18px"
			} }, "This module page crashed"), R.createElement("p", { style: {
				margin: "0 0 12px",
				opacity: .8
			} }, "The rest of the client keeps working. Reloading usually recovers it; if it keeps crashing, disable the module from the Spicetify Manager."), R.createElement("code", { style: {
				display: "block",
				padding: "8px",
				background: "rgba(0,0,0,.3)",
				borderRadius: "4px",
				marginBottom: "16px",
				userSelect: "text"
			} }, message), R.createElement("button", {
				onClick: () => location.reload(),
				style: {
					padding: "8px 16px",
					borderRadius: "500px",
					border: "none",
					cursor: "pointer",
					background: "var(--spice-button, #1ed760)",
					color: "var(--spice-main, #121212)",
					fontWeight: 700
				}
			}, "Reload Spotify"));
		}
	};
};
const ensureAnchorStyle = () => {
	if (document.getElementById("spicetify-anchor-style")) return;
	const style = document.createElement("style");
	style.id = "spicetify-anchor-style";
	style.textContent = "[data-spicetify-anchor] > * { -webkit-app-region: no-drag; app-region: no-drag; }";
	document.head.appendChild(style);
};
const watched = /* @__PURE__ */ new Set();
let bodyObserver;
const watchAnchor = (anchor) => {
	watched.add(anchor);
	bodyObserver ??= (() => {
		const observer = new MutationObserver(() => {
			for (const a of watched) {
				if (a.host.isConnected) continue;
				if (a.place() && !a.started) {
					a.started = true;
					a.start();
				}
			}
		});
		observer.observe(document.body, {
			childList: true,
			subtree: true
		});
		return observer;
	})();
	return () => {
		watched.delete(anchor);
		if (watched.size === 0) {
			bodyObserver?.disconnect();
			bodyObserver = void 0;
		}
	};
};
function mountRegistryAnchor(spec) {
	if (globalThis.__SPICETIFY_APPLY_TRANSFORMS__) return;
	if (typeof document === "undefined") return;
	CHUNKS.xpui.promise.then(() => {
		const R = React;
		const createRoot = ReactDOM.createRoot;
		if (typeof createRoot !== "function") {
			warn("[stdlib] cannot mount register anchor (no createRoot):", spec.className);
			return;
		}
		const host = document.createElement("span");
		host.className = spec.className;
		host.style.display = spec.hostDisplay ?? "contents";
		host.dataset.spicetifyAnchor = "";
		ensureAnchorStyle();
		const place = () => {
			const slot = spec.findSlot();
			if (!slot) return false;
			slot.parent.insertBefore(host, slot.before ?? null);
			return true;
		};
		const start = () => {
			const root = createRoot(host);
			const ItemBoundary = createItemBoundary(R, spec.className);
			const itemKeys = /* @__PURE__ */ new Map();
			let nextItemKey = 0;
			const Wrapper = () => {
				const [, refresh] = R.useReducer((n) => n + 1, 0);
				R.useEffect(() => {
					spec.setRefresh(refresh);
					return () => spec.setRefresh(void 0);
				}, []);
				if (spec.renderItems) return R.createElement(ItemBoundary, null, spec.renderItems(spec.registry.all()));
				for (const item of itemKeys.keys()) if (!spec.registry.has(item)) itemKeys.delete(item);
				return R.createElement(R.Fragment, null, ...byOrder(spec.registry.all()).map((item) => {
					let key = itemKeys.get(item);
					if (key === void 0) {
						key = nextItemKey++;
						itemKeys.set(item, key);
					}
					return R.createElement(ItemBoundary, { key }, item);
				}));
			};
			root.render(R.createElement(Wrapper));
		};
		const anchor = {
			host,
			place,
			started: false,
			start
		};
		if (place()) {
			anchor.started = true;
			start();
		}
		watchAnchor(anchor);
	});
}
function mountAdjacent(spec) {
	let removed = false;
	let unwatch;
	let retry;
	let root;
	const host = document.createElement("span");
	host.className = spec.className;
	host.style.display = "contents";
	host.dataset.spicetifyAnchor = "";
	const place = () => {
		if (removed) return false;
		const target = spec.findTarget();
		if (!target?.parentElement) return false;
		const before = spec.side === "before" ? target : target.nextSibling;
		target.parentElement.insertBefore(host, before);
		return true;
	};
	const remove = () => {
		if (removed) return;
		removed = true;
		clearTimeout(retry);
		unwatch?.();
		try {
			root?.unmount?.();
		} finally {
			host.remove();
		}
	};
	if (globalThis.__SPICETIFY_APPLY_TRANSFORMS__ || typeof document === "undefined") {
		spec.onGiveUp();
		return { remove: () => {} };
	}
	CHUNKS.xpui.promise.then(() => {
		if (removed) return;
		const R = React;
		const createRoot = ReactDOM.createRoot;
		if (typeof createRoot !== "function") {
			spec.onGiveUp();
			return;
		}
		const start = () => {
			ensureAnchorStyle();
			root = createRoot(host);
			const ItemBoundary = createItemBoundary(R, spec.className);
			root.render?.(R.createElement(ItemBoundary, null, spec.element));
		};
		const deadline = Date.now() + spec.giveUpMs;
		const attempt = () => {
			if (removed) return;
			if (place()) {
				start();
				unwatch = watchAnchor({
					host,
					place,
					started: true,
					start: () => {}
				});
				return;
			}
			if (Date.now() > deadline) {
				spec.onGiveUp();
				return;
			}
			retry = setTimeout(attempt, 150);
		};
		attempt();
	});
	return { remove };
}
//#endregion
export { createItemBoundary, mountAdjacent, mountRegistryAnchor };

//# sourceMappingURL=mount.js.map