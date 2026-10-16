using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace BranchStudio.Desktop.Services;

public sealed record NativeBridgeRequest(string Type, string RequestId, string? FileName, string? Content, string? MimeType);

public sealed record NativeBridgeResponse(string Type, string RequestId)
{
    public string? FileName { get; init; }
    public string? Content { get; init; }
    public string? Operation { get; init; }
    public string? Code { get; init; }
    public string? Message { get; init; }
    public bool? Cancelled { get; init; }

    public static NativeBridgeResponse Failure(string requestId, string operation, string code, string message, bool cancelled = false) =>
        new("operationFailed", requestId) { Operation = operation, Code = code, Message = message, Cancelled = cancelled };
}

public sealed class BridgeProtocolException(string code, string message, string requestId = "", string operation = "unknown") : Exception(message)
{
    public string Code { get; } = code;
    public string RequestId { get; } = requestId;
    public string Operation { get; } = operation;
}

/// <summary>Data-only boundary shared by the native picker and JS RawMessage transport.</summary>
public static class BridgeProtocol
{
    public const int MaxFileBytes = 20 * 1024 * 1024;
    // Match the web import budget and keep escaped projectOpened messages below 32 MiB.
    public const int MaxProjectBytes = 5 * 1024 * 1024;
    // A JSON escape may occupy six characters per source byte, plus envelope metadata.
    public const int MaxMessageCharacters = MaxFileBytes * 6 + 8192;
    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false, throwOnInvalidBytes: true);
    private static readonly HashSet<string> WindowsDevices = new(StringComparer.OrdinalIgnoreCase)
    {
        "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    };

    public static NativeBridgeRequest ParseRequest(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw) || raw.Length > MaxMessageCharacters)
            throw new BridgeProtocolException("invalid_request", "The native request is empty or too large.");
        JsonDocument document;
        try { document = JsonDocument.Parse(raw, new JsonDocumentOptions { MaxDepth = 8 }); }
        catch (JsonException) { throw new BridgeProtocolException("invalid_request", "The native request is not valid JSON."); }
        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object)
                throw new BridgeProtocolException("invalid_request", "The native request must be an object.");
            var requestId = ReadString(root, "requestId");
            if (string.IsNullOrWhiteSpace(requestId) || requestId.Length > 128 || requestId.Any(c => !(char.IsAsciiLetterOrDigit(c) || "._:-".Contains(c))))
                throw new BridgeProtocolException("invalid_request", "The native request needs a valid request ID.");
            var type = ReadString(root, "type") ?? "unknown";
            if (type is not ("openProject" or "saveFile"))
                throw new BridgeProtocolException("unsupported_operation", "This native operation is not supported.", requestId, "unknown");
            var fileName = ReadString(root, "fileName");
            var content = ReadString(root, "content");
            var mimeType = ReadString(root, "mimeType");
            if (type == "saveFile" && (content is null || fileName is null))
                throw new BridgeProtocolException("invalid_request", "Saving a file requires its name and text content.", requestId, type);
            return new(type, requestId, fileName, content, mimeType);
        }
    }

    private static string? ReadString(JsonElement root, string property) =>
        root.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    public static string Serialize(NativeBridgeResponse response) =>
        JsonSerializer.Serialize(response, BridgeJsonContext.Default.NativeBridgeResponse);

    public static byte[] EncodeFile(string content)
    {
        try
        {
            if (Utf8.GetByteCount(content) > MaxFileBytes)
                throw new BridgeProtocolException("file_too_large", "Files must be no larger than 20 MiB.");
            return Utf8.GetBytes(content);
        }
        catch (EncoderFallbackException)
        {
            throw new BridgeProtocolException("invalid_utf8", "The file contains invalid Unicode text.");
        }
    }

    public static async Task<string> ReadProjectAsync(Stream input, CancellationToken cancellationToken = default)
    {
        if (input.CanSeek && input.Length - input.Position > MaxProjectBytes)
            throw new BridgeProtocolException("file_too_large", "Projects must be no larger than 5 MiB.");
        using var data = new MemoryStream();
        var buffer = new byte[81920];
        while (true)
        {
            var read = await input.ReadAsync(buffer.AsMemory(), cancellationToken).ConfigureAwait(false);
            if (read == 0) break;
            if (data.Length + read > MaxProjectBytes)
                throw new BridgeProtocolException("file_too_large", "Projects must be no larger than 5 MiB.");
            await data.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
        }
        string content;
        try { content = Utf8.GetString(data.GetBuffer(), 0, checked((int)data.Length)); }
        catch (DecoderFallbackException) { throw new BridgeProtocolException("invalid_utf8", "Choose a project saved as UTF-8 JSON."); }
        if (content.StartsWith('\uFEFF')) content = content[1..];
        try
        {
            using var json = JsonDocument.Parse(content, new JsonDocumentOptions { MaxDepth = 64 });
            if (json.RootElement.ValueKind != JsonValueKind.Object) throw new JsonException();
        }
        catch (JsonException) { throw new BridgeProtocolException("invalid_json", "The selected file is not a valid JSON project object."); }
        return content;
    }

    public static string SanitizeFileName(string requested)
    {
        // Strip both separators regardless of the current OS; never pass a caller's path to FileSaver.
        var leaf = requested.Replace('\\', '/').Split('/').LastOrDefault() ?? "";
        var clean = new StringBuilder();
        foreach (var rune in leaf.EnumerateRunes())
        {
            if (Rune.GetUnicodeCategory(rune) is UnicodeCategory.Control or UnicodeCategory.Format || "<>:\"/\\|?*".Contains(rune.ToString(), StringComparison.Ordinal)) continue;
            clean.Append(rune.ToString());
        }
        var name = clean.ToString().Trim().TrimEnd('.');
        var extension = Path.GetExtension(name).ToLowerInvariant();
        if (extension is not (".json" or ".cs" or ".txt"))
            throw new BridgeProtocolException("invalid_file_name", "Choose a .json, .cs, or .txt file name.");
        var stem = name[..^extension.Length].Trim().TrimEnd('.');
        if (string.IsNullOrEmpty(stem)) stem = "BranchStudio";
        if (WindowsDevices.Contains(stem.Split('.')[0])) stem = "_" + stem;
        var limited = new StringBuilder();
        var encodedLength = 0;
        foreach (var rune in stem.EnumerateRunes())
        {
            if (limited.Length + rune.Utf16SequenceLength > 120 || encodedLength + rune.Utf8SequenceLength > 200) break;
            limited.Append(rune.ToString());
            encodedLength += rune.Utf8SequenceLength;
        }
        return limited + extension;
    }
}

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase, DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(NativeBridgeResponse))]
internal partial class BridgeJsonContext : JsonSerializerContext;
