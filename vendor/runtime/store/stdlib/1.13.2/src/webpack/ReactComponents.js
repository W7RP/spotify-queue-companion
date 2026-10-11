import { webpackRequire } from "../wpunpk.mix.js";
import { matchWebpackModule } from "../wpunpk.js";
import { Cards, ContextMenu, FilterBox, GenericModal, InstrumentedRedirect, Menu, MenuItem, MenuItemSubMenu, Menus, Nav, NavTo, PanelContainer, PanelContent, PanelHeader, RemoteConfigProvider, RemoteConfigProviderComponent, RightClickMenu, Route, Router, Routes, ScrollableContainer, ScrollableText, Settings, Snackbar, SnackbarProvider, StoreProvider, Tooltip, Tracklist, TracklistColumnsContextProvider } from "./ReactComponents.gen.js";
//#region modules/stdlib/src/webpack/ReactComponents.ts
let Slider;
let Toggle;
let TracklistRow;
matchWebpackModule((id, module) => {
	return module.toString().includes("\"data-testid\":\"progress-bar\"");
}, (id, _$) => {
	const module = webpackRequire(id);
	Slider = Object.values(module)[0];
});
matchWebpackModule((id, module) => {
	return module.toString().includes("\"JWYoNAyrIIdW30u4PSGE\"");
}, (id, _$) => {
	const module = webpackRequire(id);
	Toggle = Object.values(module)[0];
});
matchWebpackModule((id, module) => {
	return module.toString().includes("\"data-testid\":\"track-icon\"");
}, async (id, _$) => {
	//! HACKY ALERT (this module depennds on chunks that aren't loaded yet)
	await new Promise((resolve) => setTimeout(resolve));
	const module = webpackRequire(id);
	TracklistRow = Object.values(module)[0];
});
//#endregion
export { Cards, ContextMenu, FilterBox, GenericModal, InstrumentedRedirect, Menu, MenuItem, MenuItemSubMenu, Menus, Nav, NavTo, PanelContainer, PanelContent, PanelHeader, RemoteConfigProvider, RemoteConfigProviderComponent, RightClickMenu, Route, Router, Routes, ScrollableContainer, ScrollableText, Settings, Slider, Snackbar, SnackbarProvider, StoreProvider, Toggle, Tooltip, Tracklist, TracklistColumnsContextProvider, TracklistRow };

//# sourceMappingURL=ReactComponents.js.map