import { React, ReactDOM } from "../src/expose/React.js";
import { CARD_CLASS, DIALOG_BODY_CLASS, DIALOG_CLASS, DIALOG_HEADER_CLASS, DIALOG_LARGE_CLASS, ICON_BUTTON_CLASS, MENU_ITEM_CLASS, SCRIM_CLASS, SEARCHBAR_CLASS, SELECT_CLASS, SETTINGS_ACTION_GROUP_CLASS, SETTINGS_HELP_TEXT_CLASS, SETTINGS_LABEL_COPY_CLASS, SETTINGS_ROW_CLASS, SETTINGS_ROW_CONTROL_CLASS, SETTINGS_ROW_LABEL_CLASS, SETTINGS_ROW_TEXT_CLASS, SETTINGS_SECTION_CLASS, SETTINGS_SECTION_HEADING_CLASS, TOGGLE_CLASSES, activateToggleOnKeyDown, badgeClass, buttonClass, chipClass } from "./primitives-classes.js";
import { activateDialog } from "./dialog-lifecycle.js";
import { Popover, PopoverMenu, PopoverMenuItem, Tooltip } from "./floating.js";
import { jsx, jsxs } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/lib/primitives.tsx
/**
* The React tier of the component kit: the reusable UI primitives, the
* same Spotify-look chrome as the vanilla kit (lib/primitives-vanilla.ts) but as React
* components for module UI that already renders inside a React tree
* (routes, registers, modals). Both tiers apply the shared class contract
* (primitives-classes.ts) so they can never drift.
*
* Deep-import at runtime: `import { Button } from
* "/modules/stdlib/lib/primitives.js"`. This is not in the mod.ts barrel
* to avoid colliding with the vanilla kit's identical export names; a
* module uses one tier. Requires the client React instance, so only
* modules that declare stdlib as a dependency should use it (the vanilla
* kit is the React-free choice for standalone surfaces).
*/
const Button = (props) => /* @__PURE__ */ jsx("button", {
	type: "button",
	className: buttonClass(props.variant),
	disabled: props.disabled,
	onClick: props.onClick,
	children: props.children
});
const IconButton = (props) => /* @__PURE__ */ jsx("button", {
	type: "button",
	className: ICON_BUTTON_CLASS,
	"aria-label": props.ariaLabel,
	disabled: props.disabled,
	onClick: props.onClick,
	children: props.children
});
const ReorderButtons = (props) => /* @__PURE__ */ jsxs("span", {
	className: SETTINGS_ACTION_GROUP_CLASS,
	children: [/* @__PURE__ */ jsx(IconButton, {
		ariaLabel: `Move ${props.label} up`,
		disabled: props.disableUp,
		onClick: () => props.onMove(-1),
		children: "↑"
	}), /* @__PURE__ */ jsx(IconButton, {
		ariaLabel: `Move ${props.label} down`,
		disabled: props.disableDown,
		onClick: () => props.onMove(1),
		children: "↓"
	})]
});
function Select(props) {
	return /* @__PURE__ */ jsx("select", {
		className: SELECT_CLASS,
		value: props.value,
		"aria-label": props.ariaLabel,
		onChange: (e) => props.onChange(e.target.value),
		children: props.options.map((option) => /* @__PURE__ */ jsx("option", {
			value: option.value,
			children: option.label
		}, option.value))
	});
}
const TextInput = (props) => /* @__PURE__ */ jsx("input", {
	type: "text",
	className: SEARCHBAR_CLASS,
	placeholder: props.placeholder,
	value: props.value,
	disabled: props.disabled,
	readOnly: props.readOnly,
	"aria-label": props.ariaLabel,
	onFocus: props.onFocus,
	onBlur: props.onBlur,
	onChange: (e) => props.onInput?.(e.target.value)
});
const Textarea = (props) => /* @__PURE__ */ jsx("textarea", {
	placeholder: props.placeholder,
	value: props.value,
	onChange: (e) => props.onInput?.(e.target.value)
});
const Badge = (props) => /* @__PURE__ */ jsx("span", {
	className: badgeClass(props.tone),
	children: props.children
});
const Chip = (props) => /* @__PURE__ */ jsx("button", {
	type: "button",
	className: chipClass(props.active),
	onClick: props.onClick,
	children: props.children
});
const Card = (props) => /* @__PURE__ */ jsx("article", {
	className: CARD_CLASS,
	children: props.children
});
const SettingsSection = (props) => /* @__PURE__ */ jsxs("div", {
	className: SETTINGS_SECTION_CLASS,
	children: [props.title === void 0 ? null : /* @__PURE__ */ jsx("h2", {
		className: SETTINGS_SECTION_HEADING_CLASS,
		children: props.title
	}), props.children]
});
const SettingsRow = (props) => /* @__PURE__ */ jsxs("div", {
	className: SETTINGS_ROW_CLASS,
	children: [/* @__PURE__ */ jsx("div", {
		className: SETTINGS_ROW_LABEL_CLASS,
		children: props.htmlFor === void 0 ? /* @__PURE__ */ jsx("span", {
			className: SETTINGS_ROW_TEXT_CLASS,
			children: props.label
		}) : /* @__PURE__ */ jsx("label", {
			className: SETTINGS_ROW_TEXT_CLASS,
			htmlFor: props.htmlFor,
			children: props.label
		})
	}), /* @__PURE__ */ jsx("div", {
		className: SETTINGS_ROW_CONTROL_CLASS,
		children: props.children
	})]
});
const SettingsLabel = (props) => /* @__PURE__ */ jsxs("span", {
	className: SETTINGS_LABEL_COPY_CLASS,
	children: [/* @__PURE__ */ jsx("span", { children: props.label }), props.description === void 0 ? null : /* @__PURE__ */ jsx("span", {
		className: SETTINGS_HELP_TEXT_CLASS,
		children: props.description
	})]
});
const SettingsActions = (props) => /* @__PURE__ */ jsx("span", {
	className: SETTINGS_ACTION_GROUP_CLASS,
	children: props.children
});
const SettingsButtonRow = (props) => /* @__PURE__ */ jsx(SettingsRow, {
	label: /* @__PURE__ */ jsx(SettingsLabel, {
		label: props.label,
		description: props.description
	}),
	children: /* @__PURE__ */ jsx(Button, {
		variant: props.variant ?? "secondary",
		disabled: props.disabled,
		onClick: props.onClick,
		children: props.buttonLabel
	})
});
const SettingsTextInputRow = (props) => /* @__PURE__ */ jsx(SettingsRow, {
	label: /* @__PURE__ */ jsx(SettingsLabel, {
		label: props.label,
		description: props.description
	}),
	children: /* @__PURE__ */ jsxs(SettingsActions, { children: [/* @__PURE__ */ jsx(TextInput, {
		value: props.value,
		placeholder: props.placeholder,
		ariaLabel: props.ariaLabel,
		onInput: props.onInput
	}), props.actionLabel === void 0 || props.onAction === void 0 ? null : /* @__PURE__ */ jsx(Button, {
		variant: "secondary",
		disabled: props.actionDisabled,
		onClick: props.onAction,
		children: props.actionLabel
	})] })
});
const Toggle = (props) => /* @__PURE__ */ jsxs("label", {
	className: TOGGLE_CLASSES.wrapper,
	children: [/* @__PURE__ */ jsx("input", {
		type: "checkbox",
		className: TOGGLE_CLASSES.input,
		id: props.id,
		"aria-label": props.ariaLabel,
		checked: props.value,
		disabled: props.disabled,
		onKeyDown: activateToggleOnKeyDown,
		onChange: (e) => props.onChange(e.target.checked)
	}), /* @__PURE__ */ jsx("span", {
		className: TOGGLE_CLASSES.indicatorWrapper,
		"aria-hidden": "true",
		children: /* @__PURE__ */ jsx("span", { className: TOGGLE_CLASSES.indicator })
	})]
});
const SettingsProviderRow = (props) => {
	const id = React.useId();
	const toggle = /* @__PURE__ */ jsx(Toggle, {
		id,
		ariaLabel: `${props.label} provider`,
		value: props.value,
		disabled: props.disabled,
		onChange: props.onChange
	});
	return /* @__PURE__ */ jsx(SettingsRow, {
		label: /* @__PURE__ */ jsx(SettingsLabel, {
			label: props.label,
			description: props.description
		}),
		htmlFor: id,
		children: /* @__PURE__ */ jsxs(SettingsActions, { children: [/* @__PURE__ */ jsx(ReorderButtons, {
			label: props.label,
			disableUp: props.index === 0,
			disableDown: props.index === props.total - 1,
			onMove: props.onMove
		}), props.disabled && props.disabledReason ? /* @__PURE__ */ jsx(Tooltip, {
			label: props.disabledReason,
			children: toggle
		}) : toggle] })
	});
};
const SettingsToggleRow = (props) => {
	const id = React.useId();
	const [value, setValue] = React.useState(props.getValue);
	return /* @__PURE__ */ jsx(SettingsRow, {
		label: props.label,
		htmlFor: id,
		children: /* @__PURE__ */ jsx(Toggle, {
			id,
			value,
			onChange: (v) => {
				setValue(v);
				props.onChange(v);
			}
		})
	});
};
const MenuItem = (props) => /* @__PURE__ */ jsx("button", {
	type: "button",
	role: "menuitem",
	className: props.className ? `${MENU_ITEM_CLASS} ${props.className}` : MENU_ITEM_CLASS,
	onClick: props.onClick,
	children: /* @__PURE__ */ jsx("span", { children: props.children })
});
const ConfirmButton = (props) => {
	const [armed, setArmed] = React.useState(false);
	const timer = React.useRef();
	React.useEffect(() => () => clearTimeout(timer.current), []);
	return /* @__PURE__ */ jsx("button", {
		type: "button",
		className: buttonClass(props.variant),
		onClick: () => {
			if (armed) {
				clearTimeout(timer.current);
				setArmed(false);
				props.onConfirm();
				return;
			}
			setArmed(true);
			timer.current = setTimeout(() => setArmed(false), props.windowMs ?? 4e3);
		},
		children: armed ? props.confirmLabel : props.label
	});
};
const Dialog = (props) => {
	const dialogRef = React.useRef(null);
	const onCloseRef = React.useRef(props.onClose);
	const titleId = React.useId();
	onCloseRef.current = props.onClose;
	React.useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		return activateDialog(dialog, () => onCloseRef.current());
	}, []);
	const dialogClass = props.size === "large" ? `${DIALOG_CLASS} ${DIALOG_LARGE_CLASS}` : DIALOG_CLASS;
	return ReactDOM.createPortal(/* @__PURE__ */ jsx("div", {
		className: SCRIM_CLASS,
		onClick: (e) => {
			if (e.target === e.currentTarget) props.onClose();
		},
		children: /* @__PURE__ */ jsxs("div", {
			ref: dialogRef,
			className: dialogClass,
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": titleId,
			tabIndex: -1,
			children: [/* @__PURE__ */ jsxs("div", {
				className: DIALOG_HEADER_CLASS,
				children: [/* @__PURE__ */ jsx("h2", {
					id: titleId,
					children: props.title
				}), /* @__PURE__ */ jsx(IconButton, {
					ariaLabel: "Close",
					onClick: props.onClose,
					children: "×"
				})]
			}), /* @__PURE__ */ jsx("div", {
				className: DIALOG_BODY_CLASS,
				children: props.children
			})]
		})
	}), document.body);
};
//#endregion
export { Badge, Button, Card, Chip, ConfirmButton, Dialog, IconButton, MenuItem, Popover, PopoverMenu, PopoverMenuItem, ReorderButtons, Select, SettingsActions, SettingsButtonRow, SettingsLabel, SettingsProviderRow, SettingsRow, SettingsSection, SettingsTextInputRow, SettingsToggleRow, TextInput, Textarea, Toggle, Tooltip };

//# sourceMappingURL=primitives.js.map