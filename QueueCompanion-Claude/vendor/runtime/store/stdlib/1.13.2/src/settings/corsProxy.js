import { React } from "../expose/React.js";
import { SETTINGS_HELP_TEXT_CLASS } from "../../lib/primitives-classes.js";
import { Button, Select, SettingsRow, SettingsSection, TextInput } from "../../lib/primitives.js";
import { jsx, jsxs } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region modules/stdlib/src/settings/corsProxy.tsx
const MODE_OPTIONS = [{
	value: "automatic",
	label: "Automatic"
}, {
	value: "custom",
	label: "Custom"
}];
const SettingsLabel = (props) => /* @__PURE__ */ jsxs("span", {
	className: "spicetify-settings-label-copy",
	children: [/* @__PURE__ */ jsx("span", { children: props.title }), /* @__PURE__ */ jsx("span", {
		className: SETTINGS_HELP_TEXT_CLASS,
		children: props.description
	})]
});
const CorsProxySettingsAvailable = (props) => {
	const { api } = props;
	const [initial] = React.useState(() => api.configuration());
	const [mode, setMode] = React.useState(initial.mode);
	const [template, setTemplate] = React.useState(initial.template ?? "");
	const [message, setMessage] = React.useState("");
	const valid = api.isValidTemplate(template);
	const [daemonTemplate, hostedTemplate] = initial.automaticTemplates;
	const changeMode = (next) => {
		setMode(next);
		setMessage("");
		if (next === "automatic") {
			api.configure({ mode: "automatic" });
			setMessage("Automatic routing is active.");
		}
	};
	const applyCustom = () => {
		try {
			api.configure({
				mode: "custom",
				template
			});
			setMessage("Custom proxy is active.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "The custom proxy template is invalid.");
		}
	};
	return /* @__PURE__ */ jsxs(SettingsSection, {
		title: "CORS Proxy",
		children: [
			/* @__PURE__ */ jsx(SettingsRow, {
				label: /* @__PURE__ */ jsx(SettingsLabel, {
					title: "Routing",
					description: "Automatic tries the authenticated local daemon first, then Spicetify's hosted proxy."
				}),
				children: /* @__PURE__ */ jsx(Select, {
					ariaLabel: "CORS proxy routing",
					options: MODE_OPTIONS,
					value: mode,
					onChange: changeMode
				})
			}),
			mode === "custom" ? /* @__PURE__ */ jsx(SettingsRow, {
				label: /* @__PURE__ */ jsx(SettingsLabel, {
					title: "Custom template",
					description: "Use an absolute URL containing \"{url}\". A custom template replaces automatic fallback."
				}),
				children: /* @__PURE__ */ jsxs("div", {
					className: "spicetify-cors-proxy-controls",
					children: [/* @__PURE__ */ jsx(TextInput, {
						ariaLabel: "Custom CORS proxy template",
						placeholder: "https://proxy.example/{url}",
						value: template,
						onInput: setTemplate
					}), /* @__PURE__ */ jsx(Button, {
						variant: "secondary",
						disabled: !valid,
						onClick: applyCustom,
						children: "Apply"
					})]
				})
			}) : null,
			/* @__PURE__ */ jsx("span", {
				className: SETTINGS_HELP_TEXT_CLASS,
				children: message || `Automatic chain: ${daemonTemplate} → ${hostedTemplate}`
			})
		]
	});
};
const CorsProxySettings = () => {
	const api = Spicetify.CORSProxy;
	if (typeof api?.configuration !== "function" || typeof api?.configure !== "function" || typeof api?.isValidTemplate !== "function") return null;
	return /* @__PURE__ */ jsx(CorsProxySettingsAvailable, { api });
};
//#endregion
export { CorsProxySettings };

//# sourceMappingURL=corsProxy.js.map