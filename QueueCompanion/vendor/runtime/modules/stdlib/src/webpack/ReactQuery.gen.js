//#region modules/stdlib/src/webpack/ReactQuery.gen.ts
let QueryClient;
let PersistQueryClientProvider;
let QueryClientProvider;
let notifyManager;
let useMutation;
let useQuery;
let useQueryClient;
let useSuspenseQuery;
let useInfiniteQuery;
import("./ReactQuery.xpui.js").then((m) => {
	QueryClient = m.QueryClient;
	PersistQueryClientProvider = m.PersistQueryClientProvider;
	QueryClientProvider = m.QueryClientProvider;
	notifyManager = m.notifyManager;
	useMutation = m.useMutation;
	useQuery = m.useQuery;
	useQueryClient = m.useQueryClient;
	useSuspenseQuery = m.useSuspenseQuery;
	useInfiniteQuery = m.useInfiniteQuery;
}).catch((e) => console.warn("[stdlib] lazy webpack surface ./ReactQuery.xpui.ts failed:", e));
//#endregion
export { PersistQueryClientProvider, QueryClient, QueryClientProvider, notifyManager, useInfiniteQuery, useMutation, useQuery, useQueryClient, useSuspenseQuery };

//# sourceMappingURL=ReactQuery.gen.js.map