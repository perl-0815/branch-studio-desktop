using BranchStudio.Desktop.Services;
using Microsoft.Maui.ApplicationModel;

namespace BranchStudio.Desktop;

public partial class MainPage : ContentPage
{
    private readonly NativeFileBridge fileBridge;

    public MainPage(NativeFileBridge fileBridge)
    {
        InitializeComponent();
        this.fileBridge = fileBridge;
    }

    private async void OnRawMessageReceived(object? sender, HybridWebViewRawMessageReceivedEventArgs e)
    {
        // RawMessage is data, never an expression passed to EvaluateJavaScriptAsync.
        // The MAUI HybridWebView transport accepts messages only from its local app origin.
        try
        {
            var response = await fileBridge.HandleAsync(e.Message ?? string.Empty);
            var json = BridgeProtocol.Serialize(response);
            await MainThread.InvokeOnMainThreadAsync(() => EditorWebView.SendRawMessage(json));
        }
        catch (Exception)
        {
            // The window may have closed while a system picker was open. Do not expose
            // native paths, exception details, or unhandled async-void exceptions to JS.
        }
    }
}
