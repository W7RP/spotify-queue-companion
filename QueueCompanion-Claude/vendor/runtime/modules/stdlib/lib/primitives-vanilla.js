import { CARD_CLASS, DIALOG_BODY_CLASS, DIALOG_CLASS, DIALOG_HEADER_CLASS, DIALOG_LARGE_CLASS, ICON_BUTTON_CLASS, SCRIM_CLASS, SEARCHBAR_CLASS, SELECT_CLASS, badgeClass, buttonClass, chipClass } from "./primitives-classes.js";
import { activateDialog } from "./dialog-lifecycle.js";
//#region modules/stdlib/lib/primitives-vanilla.ts
/**
* A vanilla, React-free component kit for module UIs. Every primitive is
* a plain function returning a typed HTMLElement, built on the `h()`
* hyperscript, and applies the shared `.spicetify-*` chrome classes from
* stdlib's stylesheet. Because it touches nothing but `document`, it is
* safe on standalone module surfaces (anchors, body dialogs, popovers)
* where the client React instance and client webpack components are
* unavailable — the same tier-2 role the chrome classes already fill,
* now as named, composable primitives.
*
* Inside a client React tree, prefer the real client components via
* stdlib's ComponentLibrary; this kit is for module-owned DOM.
*/
const appendChild = (parent, child) => {
	if (child === false || child === null || child === void 0) return;
	if (Array.isArray(child)) {
		for (const c of child) appendChild(parent, c);
		return;
	}
	parent.append(child);
};
function h(tag, props, ...children) {
	const node = document.createElement(tag);
	if (props) for (const [key, value] of Object.entries(props)) {
		if (value === void 0) continue;
		if (key === "dataset") Object.assign(node.dataset, value);
		else if (key === "style") Object.assign(node.style, value);
		else if (key.startsWith("aria-")) node.setAttribute(key, value);
		else if (/^on[A-Z]/.test(key) && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
		else node[key] = value;
	}
	for (const child of children) appendChild(node, child);
	return node;
}
function Button(props) {
	return h("button", {
		type: "button",
		className: buttonClass(props.variant),
		disabled: props.disabled,
		onClick: props.onClick
	}, props.icon, props.label);
}
function IconButton(props) {
	return h("button", {
		type: "button",
		className: ICON_BUTTON_CLASS,
		"aria-label": props.ariaLabel,
		textContent: props.glyph,
		onClick: props.onClick
	});
}
function Select(props) {
	const select = h("select", {
		className: SELECT_CLASS,
		onChange: () => props.onChange(select.value)
	});
	for (const option of props.options) select.append(h("option", {
		value: option.value,
		textContent: option.label,
		selected: option.value === props.value
	}));
	select.value = props.value;
	return select;
}
function TextInput(props) {
	const input = h("input", {
		type: "text",
		className: SEARCHBAR_CLASS,
		placeholder: props.placeholder,
		value: props.value,
		disabled: props.disabled,
		onInput: props.onInput ? () => props.onInput(input.value) : void 0
	});
	return input;
}
function Textarea(props) {
	const textarea = h("textarea", {
		placeholder: props.placeholder,
		value: props.value,
		onInput: props.onInput ? () => props.onInput(textarea.value) : void 0
	});
	return textarea;
}
function Badge(props) {
	return h("span", {
		className: badgeClass(props.tone),
		textContent: props.text
	});
}
function Chip(props) {
	return h("button", {
		type: "button",
		className: chipClass(props.active),
		textContent: props.label,
		onClick: props.onClick
	});
}
function Card(props) {
	return h("article", { className: CARD_CLASS }, props.children);
}
function ConfirmButton(props) {
	const setTimer = props.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
	const clearTimer = props.clearTimer ?? ((handle) => clearTimeout(handle));
	let armed = null;
	const disarm = () => {
		if (armed !== null) clearTimer(armed);
		armed = null;
		button.textContent = props.label;
	};
	const button = h("button", {
		type: "button",
		className: buttonClass(props.variant),
		textContent: props.label,
		onClick: () => {
			if (armed !== null) {
				disarm();
				props.onConfirm();
				return;
			}
			button.textContent = props.confirmLabel;
			armed = setTimer(disarm, props.windowMs ?? 4e3);
		}
	});
	return button;
}
let nextDialogTitleId = 0;
function openDialog(props) {
	const body = h("div", { className: DIALOG_BODY_CLASS }, props.children);
	let closed = false;
	let deactivate = () => {};
	const close = () => {
		if (closed) return;
		closed = true;
		deactivate();
		scrim.remove();
		props.onClose?.();
	};
	const titleId = `spicetify-dialog-title-${++nextDialogTitleId}`;
	const header = h("div", { className: DIALOG_HEADER_CLASS }, h("h2", {
		id: titleId,
		textContent: props.title
	}), IconButton({
		glyph: "×",
		ariaLabel: "Close",
		onClick: close
	}));
	const dialog = h("div", {
		className: props.size === "large" ? `${DIALOG_CLASS} ${DIALOG_LARGE_CLASS}` : DIALOG_CLASS,
		tabIndex: -1,
		role: "dialog",
		"aria-modal": "true",
		"aria-labelledby": titleId
	}, header, body);
	const scrim = h("div", {
		className: SCRIM_CLASS,
		onClick: (e) => {
			if (e.target === scrim) close();
		}
	}, dialog);
	document.body.append(scrim);
	deactivate = activateDialog(dialog, close);
	return {
		body,
		close
	};
}
//#endregion
export { Badge, Button, Card, Chip, ConfirmButton, IconButton, Select, TextInput, Textarea, h, openDialog };

//# sourceMappingURL=primitives-vanilla.js.map