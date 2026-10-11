import { warn } from "../logger.js";
import { onWebpackCaptured } from "../webpack/index.js";
import { React, onFallbackRecovery } from "./React.js";
//#region modules/stdlib/src/expose/react-shim.ts
const R = React;
var react_shim_default = React;
let Children;
let Component;
let Fragment;
let Profiler;
let PureComponent;
let StrictMode;
let Suspense;
let cloneElement;
let createContext;
let createElement;
let createFactory;
let createRef;
let forwardRef;
let isValidElement;
let lazy;
let memo;
let startTransition;
let useCallback;
let useContext;
let useDebugValue;
let useDeferredValue;
let useEffect;
let useId;
let useImperativeHandle;
let useInsertionEffect;
let useLayoutEffect;
let useMemo;
let useReducer;
let useRef;
let useState;
let useSyncExternalStore;
let useTransition;
let version;
function populate() {
	Children = R.Children;
	Component = R.Component;
	Fragment = R.Fragment;
	Profiler = R.Profiler;
	PureComponent = R.PureComponent;
	StrictMode = R.StrictMode;
	Suspense = R.Suspense;
	cloneElement = R.cloneElement;
	createContext = R.createContext;
	createElement = R.createElement;
	createFactory = R.createFactory;
	createRef = R.createRef;
	forwardRef = R.forwardRef;
	isValidElement = R.isValidElement;
	lazy = R.lazy;
	memo = R.memo;
	startTransition = R.startTransition;
	useCallback = R.useCallback;
	useContext = R.useContext;
	useDebugValue = R.useDebugValue;
	useDeferredValue = R.useDeferredValue;
	useEffect = R.useEffect;
	useId = R.useId;
	useImperativeHandle = R.useImperativeHandle;
	useInsertionEffect = R.useInsertionEffect;
	useLayoutEffect = R.useLayoutEffect;
	useMemo = R.useMemo;
	useReducer = R.useReducer;
	useRef = R.useRef;
	useState = R.useState;
	useSyncExternalStore = R.useSyncExternalStore;
	useTransition = R.useTransition;
	version = R.version;
}
onWebpackCaptured(() => {
	populate();
	if (typeof createElement !== "function") {
		warn("[stdlib] capture health: the client React was not found in the webpack capture — named `react` imports are degraded until the fallback loads (needle drift after a Spotify update?)");
		onFallbackRecovery(() => {
			populate();
			if (typeof createElement === "function") warn("[stdlib] capture health: named `react` imports recovered via the fallback copy");
		});
	}
});
//#endregion
export { Children, Component, Fragment, Profiler, PureComponent, StrictMode, Suspense, cloneElement, createContext, createElement, createFactory, createRef, react_shim_default as default, forwardRef, isValidElement, lazy, memo, startTransition, useCallback, useContext, useDebugValue, useDeferredValue, useEffect, useId, useImperativeHandle, useInsertionEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition, version };

//# sourceMappingURL=react-shim.js.map