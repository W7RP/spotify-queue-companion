//#region modules/stdlib/src/webpack/ReactComponents.gen.ts
let Settings;
import("./ReactComponents.desktop.js").then((m) => {
	Settings = m.Settings;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./ReactComponents.desktop.ts failed:", e));
let PanelContainer;
let PanelContent;
let PanelHeader;
import("./ReactComponents.panel.js").then((m) => {
	PanelContainer = m.PanelContainer;
	PanelContent = m.PanelContent;
	PanelHeader = m.PanelHeader;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./ReactComponents.panel.ts failed:", e));
let Menus;
let Cards;
let RemoteConfigProviderComponent;
let Nav;
let NavTo;
let InstrumentedRedirect;
let SnackbarProvider;
let ContextMenu;
let RightClickMenu;
let Tooltip;
let Menu;
let MenuItem;
let MenuItemSubMenu;
let RemoteConfigProvider;
let Snackbar;
let FilterBox;
let ScrollableContainer;
let ScrollableText;
let Router;
let Routes;
let Route;
let StoreProvider;
let GenericModal;
let Tracklist;
let TracklistColumnsContextProvider;
import("./ReactComponents.xpui.js").then((m) => {
	Menus = m.Menus;
	Cards = m.Cards;
	RemoteConfigProviderComponent = m.RemoteConfigProviderComponent;
	Nav = m.Nav;
	NavTo = m.NavTo;
	InstrumentedRedirect = m.InstrumentedRedirect;
	SnackbarProvider = m.SnackbarProvider;
	ContextMenu = m.ContextMenu;
	RightClickMenu = m.RightClickMenu;
	Tooltip = m.Tooltip;
	Menu = m.Menu;
	MenuItem = m.MenuItem;
	MenuItemSubMenu = m.MenuItemSubMenu;
	RemoteConfigProvider = m.RemoteConfigProvider;
	Snackbar = m.Snackbar;
	FilterBox = m.FilterBox;
	ScrollableContainer = m.ScrollableContainer;
	ScrollableText = m.ScrollableText;
	Router = m.Router;
	Routes = m.Routes;
	Route = m.Route;
	StoreProvider = m.StoreProvider;
	GenericModal = m.GenericModal;
	Tracklist = m.Tracklist;
	TracklistColumnsContextProvider = m.TracklistColumnsContextProvider;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./ReactComponents.xpui.ts failed:", e));
//#endregion
export { Cards, ContextMenu, FilterBox, GenericModal, InstrumentedRedirect, Menu, MenuItem, MenuItemSubMenu, Menus, Nav, NavTo, PanelContainer, PanelContent, PanelHeader, RemoteConfigProvider, RemoteConfigProviderComponent, RightClickMenu, Route, Router, Routes, ScrollableContainer, ScrollableText, Settings, Snackbar, SnackbarProvider, StoreProvider, Tooltip, Tracklist, TracklistColumnsContextProvider };

//# sourceMappingURL=ReactComponents.gen.js.map