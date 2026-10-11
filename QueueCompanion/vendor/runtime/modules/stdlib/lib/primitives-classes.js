//#region modules/stdlib/lib/primitives-classes.ts
const buttonClass = (variant = "primary") => variant === "primary" ? "spicetify-button" : `spicetify-button spicetify-button--${variant}`;
const badgeClass = (tone = "neutral") => tone === "neutral" ? "spicetify-badge" : `spicetify-badge spicetify-badge--${tone}`;
const chipClass = (active) => active ? "spicetify-chip spicetify-chip--active" : "spicetify-chip";
const ICON_BUTTON_CLASS = "spicetify-button-circle";
const MENU_ITEM_CLASS = "main-contextMenu-menuItemButton";
const SELECT_CLASS = "spicetify-select";
const SEARCHBAR_CLASS = "spicetify-searchbar";
const CARD_CLASS = "spicetify-card";
const SCRIM_CLASS = "spicetify-scrim";
const DIALOG_CLASS = "spicetify-dialog";
const DIALOG_LARGE_CLASS = "spicetify-dialog--large";
const DIALOG_HEADER_CLASS = "spicetify-dialog-header";
const DIALOG_BODY_CLASS = "spicetify-dialog-body";
const SETTINGS_SECTION_CLASS = "x-settings-section";
const SETTINGS_ROW_CLASS = "x-settings-row";
const SETTINGS_ROW_LABEL_CLASS = "x-settings-firstColumn";
const SETTINGS_ROW_CONTROL_CLASS = "x-settings-secondColumn";
const SETTINGS_ACTION_GROUP_CLASS = "spicetify-settings-actions";
const SETTINGS_LABEL_COPY_CLASS = "spicetify-settings-label-copy";
const SETTINGS_HEADER_CONTAINER_CLASS = "x-settings-headerContainer";
const SETTINGS_HEADER_CLASS = "encore-text encore-text-title-medium encore-internal-color-text-base x-settings-header";
const SETTINGS_SECTION_HEADING_CLASS = "encore-text encore-text-body-medium-bold encore-internal-color-text-base spicetify-settings-section-heading";
const SETTINGS_SECTION_SUBHEADING_CLASS = "encore-text encore-text-body-medium-bold encore-internal-color-text-base spicetify-settings-section-subheading";
const SETTINGS_ROW_TEXT_CLASS = "encore-text encore-text-body-small encore-internal-color-text-subdued";
const SETTINGS_HELP_TEXT_CLASS = "encore-text encore-text-marginal encore-internal-color-text-subdued";
const TOGGLE_CLASSES = {
	wrapper: "x-toggle-wrapper",
	input: "x-toggle-input",
	indicatorWrapper: "x-toggle-indicatorWrapper",
	indicator: "x-toggle-indicator"
};
/** @deprecated Use TOGGLE_CLASSES with the native switch structure. */
const TOGGLE_CLASS = "spicetify-toggle";
function activateToggleOnKeyDown(event) {
	if (event.key !== " " && event.key !== "Enter") return;
	event.preventDefault();
	event.stopPropagation();
	event.currentTarget.click();
}
//#endregion
export { CARD_CLASS, DIALOG_BODY_CLASS, DIALOG_CLASS, DIALOG_HEADER_CLASS, DIALOG_LARGE_CLASS, ICON_BUTTON_CLASS, MENU_ITEM_CLASS, SCRIM_CLASS, SEARCHBAR_CLASS, SELECT_CLASS, SETTINGS_ACTION_GROUP_CLASS, SETTINGS_HEADER_CLASS, SETTINGS_HEADER_CONTAINER_CLASS, SETTINGS_HELP_TEXT_CLASS, SETTINGS_LABEL_COPY_CLASS, SETTINGS_ROW_CLASS, SETTINGS_ROW_CONTROL_CLASS, SETTINGS_ROW_LABEL_CLASS, SETTINGS_ROW_TEXT_CLASS, SETTINGS_SECTION_CLASS, SETTINGS_SECTION_HEADING_CLASS, SETTINGS_SECTION_SUBHEADING_CLASS, TOGGLE_CLASS, TOGGLE_CLASSES, activateToggleOnKeyDown, badgeClass, buttonClass, chipClass };

//# sourceMappingURL=primitives-classes.js.map