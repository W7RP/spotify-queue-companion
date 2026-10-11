import { findBy } from "../util.js";
import { webpackRequire } from "../wpunpk.mix.js";
import { exported, exportedFunctions, modules } from "./index.js";
//#region modules/stdlib/src/webpack/ReactQuery.xpui.ts
await CHUNKS.xpui.promise;
const QueryClient = findBy("defaultMutationOptions")(exportedFunctions);
const PersistQueryClientProvider = findBy("persistOptions")(exportedFunctions);
const QueryClientProvider = findBy("use QueryClientProvider")(exportedFunctions);
const notifyManager = exported.find((m) => typeof m.setBatchNotifyFunction === "function");
const useMutation = findBy("mutateAsync")(exportedFunctions);
const useQuery = findBy(/^function [a-zA-Z_\$][\w\$]*\(([a-zA-Z_\$][\w\$]*),([a-zA-Z_\$][\w\$]*)\)\{return\(0,[a-zA-Z_\$][\w\$]*\.[a-zA-Z_\$][\w\$]*\)\(\1,[a-zA-Z_\$][\w\$]*\.[a-zA-Z_\$][\w\$]*,\2\)\}$/)(exportedFunctions);
const useQueryClient = findBy("client", "Provider", "mount")(exportedFunctions);
const useSuspenseQuery = findBy("throwOnError", "suspense", "enabled", "placeholderData")(exportedFunctions);
const [infiniteQueryModuleID] = modules.find(([_, v]) => v.toString().includes("fetchPreviousPage") && v.toString().includes("getOptimisticResult"));
const useInfiniteQuery = Object.values(webpackRequire(infiniteQueryModuleID)).find((m) => typeof m === "function");
//#endregion
export { PersistQueryClientProvider, QueryClient, QueryClientProvider, notifyManager, useInfiniteQuery, useMutation, useQuery, useQueryClient, useSuspenseQuery };

//# sourceMappingURL=ReactQuery.xpui.js.map