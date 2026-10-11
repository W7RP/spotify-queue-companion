import { React } from "./expose/React.js";
import registry, { PlaybarButton } from "./registers/playbarButton.js";
import { client } from "./client.js";
import { jsx } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/src/playbar-compat.tsx
const innerSvg = (icon) => {
	const match = /<svg[^>]*>([\s\S]*)<\/svg>/i.exec(icon);
	return match ? match[1] : icon;
};
const toInnerSvg = (icon) => client.icons?.[icon] ?? innerSvg(icon);
var PlaybarCompat = class {
	onClick;
	_label;
	_icon;
	_active;
	_disabled;
	node = null;
	refreshers = /* @__PURE__ */ new Set();
	constructor(label, icon, onClick = () => {}, disabled = false, active = false, registerOnCreate = true) {
		this._label = label;
		this._icon = icon;
		this.onClick = onClick;
		this._disabled = disabled;
		this._active = active;
		if (registerOnCreate) this.register();
	}
	refresh() {
		for (const f of this.refreshers) f();
	}
	get label() {
		return this._label;
	}
	set label(v) {
		this._label = v;
		this.refresh();
	}
	get icon() {
		return this._icon;
	}
	set icon(v) {
		this._icon = v;
		this.refresh();
	}
	get active() {
		return this._active;
	}
	set active(v) {
		this._active = v;
		this.refresh();
	}
	get disabled() {
		return this._disabled;
	}
	set disabled(v) {
		this._disabled = v;
		this.refresh();
	}
	get element() {
		return null;
	}
	get tippy() {
		return null;
	}
	register() {
		if (this.node) return;
		const self = this;
		const Compat = () => {
			const [, force] = React.useReducer((n) => n + 1, 0);
			React.useEffect(() => {
				self.refreshers.add(force);
				return () => {
					self.refreshers.delete(force);
				};
			}, []);
			return /* @__PURE__ */ jsx(PlaybarButton, {
				label: self._label,
				icon: toInnerSvg(self._icon),
				isActive: self._active,
				disabled: self._disabled,
				onClick: () => self.onClick(self)
			});
		};
		this.node = /* @__PURE__ */ jsx(Compat, {});
		registry.add(this.node);
	}
	deregister() {
		if (!this.node) return;
		registry.delete(this.node);
		this.node = null;
	}
};
function installPlaybarCompat() {
	const S = globalThis.Spicetify;
	if (!S?.Playbar) return () => {};
	const original = {
		Button: S.Playbar.Button,
		Widget: S.Playbar.Widget
	};
	S.Playbar.Button = PlaybarCompat;
	S.Playbar.Widget = PlaybarCompat;
	return () => {
		if (!S.Playbar) return;
		S.Playbar.Button = original.Button;
		S.Playbar.Widget = original.Widget;
	};
}
//#endregion
export { installPlaybarCompat };

//# sourceMappingURL=playbar-compat.js.map