import { isCancelledError } from "./node_modules/.pnpm/@tanstack_query-core@5.103.0/node_modules/@tanstack/query-core/build/modern/retryer.js";
import { QueryObserver } from "./node_modules/.pnpm/@tanstack_query-core@5.103.0/node_modules/@tanstack/query-core/build/modern/queryObserver.js";
import { QueryClient } from "./node_modules/.pnpm/@tanstack_query-core@5.103.0/node_modules/@tanstack/query-core/build/modern/queryClient.js";
//#region modules/stdlib/query.ts
/** A cache owned by one module load; unloading cancels queries and discards data. */
function createModuleQueryClient(ctx) {
	const client = new QueryClient({ defaultOptions: {
		queries: {
			staleTime: 300 * 1e3,
			gcTime: 600 * 1e3,
			retry: false,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false
		},
		mutations: { retry: false }
	} });
	ctx.defer(async () => {
		await client.cancelQueries();
		client.clear();
	});
	return client;
}
//#endregion
export { QueryClient, QueryObserver, createModuleQueryClient, isCancelledError };

//# sourceMappingURL=query.js.map