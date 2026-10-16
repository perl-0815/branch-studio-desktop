using CommunityToolkit.Maui.Storage;
using Microsoft.Maui.ApplicationModel;
using Microsoft.Maui.Devices;
using Microsoft.Maui.Storage;

namespace BranchStudio.Desktop.Services;

/// <summary>Only user-selected files are read or written; JS never supplies an absolute native path.</summary>
public sealed class NativeFileBridge(IFilePicker picker, IFileSaver saver)
{
    private readonly SemaphoreSlim operationGate = new(1, 1);
    private static readonly FilePickerFileType ProjectTypes = new(new Dictionary<DevicePlatform, IEnumerable<string>>
    {
        [DevicePlatform.MacCatalyst] = ["public.json"],
        [DevicePlatform.WinUI] = [".json"],
    });

    public async Task<NativeBridgeResponse> HandleAsync(string raw, CancellationToken cancellationToken = default)
    {
        NativeBridgeRequest request;
        try { request = BridgeProtocol.ParseRequest(raw); }
        catch (BridgeProtocolException error)
        {
            return NativeBridgeResponse.Failure(error.RequestId, error.Operation, error.Code, error.Message);
        }
        catch (Exception)
        {
            return NativeBridgeResponse.Failure("", "unknown", "invalid_request", "The native request could not be read.");
        }
        if (!await operationGate.WaitAsync(0, cancellationToken))
            return NativeBridgeResponse.Failure(request.RequestId, request.Type, "busy", "A file dialog is already open.");
        try
        {
            return request.Type switch
            {
                "openProject" => await OpenProjectAsync(request, cancellationToken),
                "saveFile" => await SaveFileAsync(request, cancellationToken),
                _ => NativeBridgeResponse.Failure(request.RequestId, request.Type, "unsupported_operation", "This native operation is not supported."),
            };
        }
        catch (BridgeProtocolException error)
        {
            return NativeBridgeResponse.Failure(request.RequestId, request.Type, error.Code, error.Message);
        }
        catch (OperationCanceledException)
        {
            return Cancelled(request);
        }
        catch (Exception)
        {
            return NativeBridgeResponse.Failure(request.RequestId, request.Type, "file_operation_failed", request.Type == "openProject"
                ? "The project could not be opened. Choose a readable UTF-8 JSON file."
                : "The file could not be saved. Choose another location and try again.");
        }
        finally { operationGate.Release(); }
    }

    private async Task<NativeBridgeResponse> OpenProjectAsync(NativeBridgeRequest request, CancellationToken cancellationToken)
    {
        var selected = await MainThread.InvokeOnMainThreadAsync(() => picker.PickAsync(new PickOptions
        {
            PickerTitle = request.Language == "ja" ? "プロジェクトJSONを開く" : "Open project JSON",
            FileTypes = ProjectTypes,
        }));
        if (selected is null) return Cancelled(request);
        await using var input = await selected.OpenReadAsync();
        var content = await BridgeProtocol.ReadProjectAsync(input, cancellationToken);
        return new("projectOpened", request.RequestId)
        {
            FileName = BridgeProtocol.SanitizeFileName(selected.FileName),
            Content = content,
        };
    }

    private async Task<NativeBridgeResponse> SaveFileAsync(NativeBridgeRequest request, CancellationToken cancellationToken)
    {
        var name = BridgeProtocol.SanitizeFileName(request.FileName!);
        var bytes = BridgeProtocol.EncodeFile(request.Content!);
        using var content = new MemoryStream(bytes, writable: false);
        var result = await MainThread.InvokeOnMainThreadAsync(() => saver.SaveAsync(name, content, cancellationToken));
        if (result.Exception is OperationCanceledException) return Cancelled(request);
        if (!result.IsSuccessful)
            return NativeBridgeResponse.Failure(request.RequestId, request.Type, "save_failed", "The file could not be saved. Choose another location and try again.");
        return new("fileSaved", request.RequestId) { FileName = name };
    }

    private static NativeBridgeResponse Cancelled(NativeBridgeRequest request) =>
        NativeBridgeResponse.Failure(request.RequestId, request.Type, "cancelled", "The file operation was cancelled.", cancelled: true);
}
