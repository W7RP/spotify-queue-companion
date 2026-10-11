import { transformer } from "../../mixin.js";
//#region modules/stdlib/src/expose/GraphQL.ts
const GraphQLDefs = {
	query: {},
	mutation: {}
};
transformer((emit) => (str) => {
	emit();
	const matches = str.matchAll(/(=new [a-zA-Z_\$][\w\$]*\.[a-zA-Z_\$][\w\$]*\("(?<name>\w+)","(?<operation>query|mutation)","(?<sha256Hash>[\w\d]{64})",null\))/g);
	for (const match of matches) {
		const { name, operation, sha256Hash } = match.groups;
		GraphQLDefs[operation][name] = {
			name,
			operation,
			sha256Hash,
			value: null
		};
	}
	return str;
}, { glob: /.+\.js$/ });
//#endregion
export { GraphQLDefs };

//# sourceMappingURL=GraphQL.js.map