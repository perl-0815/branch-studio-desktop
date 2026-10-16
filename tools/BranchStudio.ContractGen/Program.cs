using BranchStudio.ContractGen;

try
{
    if (args is ["--help"] or ["-h"])
    {
        Console.WriteLine("Usage: ContractGen --output <directory> [--check]\n       ContractGen --self-test");
        return 0;
    }

    if (args is ["--self-test"])
    {
        SelfTest.Run();
        return 0;
    }

    string? output = null;
    var check = false;
    for (var index = 0; index < args.Length; index++)
    {
        switch (args[index])
        {
            case "--output" when output is null && index + 1 < args.Length && !args[index + 1].StartsWith("--", StringComparison.Ordinal):
                output = args[++index];
                break;
            case "--check" when !check:
                check = true;
                break;
            default:
                Console.Error.WriteLine($"Unknown or incomplete argument: {args[index]}");
                return 2;
        }
    }

    if (string.IsNullOrWhiteSpace(output))
    {
        Console.Error.WriteLine("Specify --output <directory>. Use --help for usage.");
        return 2;
    }

    var artifacts = ContractGenerator.Generate();
    var directory = Path.GetFullPath(output);
    if (check)
    {
        var stale = GeneratedFiles.FindStale(directory, artifacts);
        foreach (var name in stale)
            Console.Error.WriteLine($"Missing or stale generated contract: {Path.Combine(directory, name)}");
        if (stale.Count != 0)
        {
            Console.Error.WriteLine("Run ContractGen with the same --output directory and without --check.");
            return 1;
        }
        Console.WriteLine($"Contracts are current ({artifacts.Count} files).");
        return 0;
    }

    GeneratedFiles.Write(directory, artifacts);
    Console.WriteLine($"Generated {artifacts.Count} contract files in {directory}.");
    return 0;
}
catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or ArgumentException or InvalidOperationException)
{
    Console.Error.WriteLine($"Contract generation failed: {exception.Message}");
    return 1;
}
