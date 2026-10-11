import { transformer } from "../../mixin.js";
//#region modules/stdlib/src/expose/SettingsSection.ts
let SettingsSection;
const future = {
	push: () => {},
	pull(fn) {
		const push = this.push;
		this.push = () => {
			push();
			fn();
		};
	}
};
let SettingsSectionTitle;
transformer((emit) => (str) => {
	str = str.replace(/(\.jsxs\)\()([a-zA-Z_\$][\w\$]*)([^=]*"desktop.settings.compatibility")/, "$1(__SettingsSection=$2)$3");
	Object.defineProperty(globalThis, "__SettingsSection", { set: emit });
	return str;
}, {
	glob: /^\/xpui-routes-desktop-settings\.js/,
	wait: false
}).then(($) => {
	SettingsSection = $;
	future.push();
});
transformer((emit) => (str) => {
	str = str.replace(/("desktop.settings.compatibility"[^=]*?\.jsx\)\()([a-zA-Z_\$][\w\$]*)/, "$1(__SettingsSectionTitle=$2)");
	Object.defineProperty(globalThis, "__SettingsSectionTitle", { set: emit });
	return str;
}, {
	glob: /^\/xpui-routes-desktop-settings\.js/,
	wait: false
}).then(($) => {
	SettingsSectionTitle = $;
});
//#endregion
export { SettingsSection, SettingsSectionTitle, future };

//# sourceMappingURL=SettingsSection.js.map