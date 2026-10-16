# Contract generation

`src/BranchStudio.Contracts` is the source for persisted enum spellings and node metadata. It has no external packages and targets .NET Standard 2.1 / C# 9 so runtimes can reference it from Unity and .NET. `ContractValueAttribute` explicitly defines JSON strings; enum numeric values are not a JSON serialization contract.

From the repository root, using the .NET 10 SDK:

```sh
dotnet run --project tools/BranchStudio.ContractGen -- --output web/src/generated
dotnet run --project tools/BranchStudio.ContractGen -- --output web/src/generated --check
dotnet run --project tools/BranchStudio.ContractGen -- --self-test
```

The output directory receives `contracts.generated.ts`, `contracts.generated.json`, and `contracts.generated.cs`. All output is deterministic UTF-8 without BOM, with LF line endings and no timestamps. `--check` compares exact bytes, returns exit code 1 for missing/stale files, and never changes output. Invalid arguments return 2. Normal generation only rewrites changed files.

TypeScript exports `schemaVersion`, `modes`, `nodeKinds`, `nodeCategories`, `statuses`, `workflowResults`, `variableTypes`, `validationSeverities`, the corresponding union types, and `nodeDefinitions`. Compatibility aliases `Mode` and `Status` are exported alongside `ProjectMode` and `NodeStatus`. A `null` `maxChildren` means unbounded; the editor adapter converts it to `Infinity`. Parameter defaults remain strings, finite numbers, or booleans. Lists and default parameter keys retain their C# declaration order. The `Defaults(...)` argument order is the canonical Inspector field order and is preserved in both TypeScript and JSON.

The generated C# file contains the same enum declarations, numeric values, and string attributes under `BranchStudio.Contracts`. It is self-contained C# 9 and has no JSON-library dependency. Include the contracts once per C# project: use the source project reference **or** the generated declarations, not both. Bundling the declarations into more than one downloaded runtime file likewise requires keeping a single copy when those runtimes are combined.

`--self-test` verifies catalog completeness, stable wire values/status numbers, deterministic output, encoding, JSON metadata, and read-only stale/missing checks for every format. It uses only temporary files and the framework libraries.
