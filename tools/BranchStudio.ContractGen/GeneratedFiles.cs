namespace BranchStudio.ContractGen;

internal static class GeneratedFiles
{
    internal static IReadOnlyList<string> FindStale(string directory, IReadOnlyDictionary<string, byte[]> artifacts) =>
        artifacts.Where(artifact => !File.Exists(Path.Combine(directory, artifact.Key))
            || !File.ReadAllBytes(Path.Combine(directory, artifact.Key)).AsSpan().SequenceEqual(artifact.Value))
            .Select(artifact => artifact.Key).ToArray();

    internal static void Write(string directory, IReadOnlyDictionary<string, byte[]> artifacts)
    {
        Directory.CreateDirectory(directory);
        foreach (var artifact in artifacts)
        {
            var path = Path.Combine(directory, artifact.Key);
            if (File.Exists(path) && File.ReadAllBytes(path).AsSpan().SequenceEqual(artifact.Value))
                continue;
            var temporaryPath = path + "." + Guid.NewGuid().ToString("N") + ".tmp";
            try
            {
                File.WriteAllBytes(temporaryPath, artifact.Value);
                File.Move(temporaryPath, path, overwrite: true);
            }
            finally
            {
                if (File.Exists(temporaryPath)) File.Delete(temporaryPath);
            }
        }
    }
}
