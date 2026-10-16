using BranchStudio.Desktop.Services;
using CommunityToolkit.Maui;
using CommunityToolkit.Maui.Storage;
using Microsoft.Maui.Storage;
using Microsoft.Extensions.DependencyInjection;

namespace BranchStudio.Desktop;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
#if WINDOWS
        // Set before constructing any WebView2, including unpackaged Program Files installs.
        var userDataFolder = Path.Combine(FileSystem.AppDataDirectory, "WebView2");
        Directory.CreateDirectory(userDataFolder);
        Environment.SetEnvironmentVariable("WEBVIEW2_USER_DATA_FOLDER", userDataFolder);
#endif
        var builder = MauiApp.CreateBuilder();
        builder.UseMauiApp<App>().UseMauiCommunityToolkit();
#if DEBUG
        builder.Services.AddHybridWebViewDeveloperTools();
#endif
        builder.Services.AddSingleton<IFilePicker>(FilePicker.Default);
        builder.Services.AddSingleton<IFileSaver>(FileSaver.Default);
        builder.Services.AddSingleton<NativeFileBridge>();
        builder.Services.AddSingleton<MainPage>();
        return builder.Build();
    }
}
