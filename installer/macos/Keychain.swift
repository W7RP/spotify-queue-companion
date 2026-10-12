import Foundation
import Security

// Only a non-secret account digest is accepted on argv. Values use stdin/stdout.
let args = CommandLine.arguments
guard args.count == 3, ["get", "set", "delete"].contains(args[1]),
      args[2].count == 64, args[2].allSatisfy({ $0.isHexDigit }) else { exit(2) }
let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "org.queuecompanion.credentials", kSecAttrAccount as String: args[2]]
var status: OSStatus
switch args[1] {
case "get":
    var search = query; search[kSecReturnData as String] = true
    search[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    status = SecItemCopyMatching(search as CFDictionary, &result)
    if status == errSecItemNotFound { exit(0) }
    if status == errSecSuccess, let data = result as? Data { FileHandle.standardOutput.write(data) }
case "set":
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard !data.isEmpty, data.count <= 256_000 else { exit(2) }
    status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
    if status == errSecItemNotFound {
        var entry = query; entry[kSecValueData as String] = data
        status = SecItemAdd(entry as CFDictionary, nil)
    }
default:
    status = SecItemDelete(query as CFDictionary)
    if status == errSecItemNotFound { status = errSecSuccess }
}
exit(status == errSecSuccess ? 0 : 1)
