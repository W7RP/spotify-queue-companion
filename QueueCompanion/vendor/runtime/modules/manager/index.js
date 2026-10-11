import { Platform, React, SPICETIFY_SETTINGS_ROUTE, client, closeMenu, createRegistrar, openedFromProfileMenu, useMenuItem } from "/modules/stdlib/mod.js";
import { Button, MenuItem, SettingsRow, SettingsSection, TextInput } from "/modules/stdlib/lib/primitives.js";
import { Fragment, jsx, jsxs } from "/modules/stdlib/src/expose/jsx-runtime.js";
//#region \0rolldown/runtime.js
var __defProp = Object.defineProperty;
var __esmMin = (fn, res, err) => () => {
	if (err) throw err[0];
	try {
		return fn && (res = fn(fn = 0)), res;
	} catch (e) {
		throw err = [e], e;
	}
};
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
//#endregion
//#region modules/manager/runtime.ts
var managerRuntime, managerModules, managerSpotifyVersion;
var init_runtime = __esmMin((() => {
	managerRuntime = () => globalThis;
	managerModules = () => managerRuntime().Spicetify?.Modules;
	managerSpotifyVersion = () => managerRuntime().Spicetify?.Platform?.version;
}));
//#endregion
//#region modules/manager/state.ts
function deriveManagerState() {
	const g = managerRuntime();
	const M = managerModules();
	const manifest = M?.manifest ?? M?.registry?.manifest ?? g.__SPICETIFY_MODULAR_MANIFEST__;
	const manifestById = new Map((manifest?.modules ?? []).map((m) => [m.identifier, m]));
	const modules = (M?.list?.() ?? []).map((s) => ({
		id: s.identifier,
		version: s.version,
		source: s.local ? "local" : "staged",
		loaded: s.loaded,
		mixedIn: s.mixedIn,
		failed: s.failed,
		dependencies: manifestById.get(s.identifier)?.dependencies ?? {}
	}));
	return {
		spotifyVersion: spotifyVersionLine(managerSpotifyVersion() ?? manifest?.spotifyVersion),
		classmapKey: manifest?.classmapKey,
		cliVersion: manifest?.cliVersion,
		updatesBlocked: manifest?.updatesBlocked,
		managedSpotify: manifest?.managedSpotify,
		classmapSpotify: spotifyVersionLine(manifest?.classmapSpotify),
		classmapVerified: manifest?.classmapVerified,
		supportedSpotify: spotifyVersionLine(manifest?.supportedSpotify),
		latestSpotify: spotifyVersionLine(manifest?.latestSpotify),
		classmapFallback: manifest?.classmapFallback,
		transformsEnabled: g.__SPICETIFY_APPLY_TRANSFORMS__ === true,
		modules,
		loadedCount: modules.filter((m) => m.loaded).length,
		failedCount: modules.filter((m) => m.failed !== void 0).length,
		diagnostics: [...g.__SPICETIFY_DIAGNOSTICS__ ?? []].reverse()
	};
}
function describeAction(label, outcome) {
	const result = outcome;
	if (result?.revertedTo) return `${label}: reverted to the CLI-installed ${result.revertedTo}`;
	if (result?.requiresRestart) return `${label} done — restart Spotify to finish`;
	return `${label} done`;
}
async function fetchSupportStatus() {
	if (supportCache !== void 0) return supportCache;
	try {
		const res = await fetch(SUPPORT_URL());
		if (!res.ok) return null;
		const body = await res.json();
		supportCache = {
			latestSpotify: spotifyVersionLine(body.latestSpotify),
			updatedAt: body.updatedAt
		};
		return supportCache;
	} catch {
		return null;
	}
}
function spotifyVersionLine(version) {
	if (!version) return void 0;
	const parts = version.split(".").slice(0, 3);
	if (parts.length !== 3 || parts.some((part) => !/^\d+$/.test(part))) return void 0;
	return parts.map((part) => String(Number(part))).join(".");
}
function compareSpotifyVersions(a, b) {
	const parse = (v) => v.split(".").slice(0, 3).map((part) => parseInt(part, 10)).filter((n) => !Number.isNaN(n));
	const pa = parse(a);
	const pb = parse(b);
	for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
		const d = pa[i] - pb[i];
		if (d !== 0) return d;
	}
	return 0;
}
function effectiveSupport(state, feed) {
	const spotifyVersion = spotifyVersionLine(state.spotifyVersion);
	const classmapSpotify = spotifyVersionLine(state.classmapSpotify);
	const supportedSpotify = spotifyVersionLine(state.supportedSpotify);
	const stateLatest = spotifyVersionLine(state.latestSpotify);
	const feedLatest = spotifyVersionLine(feed?.latestSpotify);
	const installedSupported = state.classmapVerified === false ? false : state.classmapVerified === true ? !!spotifyVersion && !!classmapSpotify && compareSpotifyVersions(spotifyVersion, classmapSpotify) === 0 : void 0;
	const latestSpotify = [
		spotifyVersion,
		supportedSpotify,
		stateLatest,
		feedLatest
	].filter((version) => !!version).reduce((latest, version) => !latest || compareSpotifyVersions(version, latest) > 0 ? version : latest, void 0);
	if (!supportedSpotify && !latestSpotify && installedSupported === void 0) return feed;
	return {
		supportedSpotify,
		latestSpotify,
		installedSupported,
		updatedAt: feed?.updatedAt
	};
}
function latestPublishedVersions(vault) {
	const out = {};
	const mods = vault?.modules;
	if (!mods || typeof mods !== "object") return out;
	for (const [id, entry] of Object.entries(mods)) {
		const versions = Object.keys(entry?.v ?? {});
		if (!versions.length) continue;
		out[id] = versions.reduce((best, v) => compareSpotifyVersions(v, best) > 0 ? v : best);
	}
	return out;
}
function deriveStaleStaged(modules, published) {
	return modules.filter((m) => m.source === "staged").flatMap((m) => {
		const latest = published[m.id];
		return latest && compareSpotifyVersions(latest, m.version) > 0 ? [{
			id: m.id,
			staged: m.version,
			published: latest
		}] : [];
	});
}
async function fetchPublishedVersions() {
	if (publishedCache !== void 0) return publishedCache;
	try {
		const res = await fetch(VAULT_URL());
		if (!res.ok) return null;
		publishedCache = latestPublishedVersions(await res.json());
		return publishedCache;
	} catch {
		return null;
	}
}
function updateAdvice(installed, support) {
	const installedLine = spotifyVersionLine(installed);
	const supportedLine = spotifyVersionLine(support?.supportedSpotify);
	const latestLine = spotifyVersionLine(support?.latestSpotify);
	if (installedLine && support?.installedSupported !== true && supportedLine && compareSpotifyVersions(installedLine, supportedLine) > 0) return {
		kind: "unsupported",
		message: `Spotify ${installedLine} isn't fully supported yet — some features may be off until Spicetify catches up`
	};
	if (installedLine && support?.installedSupported === false) return {
		kind: "unverified",
		message: `Compatibility could not be verified for this installation of Spotify ${installedLine}. The applied classmap may be local, modified, or for a different version.`
	};
	if (!installedLine || !latestLine) return {
		kind: "unknown",
		message: "Spotify update status unknown"
	};
	if (compareSpotifyVersions(latestLine, installedLine) <= 0) return {
		kind: "current",
		message: `Spotify is up to date (latest known: ${latestLine})`
	};
	if (supportedLine && compareSpotifyVersions(supportedLine, latestLine) >= 0) return {
		kind: "ready",
		message: `Spotify ${latestLine} is available and Spicetify supports it.`
	};
	return {
		kind: "waiting",
		message: `Spotify ${latestLine} is available but held — waiting for spicetify support`
	};
}
var show, showBool, SUPPORT_URL, supportCache, VAULT_URL, publishedCache, upgradeCommand, SPICETIFY_UPGRADE;
var init_state = __esmMin((() => {
	init_runtime();
	show = (value) => value ?? "unknown";
	showBool = (value) => value === void 0 ? "unknown" : value ? "yes" : "no";
	SUPPORT_URL = () => globalThis.localStorage?.getItem("spicetify:supportUrl") ?? "https://raw.githubusercontent.com/spicetify/modules/main/spotify-support.json";
	VAULT_URL = () => globalThis.localStorage?.getItem("spicetify:defaultVaultUrl") ?? "https://raw.githubusercontent.com/spicetify/modules/main/vault.json";
	upgradeCommand = "spicetify self-update && spicetify apply";
	SPICETIFY_UPGRADE = {
		command: upgradeCommand,
		label: "copy Spicetify upgrade command",
		instructions: `Run ${upgradeCommand} in a terminal to update Spicetify and restart Spotify. This does not update Spotify. Then return to Spicetify Manager and choose Update & Apply. If that action is still unavailable, choose allow, update Spotify normally, then run spicetify apply.`
	};
}));
//#endregion
//#region modules/manager/notice.ts
function retryNotice(notify, schedule = setInterval, cancel = clearInterval, maxAttempts = 20) {
	if (notify()) return () => {};
	let attempts = 0;
	const timer = schedule(() => {
		attempts += 1;
		if (notify() || attempts >= maxAttempts) cancel(timer);
	}, 500);
	return () => cancel(timer);
}
var init_notice = __esmMin((() => {}));
//#endregion
//#region modules/manager/managedSpotifyState.ts
function managedJobMessage(job) {
	switch (job.kind) {
		case "idle": return null;
		case "complete": return "Spotify update finished. Your customization is applied.";
		case "failed": return `Spotify update failed: ${job.message}`;
		case "running": return {
			checking: "Checking the selected Spotify package feed.",
			downloading: "Downloading and verifying Spotify.",
			preparing: "Preparing Spotify and applying your customization.",
			activating: "Switching to the prepared installation. Spotify will restart."
		}[job.phase];
	}
}
var init_managedSpotifyState = __esmMin((() => {}));
//#endregion
//#region modules/manager/managedSpotify.tsx
var errorMessage, ManagedSpotifyUpdates;
var init_managedSpotify = __esmMin((() => {
	init_managedSpotifyState();
	errorMessage = (error) => error instanceof Error ? error.message : String(error);
	ManagedSpotifyUpdates = ({ api, daemonAvailable, channel, installed, children }) => {
		const [snapshot, setSnapshot] = React.useState(null);
		const [connection, setConnection] = React.useState(null);
		const [available, setAvailable] = React.useState({ kind: "checking" });
		const [submitting, setSubmitting] = React.useState(false);
		const [actionError, setActionError] = React.useState(null);
		const running = snapshot?.job.kind === "running";
		const terminalId = snapshot?.job.kind === "complete" || snapshot?.job.kind === "failed" ? snapshot.job.jobId : null;
		const installation = snapshot?.installation.kind === "managed" ? snapshot.installation : null;
		React.useEffect(() => {
			if (!api) return;
			let cancelled = false;
			let pending = false;
			const poll = async () => {
				if (pending) return;
				pending = true;
				try {
					const next = await api.status();
					if (!cancelled) {
						setSnapshot(next);
						setConnection(!next ? "Apply a newer Spicetify build to manage package updates here." : next.installation.kind === "unavailable" ? next.installation.message : null);
					}
				} catch {
					if (!cancelled) setConnection("Waiting for the daemon. An accepted update continues when Spotify closes.");
				} finally {
					pending = false;
				}
			};
			poll();
			const timer = setInterval(() => void poll(), 2e3);
			return () => {
				cancelled = true;
				clearInterval(timer);
			};
		}, [api]);
		React.useEffect(() => {
			if (!api || running) return;
			let cancelled = false;
			setAvailable({ kind: "checking" });
			api.check().then((result) => {
				if (!cancelled) setAvailable(result);
			}, (error) => {
				if (!cancelled) setAvailable({
					kind: "error",
					message: errorMessage(error)
				});
			});
			return () => {
				cancelled = true;
			};
		}, [
			api,
			running,
			terminalId
		]);
		const check = async () => {
			if (!api) return;
			setAvailable({ kind: "checking" });
			try {
				setAvailable(await api.check());
			} catch (error) {
				setAvailable({
					kind: "error",
					message: errorMessage(error)
				});
			}
		};
		const update = async () => {
			if (!api || !installation || running || submitting || !globalThis.confirm("Update Spotify and apply your customization? Spotify will restart when the replacement is ready.")) return;
			setSubmitting(true);
			setActionError(null);
			try {
				const admission = await api.update();
				setSnapshot((previous) => previous ? {
					...previous,
					job: {
						kind: "running",
						jobId: admission.jobId,
						phase: "checking"
					}
				} : previous);
			} catch (error) {
				setActionError(errorMessage(error));
			} finally {
				setSubmitting(false);
			}
		};
		const message = available.kind === "checking" ? "Checking the Linux package feed…" : available.kind === "error" ? `Could not check for updates: ${available.message}` : available.kind === "current" ? "Your managed Spotify installation is up to date." : available.kind === "unavailable" ? `Spotify ${available.version} is available, but cannot be installed yet. ${available.message}` : `Spotify ${available.version} is ready to install.`;
		const jobMessage = snapshot ? managedJobMessage(snapshot.job) : null;
		return /* @__PURE__ */ jsxs("section", { children: [
			/* @__PURE__ */ jsx("div", {
				className: "spicetify-manager-section-head",
				children: /* @__PURE__ */ jsx("h2", { children: "Updates" })
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "spicetify-manager-env",
				children: [
					/* @__PURE__ */ jsxs("span", {
						className: "spicetify-manager-badge",
						children: ["installed ", installation?.version ?? installed ?? "unknown"]
					}),
					/* @__PURE__ */ jsxs("span", {
						className: "spicetify-manager-badge",
						children: ["Linux ", installation?.channel ?? channel]
					}),
					"version" in available && /* @__PURE__ */ jsxs("span", {
						className: "spicetify-manager-badge",
						children: ["available ", available.version]
					})
				]
			}),
			/* @__PURE__ */ jsx("p", {
				className: "spicetify-manager-note",
				children: "Spicetify manages this Spotify installation. Package updates run only when you request them. Each update verifies compatibility and reapplies your customization before switching."
			}),
			api ? /* @__PURE__ */ jsxs(Fragment, { children: [
				/* @__PURE__ */ jsx("p", {
					className: "spicetify-manager-update",
					children: message
				}),
				connection && /* @__PURE__ */ jsx("p", {
					role: "status",
					className: "spicetify-manager-note",
					children: connection
				}),
				jobMessage && /* @__PURE__ */ jsx("p", {
					role: "status",
					className: "spicetify-manager-update",
					children: jobMessage
				}),
				actionError && /* @__PURE__ */ jsx("p", {
					role: "alert",
					className: "spicetify-manager-update",
					children: actionError
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "spicetify-manager-update-actions",
					children: [/* @__PURE__ */ jsx("button", {
						type: "button",
						disabled: running || submitting || available.kind === "checking",
						onClick: () => void check(),
						children: "Check for updates"
					}), available.kind === "ready" && /* @__PURE__ */ jsx("button", {
						type: "button",
						disabled: !installation || running || submitting || !!connection,
						onClick: () => void update(),
						children: "Update Spotify & Apply"
					})]
				})
			] }) : /* @__PURE__ */ jsxs("p", {
				className: "spicetify-manager-note",
				children: [
					"Run ",
					/* @__PURE__ */ jsx("code", { children: "spicetify spotify update" }),
					" in a terminal.",
					" ",
					daemonAvailable ? "To enable this control, update Spicetify, run spicetify apply, and reopen Manager." : "Start the Spicetify daemon to update here."
				]
			}),
			children
		] });
	};
}));
//#endregion
//#region modules/manager/autoUpdate.ts
function compareCliVersions(a, b) {
	const parse = (v) => {
		const [core = "", pre] = v.split("+")[0].split(/-(.*)/s);
		return {
			core: core.split(".").map((n) => parseInt(n, 10) || 0),
			pre: pre ? pre.split(".") : []
		};
	};
	const pa = parse(a);
	const pb = parse(b);
	for (let i = 0; i < 3; i++) {
		const d = (pa.core[i] ?? 0) - (pb.core[i] ?? 0);
		if (d !== 0) return d;
	}
	if (!pa.pre.length || !pb.pre.length) return pb.pre.length - pa.pre.length;
	for (let i = 0; i < Math.max(pa.pre.length, pb.pre.length); i++) {
		const x = pa.pre[i];
		const y = pb.pre[i];
		if (x === void 0 || y === void 0) return x === void 0 ? -1 : 1;
		const nx = /^\d+$/.test(x) ? Number(x) : null;
		const ny = /^\d+$/.test(y) ? Number(y) : null;
		if (nx !== null && ny !== null) {
			if (nx !== ny) return nx - ny;
		} else if (nx !== null || ny !== null) return nx !== null ? -1 : 1;
		else if (x !== y) return x < y ? -1 : 1;
	}
	return 0;
}
function pendingCliUpdate(info, appliedVersion) {
	const installed = info?.version;
	if (!installed || !appliedVersion) return null;
	return compareCliVersions(installed, appliedVersion) > 0 ? installed : null;
}
var init_autoUpdate = __esmMin((() => {}));
//#endregion
//#region modules/manager/selfUpdate.tsx
var SpicetifySelfUpdate;
var init_selfUpdate = __esmMin((() => {
	init_autoUpdate();
	SpicetifySelfUpdate = ({ daemon, daemonInfo, setDaemonInfo, cliVersion, busy, onAction }) => {
		const pending = pendingCliUpdate(daemonInfo, cliVersion);
		const canToggle = !!daemon?.setAutoUpdate && typeof daemonInfo?.autoUpdate === "boolean";
		if (!pending && !canToggle) return null;
		return /* @__PURE__ */ jsxs(Fragment, { children: [
			pending && /* @__PURE__ */ jsx("p", {
				className: "spicetify-manager-update spicetify-manager-update--ready",
				children: `Spicetify ${pending} is installed. Apply to use it in Spotify.`
			}),
			pending && daemon && /* @__PURE__ */ jsx("div", {
				className: "spicetify-manager-update-actions",
				children: /* @__PURE__ */ jsx("button", {
					type: "button",
					disabled: busy,
					onClick: () => {
						if (!globalThis.confirm("apply: Spotify will restart. Continue?")) return;
						onAction("apply", () => daemon.apply());
					},
					children: "apply"
				})
			}),
			canToggle && /* @__PURE__ */ jsxs("label", {
				className: "spicetify-manager-toggle",
				children: [/* @__PURE__ */ jsx("input", {
					type: "checkbox",
					checked: daemonInfo.autoUpdate,
					disabled: busy,
					onChange: (e) => {
						const on = e.currentTarget.checked;
						onAction(`automatic updates ${on ? "on" : "off"}`, async () => {
							await daemon.setAutoUpdate(on);
							setDaemonInfo((prev) => prev ? {
								...prev,
								autoUpdate: on
							} : prev);
						});
					}
				}), "Install Spicetify updates automatically"]
			}),
			daemonInfo?.autoUpdate && daemonInfo.autoUpdateActive === false && /* @__PURE__ */ jsx("p", {
				className: "spicetify-manager-note",
				children: "This copy of Spicetify isn't in the installer's folder, so it doesn't update itself. Update it the way you installed it."
			})
		] });
	};
}));
//#endregion
//#region modules/manager/page.tsx
var M, LEVEL_CLASS, CORE, unsupportedNoticeShown, Badge, ModuleRow, daemonApi, ManagerPage;
var init_page = __esmMin((() => {
	init_state();
	init_notice();
	init_managedSpotify();
	init_selfUpdate();
	M = () => client.modules;
	LEVEL_CLASS = {
		error: "spicetify-manager-diag--error",
		warn: "spicetify-manager-diag--warn"
	};
	CORE = /* @__PURE__ */ new Set([
		"stdlib",
		"store",
		"manager"
	]);
	unsupportedNoticeShown = false;
	Badge = ({ kind, children }) => /* @__PURE__ */ jsx("span", {
		className: `spicetify-manager-badge${kind ? ` spicetify-manager-badge--${kind}` : ""}`,
		children
	});
	ModuleRow = ({ row, busy, onAction }) => {
		const deps = Object.entries(row.dependencies).map(([id, range]) => `${id}@${range}`).join(", ");
		const isCore = CORE.has(row.id);
		return /* @__PURE__ */ jsxs("div", {
			className: "spicetify-manager-module",
			children: [
				/* @__PURE__ */ jsxs("div", {
					className: "spicetify-manager-module__head",
					children: [
						/* @__PURE__ */ jsx("span", {
							className: "spicetify-manager-module__name",
							children: row.id
						}),
						/* @__PURE__ */ jsx(Badge, { children: row.version }),
						/* @__PURE__ */ jsx(Badge, { children: row.source }),
						isCore && /* @__PURE__ */ jsx(Badge, { children: "core" }),
						row.loaded && /* @__PURE__ */ jsx(Badge, {
							kind: "ok",
							children: "loaded"
						}),
						!row.loaded && !row.failed && /* @__PURE__ */ jsx(Badge, { children: "disabled" }),
						row.mixedIn && /* @__PURE__ */ jsx(Badge, { children: "mixins" }),
						row.failed !== void 0 && /* @__PURE__ */ jsx(Badge, {
							kind: "bad",
							children: "failed"
						})
					]
				}),
				deps && /* @__PURE__ */ jsxs("div", {
					className: "spicetify-manager-module__deps",
					children: ["needs ", deps]
				}),
				row.failed !== void 0 && /* @__PURE__ */ jsx("div", {
					className: "spicetify-manager-module__failure",
					children: row.failed
				}),
				/* @__PURE__ */ jsxs("div", {
					className: "spicetify-manager-module__actions",
					children: [row.loaded ? /* @__PURE__ */ jsxs(Fragment, { children: [
						!isCore && /* @__PURE__ */ jsx("button", {
							type: "button",
							disabled: busy,
							onClick: () => onAction(`disable ${row.id}`, () => M().disable(row.id)),
							children: "Disable"
						}),
						row.id !== "stdlib" && /* @__PURE__ */ jsx("button", {
							type: "button",
							disabled: busy,
							onClick: () => onAction(`reload ${row.id}`, () => M().reload(row.id)),
							children: "Reload"
						}),
						isCore && /* @__PURE__ */ jsx("span", {
							className: "spicetify-manager-module__note",
							children: "core module"
						})
					] }) : /* @__PURE__ */ jsx("button", {
						type: "button",
						disabled: busy,
						onClick: () => onAction(`enable ${row.id}`, () => M().enable(row.id)),
						children: "Enable"
					}), row.source === "local" && !isCore && /* @__PURE__ */ jsx("button", {
						type: "button",
						className: "spicetify-manager-danger",
						disabled: busy,
						onClick: () => onAction(`remove ${row.id}`, () => M().removeLocal(row.id)),
						children: "Remove"
					})]
				})
			]
		});
	};
	daemonApi = () => client.daemon ?? null;
	ManagerPage = () => {
		const [state, setState] = React.useState(deriveManagerState);
		const [filter, setFilter] = React.useState("");
		const [status, setStatus] = React.useState("");
		const [busy, setBusy] = React.useState(false);
		const [support, setSupport] = React.useState(null);
		const [daemonProbe, setDaemonProbe] = React.useState({ kind: "checking" });
		const [updateStatus, setUpdateStatus] = React.useState({ kind: "idle" });
		const [daemonInfo, setDaemonInfo] = React.useState(null);
		const daemon = daemonProbe.kind === "available" || daemonProbe.kind === "support-error" ? daemonProbe.api : null;
		const updateAndApplySupported = daemonProbe.kind === "available" ? daemonProbe.updateAndApplySupported : null;
		React.useEffect(() => {
			let cancelled = false;
			let probing = false;
			const probe = async () => {
				if (probing) return;
				probing = true;
				try {
					const api = daemonApi();
					if (!api) {
						if (!cancelled) setDaemonProbe({ kind: "unavailable" });
						return;
					}
					let up;
					try {
						up = await api.available();
					} catch {
						if (!cancelled) setDaemonProbe({ kind: "availability-error" });
						return;
					}
					if (cancelled) return;
					if (!up) {
						setDaemonProbe({ kind: "unavailable" });
						return;
					}
					const info = await api.daemonInfo?.().catch(() => null);
					if (!cancelled) setDaemonInfo(info ?? null);
					try {
						const updateSupported = await api.updateAndApplySupported?.() ?? null;
						if (!cancelled) setDaemonProbe({
							kind: "available",
							api,
							updateAndApplySupported: updateSupported
						});
					} catch {
						if (!cancelled) setDaemonProbe({
							kind: "support-error",
							api
						});
					}
				} finally {
					probing = false;
				}
			};
			probe();
			const timer = globalThis.setInterval(() => void probe(), 5e3);
			return () => {
				cancelled = true;
				globalThis.clearInterval(timer);
			};
		}, []);
		React.useEffect(() => daemon?.updateAndApply?.observe(setUpdateStatus), [daemon]);
		React.useEffect(() => {
			fetchSupportStatus().then(setSupport);
		}, []);
		const [published, setPublished] = React.useState(null);
		React.useEffect(() => {
			fetchPublishedVersions().then(setPublished);
		}, []);
		const staleStaged = React.useMemo(() => published ? deriveStaleStaged(state.modules, published) : [], [state.modules, published]);
		React.useEffect(() => {
			const advice = updateAdvice(state.spotifyVersion, effectiveSupport(state, support));
			if (advice.kind !== "unsupported" || unsupportedNoticeShown) return;
			const notify = () => {
				const enqueue = client.snackbar?.enqueueSnackbar;
				if (typeof enqueue === "function") try {
					enqueue(advice.message, { variant: "warning" });
					unsupportedNoticeShown = true;
					return true;
				} catch {}
				return false;
			};
			return retryNotice(notify);
		}, [
			state.spotifyVersion,
			state.classmapSpotify,
			state.classmapVerified,
			state.supportedSpotify,
			support
		]);
		React.useEffect(() => {
			const timer = setInterval(() => setState(deriveManagerState()), 2e3);
			return () => clearInterval(timer);
		}, []);
		const onAction = (label, fn) => {
			setBusy(true);
			setStatus(`${label}…`);
			(async () => {
				try {
					setStatus(describeAction(label, await fn()));
				} catch (e) {
					setStatus(`${label} failed: ${e.message}`);
				} finally {
					setBusy(false);
					setState(deriveManagerState());
				}
			})();
		};
		const selfUpdate = /* @__PURE__ */ jsx(SpicetifySelfUpdate, {
			daemon,
			daemonInfo,
			setDaemonInfo,
			cliVersion: state.cliVersion,
			busy,
			onAction
		});
		const copyToClipboard = async (text, done) => {
			if (!navigator.clipboard) {
				setStatus("clipboard unavailable in this client");
				return;
			}
			try {
				await navigator.clipboard.writeText(text);
				setStatus(done);
			} catch (e) {
				setStatus(`copy failed: ${e.message}`);
			}
		};
		const copyEnvironment = () => {
			const advice = updateAdvice(state.spotifyVersion, effectiveSupport(state, support));
			const lines = [
				`Spotify: ${show(state.spotifyVersion)}`,
				`classmap: ${show(state.classmapKey)}`,
				`CLI: ${show(state.cliVersion)}`,
				`updates blocked: ${showBool(state.updatesBlocked)}`,
				`transforms: ${state.transformsEnabled ? "on" : "off"}`,
				`modules: ${state.loadedCount}/${state.modules.length} loaded${state.failedCount ? `, ${state.failedCount} failed` : ""}`,
				`update status: ${advice.message}`,
				...staleStaged.map((r) => `stale staged: ${r.id}@${r.staged} (${r.published} published)`),
				"",
				"modules:",
				...state.modules.map((m) => `  - ${m.id}@${m.version} [${m.source}] ${m.loaded ? "loaded" : m.failed !== void 0 ? `failed: ${m.failed}` : "disabled"}`)
			];
			copyToClipboard(lines.join("\n"), "environment copied");
		};
		const copyDiagnostics = () => {
			const text = state.diagnostics.map((d) => `${new Date(d.ts).toISOString()} [${d.level}] ${d.message}`).join("\n");
			copyToClipboard(text, "diagnostics copied");
		};
		const q = filter.toLowerCase();
		const visible = state.modules.filter((m) => m.id.toLowerCase().includes(q));
		return /* @__PURE__ */ jsxs("div", {
			className: "spicetify-manager-page",
			children: [
				/* @__PURE__ */ jsxs("header", {
					className: "spicetify-manager-header",
					children: [/* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("h1", { children: "Spicetify Manager" }), /* @__PURE__ */ jsx("p", {
						className: "spicetify-manager-subtitle",
						children: "Runtime control for modules, boot health, and diagnostics"
					})] }), /* @__PURE__ */ jsx(TextInput, {
						placeholder: "Filter modules…",
						value: filter,
						onInput: setFilter
					})]
				}),
				/* @__PURE__ */ jsx("div", {
					className: "spicetify-manager-status",
					children: status
				}),
				/* @__PURE__ */ jsxs("section", { children: [
					/* @__PURE__ */ jsxs("div", {
						className: "spicetify-manager-section-head",
						children: [/* @__PURE__ */ jsx("h2", { children: "Environment" }), /* @__PURE__ */ jsx("button", {
							type: "button",
							onClick: copyEnvironment,
							children: "Copy details"
						})]
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "spicetify-manager-env",
						children: [
							/* @__PURE__ */ jsxs(Badge, { children: ["Spotify ", show(state.spotifyVersion)] }),
							/* @__PURE__ */ jsxs(Badge, { children: ["classmap ", show(state.classmapKey)] }),
							/* @__PURE__ */ jsxs(Badge, { children: ["CLI ", show(state.cliVersion)] }),
							/* @__PURE__ */ jsxs(Badge, {
								kind: state.updatesBlocked ? "ok" : void 0,
								children: ["updates blocked: ", showBool(state.updatesBlocked)]
							}),
							/* @__PURE__ */ jsxs(Badge, { children: ["transforms: ", state.transformsEnabled ? "on" : "off"] }),
							/* @__PURE__ */ jsxs(Badge, {
								kind: state.failedCount ? "bad" : "ok",
								children: [
									"modules: ",
									state.loadedCount,
									"/",
									state.modules.length,
									" loaded",
									state.failedCount ? `, ${state.failedCount} failed` : ""
								]
							})
						]
					}),
					/* @__PURE__ */ jsxs("p", {
						className: "spicetify-manager-note",
						children: [
							"After changing modules staged on disk, run ",
							/* @__PURE__ */ jsx("code", { children: "spicetify apply" }),
							" to rebuild the client and restart Spotify."
						]
					}),
					staleStaged.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [/* @__PURE__ */ jsx("div", {
						className: "spicetify-manager-env",
						children: staleStaged.map((row) => /* @__PURE__ */ jsxs(Badge, {
							kind: "bad",
							children: [
								"staged ",
								row.id,
								"@",
								row.staged,
								" — ",
								row.published,
								" published"
							]
						}, row.id))
					}), /* @__PURE__ */ jsxs("p", {
						className: "spicetify-manager-note",
						children: [
							"These staged modules are behind the vault. Run ",
							/* @__PURE__ */ jsx("code", { children: "spicetify apply" }),
							" to refresh store-managed system modules and rebuild the client. Update other modules in the Store, or at their source if you installed them manually. Applying restarts Spotify."
						]
					})] })
				] }),
				state.managedSpotify ? /* @__PURE__ */ jsx(ManagedSpotifyUpdates, {
					api: daemon?.managedSpotify,
					daemonAvailable: daemon !== null,
					channel: state.managedSpotify,
					installed: state.spotifyVersion,
					children: selfUpdate
				}) : (() => {
					const sup = effectiveSupport(state, support);
					const advice = updateAdvice(state.spotifyVersion, sup);
					const cmd = (text, label) => /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: () => void copyToClipboard(text, `${label.replace(/^copy /, "")} copied`),
						children: label
					});
					const run = (label, fn) => /* @__PURE__ */ jsx("button", {
						type: "button",
						disabled: busy,
						onClick: () => {
							if (!globalThis.confirm(`${label}: Spotify will restart. Continue?`)) return;
							onAction(label, fn);
						},
						children: label
					});
					const action = (label, method, fallback) => daemon ? run(label, () => daemon[method]()) : cmd(fallback, label);
					const daemonMessage = (() => {
						switch (daemonProbe.kind) {
							case "checking": return "Checking the local daemon. These actions may be unavailable until the check finishes.";
							case "unavailable": return "Manager cannot reach the daemon. The buttons below copy terminal commands; they do not run them.";
							case "availability-error": return "Manager could not check whether the daemon is running. It will retry; until then, copy a terminal command below.";
							case "support-error": return "The daemon is running, but Manager could not check Update & Apply support. Block and allow still use the daemon, and Manager will retry the check.";
							case "available": return daemonProbe.updateAndApplySupported === true ? "Update handling runs through the local daemon. Spotify restarts." : daemonProbe.updateAndApplySupported === false ? "One-step Update & Apply is unavailable on this platform or Spotify client. Choose allow, update Spotify normally, then run spicetify apply." : "One-step Update & Apply needs a current Spicetify daemon and wrapper.";
						}
					})();
					const updateMessage = (() => {
						switch (updateStatus.kind) {
							case "idle": return null;
							case "accepted": return "Update accepted. Spotify's updater is starting.";
							case "waiting-for-update": return "Waiting for Spotify to offer the verified update.";
							case "downloading": return `Downloading Spotify ${updateStatus.targetVersion}.`;
							case "installing-spotify": return `Installing Spotify ${updateStatus.targetVersion}. Spotify will restart.`;
							case "applying-spicetify": return `Spotify ${updateStatus.targetVersion} is installed; reapplying the customization.`;
							case "securing": return updateStatus.message ?? "Restoring and verifying the Spotify update block.";
							case "complete": return `Last update completed: Spotify ${updateStatus.fromVersion} → ${updateStatus.toVersion}. Spicetify was reapplied and the update block restored.`;
							case "failed-safe": return `Last update attempt stopped safely: ${updateStatus.message}`;
						}
					})();
					return /* @__PURE__ */ jsxs("section", { children: [
						/* @__PURE__ */ jsx("div", {
							className: "spicetify-manager-section-head",
							children: /* @__PURE__ */ jsx("h2", { children: "Updates" })
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "spicetify-manager-env",
							children: [
								/* @__PURE__ */ jsxs(Badge, { children: ["installed ", show(state.spotifyVersion)] }),
								/* @__PURE__ */ jsxs(Badge, {
									kind: sup?.supportedSpotify ? "ok" : void 0,
									children: ["supported ", show(sup?.supportedSpotify)]
								}),
								/* @__PURE__ */ jsxs(Badge, { children: ["available ", show(sup?.latestSpotify)] })
							]
						}),
						/* @__PURE__ */ jsx("p", {
							className: `spicetify-manager-update spicetify-manager-update--${advice.kind}`,
							children: advice.message
						}),
						state.classmapFallback && /* @__PURE__ */ jsx("p", {
							className: "spicetify-manager-update spicetify-manager-update--unsupported",
							children: "Running on a fallback classmap: this Spotify build has no verified classmap yet, so some chrome may be off. It self-heals once one ships."
						}),
						/* @__PURE__ */ jsx("p", {
							className: "spicetify-manager-note",
							children: daemonMessage
						}),
						selfUpdate,
						advice.kind === "ready" && updateAndApplySupported === null && /* @__PURE__ */ jsx("p", {
							className: "spicetify-manager-note",
							children: SPICETIFY_UPGRADE.instructions
						}),
						updateMessage && /* @__PURE__ */ jsx("p", {
							className: `spicetify-manager-update spicetify-manager-update--${updateStatus.kind === "securing" && updateStatus.manualRecovery ? "unsupported" : "ready"}`,
							children: updateMessage
						}),
						/* @__PURE__ */ jsxs("div", {
							className: "spicetify-manager-update-actions",
							children: [
								action("block", "blockUpdates", "spicetify spotify-updates block"),
								action("allow", "unblockUpdates", "spicetify spotify-updates unblock"),
								advice.kind === "ready" && (updateAndApplySupported && daemon?.updateAndApply ? run("update & apply", async () => {
									return (await daemon.updateAndApply()).disposition === "joined" ? "joined existing update" : "update accepted";
								}) : updateAndApplySupported === null ? cmd(SPICETIFY_UPGRADE.command, SPICETIFY_UPGRADE.label) : cmd("spicetify apply", "copy apply command"))
							]
						})
					] });
				})(),
				/* @__PURE__ */ jsxs("section", { children: [/* @__PURE__ */ jsx("h2", { children: "Modules" }), /* @__PURE__ */ jsxs("div", {
					className: "spicetify-manager-modules",
					children: [visible.map((row) => /* @__PURE__ */ jsx(ModuleRow, {
						row,
						busy,
						onAction
					}, row.id)), !visible.length && /* @__PURE__ */ jsx("div", {
						className: "spicetify-manager-empty",
						children: state.modules.length ? "No modules match the filter" : "No modules installed"
					})]
				})] }),
				/* @__PURE__ */ jsxs("section", { children: [/* @__PURE__ */ jsxs("div", {
					className: "spicetify-manager-section-head",
					children: [/* @__PURE__ */ jsx("h2", { children: "Diagnostics" }), /* @__PURE__ */ jsx("button", {
						type: "button",
						onClick: copyDiagnostics,
						disabled: !state.diagnostics.length,
						children: "Copy all"
					})]
				}), /* @__PURE__ */ jsxs("div", {
					className: "spicetify-manager-diag",
					children: [state.diagnostics.map((d, i) => /* @__PURE__ */ jsxs("div", {
						className: `spicetify-manager-diag__entry ${LEVEL_CLASS[d.level] ?? ""}`,
						children: [/* @__PURE__ */ jsx("span", {
							className: "spicetify-manager-diag__time",
							children: new Date(d.ts).toLocaleTimeString()
						}), /* @__PURE__ */ jsx("span", { children: d.message })]
					}, i)), !state.diagnostics.length && /* @__PURE__ */ jsx("div", {
						className: "spicetify-manager-empty",
						children: "No diagnostics recorded"
					})]
				})] })
			]
		});
	};
}));
//#endregion
//#region modules/manager/menuItem.tsx
var MANAGER_ROUTE, SpicetifyMenuItem;
var init_menuItem = __esmMin((() => {
	MANAGER_ROUTE = "/bespoke/manager";
	SpicetifyMenuItem = () => {
		if (!openedFromProfileMenu(useMenuItem())) return null;
		return /* @__PURE__ */ jsx(MenuItem, {
			className: "spicetify-manager-menu-item",
			onClick: () => {
				Platform.getHistory().push(SPICETIFY_SETTINGS_ROUTE);
				closeMenu();
			},
			children: "Spicetify Settings"
		});
	};
}));
//#endregion
//#region modules/manager/fallback.ts
function buildFallbackPanel(rows, actions) {
	const panel = document.createElement("div");
	panel.id = "spicetify-manager-fallback";
	panel.className = "spicetify-manager-fallback";
	const title = document.createElement("p");
	title.className = "spicetify-manager-fallback__title";
	title.textContent = "Spicetify manager — recovery mode";
	const note = document.createElement("p");
	note.className = "spicetify-manager-fallback__note";
	note.textContent = "The client's React could not be captured, so module UIs (including the normal manager) cannot render. Disable or remove a suspect module below, then reload.";
	panel.append(title, note);
	const list = document.createElement("ul");
	list.className = "spicetify-manager-fallback__list";
	for (const row of rows) {
		const item = document.createElement("li");
		const label = document.createElement("span");
		label.textContent = `${row.id}@${row.version}${row.source === "local" ? " (local)" : ""}${row.failed ? " — failed" : row.loaded ? "" : " — disabled"}`;
		item.append(label);
		const btn = (text, onClick) => {
			const b = document.createElement("button");
			b.textContent = text;
			b.onclick = () => {
				b.disabled = true;
				onClick();
			};
			item.append(b);
		};
		if (row.loaded || row.failed) btn("Disable", () => actions.disable(row.id));
		else btn("Enable", () => actions.enable(row.id));
		if (row.source === "local") btn("Remove local", () => actions.removeLocal(row.id));
		list.append(item);
	}
	panel.append(list);
	const reload = document.createElement("button");
	reload.className = "spicetify-manager-fallback__reload";
	reload.textContent = "Reload Spotify";
	reload.onclick = () => actions.reload();
	panel.append(reload);
	return panel;
}
function captureHealthy(react) {
	return typeof react?.createElement === "function";
}
function mountManagerFallback() {
	const g = managerRuntime();
	const M = managerModules();
	const panel = buildFallbackPanel(deriveManagerState().modules, {
		disable: (id) => M?.disable?.(id),
		enable: (id) => M?.enable?.(id),
		removeLocal: (id) => M?.removeLocal?.(id),
		reload: () => g.location?.reload?.()
	});
	document.body.append(panel);
	return () => panel.remove();
}
var init_fallback = __esmMin((() => {
	init_state();
	init_runtime();
}));
//#endregion
//#region modules/manager/mod.tsx
var manager_exports = /* @__PURE__ */ __exportAll({ default: () => manager_default });
async function manager_default(ctx) {
	if (!captureHealthy(React)) {
		ctx.defer(mountManagerFallback());
		return;
	}
	const registrar = createRegistrar(ctx);
	registrar.register("menu", /* @__PURE__ */ jsx(SpicetifyMenuItem, {}));
	registrar.register("settingsAction", /* @__PURE__ */ jsx(ManagerSettingsAction, {}));
	registrar.registerRoute(MANAGER_ROUTE, /* @__PURE__ */ jsx(ManagerPage, {}));
}
var ManagerSettingsAction;
var init_manager = __esmMin((() => {
	init_page();
	init_menuItem();
	init_fallback();
	ManagerSettingsAction = () => /* @__PURE__ */ jsx(SettingsSection, {
		title: "Module Manager",
		children: /* @__PURE__ */ jsx(SettingsRow, {
			label: "Install, update, enable, and troubleshoot modules",
			children: /* @__PURE__ */ jsx(Button, {
				onClick: () => Platform.getHistory().push(MANAGER_ROUTE),
				children: "Open Module Manager"
			})
		})
	});
}));
//#endregion
//#region modules/manager/index.ts
async function load(ctx) {
	return (await Promise.resolve().then(() => (init_manager(), manager_exports))).default(ctx);
}
//#endregion
export { load };

//# sourceMappingURL=index.js.map