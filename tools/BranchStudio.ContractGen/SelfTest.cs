using System.Text.Json;
using BranchStudio.Contracts;

namespace BranchStudio.ContractGen;

internal static class SelfTest
{
    internal static void Run()
    {
        var checks = 0;
        void Assert(bool condition, string description)
        {
            if (!condition) throw new InvalidOperationException("Self-test failed: " + description);
            checks++;
        }
        var first = ContractGenerator.Generate();
        var second = ContractGenerator.Generate();
        Assert(first.Count == 3, "all artifact formats exist");
        foreach (var artifact in first)
        {
            Assert(artifact.Value.AsSpan().SequenceEqual(second[artifact.Key]), "deterministic " + artifact.Key);
            Assert(!(artifact.Value.Length >= 3 && artifact.Value[0] == 0xef && artifact.Value[1] == 0xbb && artifact.Value[2] == 0xbf),
                "UTF-8 without BOM: " + artifact.Key);
            Assert(!artifact.Value.Contains((byte)'\r'), "LF line endings: " + artifact.Key);
        }
        Assert(ContractValue.GetName(ProjectMode.Game) == "game", "persisted mode spelling");
        Assert(ContractValue.GetName(NodeCategory.GameAi) == "Game AI", "category spelling");
        Assert(ContractValue.GetName(VariableType.Bool) == "bool", "variable spelling");
        Assert((int)NodeStatus.Running == 0 && (int)NodeStatus.Success == 1 && (int)NodeStatus.Failure == 2,
            "existing runtime status numeric compatibility");
        using var document = JsonDocument.Parse(first["contracts.generated.json"]);
        var root = document.RootElement;
        Assert(root.GetProperty("schemaVersion").GetInt32() == ContractCatalog.SchemaVersion, "schema version");
        Assert(root.GetProperty("statuses").EnumerateArray().Select(item => item.GetString())
            .SequenceEqual(new[] { "Idle", "Running", "Success", "Failure" }), "declaration order includes Idle first");
        var nodes = root.GetProperty("nodeDefinitions").EnumerateArray().ToArray();
        Assert(nodes.Length == ContractCatalog.NodeKinds.Count, "node metadata completeness");
        var selector = nodes.Single(node => node.GetProperty("kind").GetString() == "Selector");
        Assert(selector.GetProperty("maxChildren").ValueKind == JsonValueKind.Null, "unbounded children encoded as null");
        var condition = nodes.Single(node => node.GetProperty("kind").GetString() == "Condition");
        Assert(condition.GetProperty("defaults").GetProperty("arguments").GetString() == "", "empty arguments preserved");
        Assert(condition.GetProperty("defaults").EnumerateObject().Select(property => property.Name)
            .SequenceEqual(new[] { "method", "arguments", "mock" }), "Condition Inspector field order preserved");
        var httpRequest = nodes.Single(node => node.GetProperty("kind").GetString() == "HttpRequest");
        Assert(httpRequest.GetProperty("defaults").EnumerateObject().Select(property => property.Name)
            .SequenceEqual(new[] { "method", "httpMethod", "url", "headers", "timeout", "credentialEnv", "mock" }),
            "HTTP Request Inspector field order preserved");
        bool HasDeclaredDefaultOrder(JsonElement[] generatedNodes) => generatedNodes.Zip(ContractCatalog.NodeDefinitions)
            .All(pair => pair.First.GetProperty("defaults").EnumerateObject().Select(property => property.Name)
                .SequenceEqual(pair.Second.Defaults.Keys));
        Assert(HasDeclaredDefaultOrder(nodes), "all JSON defaults follow catalog declaration order");
        var typescript = System.Text.Encoding.UTF8.GetString(first["contracts.generated.ts"]);
        const string marker = "export const nodeDefinitions: GeneratedNodeDefinition[] =";
        using var typescriptNodes = JsonDocument.Parse(typescript[(typescript.IndexOf(marker, StringComparison.Ordinal) + marker.Length)..]
            .Trim().TrimEnd(';'));
        Assert(HasDeclaredDefaultOrder(typescriptNodes.RootElement.EnumerateArray().ToArray()),
            "all TypeScript defaults follow catalog declaration order");
        var path = Path.Combine(Path.GetTempPath(), "branch-studio-contractgen-" + Guid.NewGuid().ToString("N"));
        try
        {
            Assert(GeneratedFiles.FindStale(path, first).Count == first.Count && !Directory.Exists(path),
                "missing-file check does not write");
            GeneratedFiles.Write(path, first);
            Assert(GeneratedFiles.FindStale(path, first).Count == 0, "generated files pass check");
            foreach (var artifact in first)
            {
                var file = Path.Combine(path, artifact.Key);
                var timestamp = File.GetLastWriteTimeUtc(file);
                GeneratedFiles.Write(path, first);
                Assert(File.GetLastWriteTimeUtc(file) == timestamp, "unchanged output is not rewritten: " + artifact.Key);
                File.AppendAllText(file, "stale");
                Assert(GeneratedFiles.FindStale(path, first).SequenceEqual(new[] { artifact.Key }), "detect stale " + artifact.Key);
                Assert(File.ReadAllText(file).EndsWith("stale", StringComparison.Ordinal), "check preserves stale file " + artifact.Key);
                GeneratedFiles.Write(path, first);
                File.Delete(file);
                Assert(GeneratedFiles.FindStale(path, first).SequenceEqual(new[] { artifact.Key }), "detect missing " + artifact.Key);
                Assert(!File.Exists(file), "check does not recreate missing " + artifact.Key);
                GeneratedFiles.Write(path, first);
            }
        }
        finally
        {
            if (Directory.Exists(path)) Directory.Delete(path, recursive: true);
        }
        Console.WriteLine($"Contract generator checks passed: {checks}.");
    }
}
