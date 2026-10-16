# Branch Studio Desktop

Branch Studio Desktop is the local macOS and Windows edition of the behavior-tree editor. It packages the existing React editor inside a .NET MAUI `HybridWebView` and keeps the editor, validation, simulation, and C# generation on the user's machine.

## Why MAUI

WPF only runs on Windows. This repository targets both the current macOS development environment through Mac Catalyst and Windows through WinUI, using .NET 10 and .NET MAUI 10.

## Local data and files

- Open trees appear as tabs above the editor. Use **+** to create an empty tree in the current mode; click a tab to switch projects. Arrow keys, Home, and End also switch focused tabs.
- Each tab keeps its own tree, selection, undo/redo history, and canvas position while the app is open. All trees, the active tab, and canvas positions are automatically restored after restarting; undo/redo history lasts for the current session.
- Use a tab's **×** to close it. The confirmation offers **Save JSON and close** to keep a portable copy; **Close without saving** removes it from this device's workspace. The last tab stays open.
- Editor autosave stays in the desktop WebView's local storage. Existing single-project saves migrate into a tab, with the original saved copy retained for recovery.
- **Open JSON** uses the operating system file picker and opens the project in a new tab. **Save JSON** exports the active tree for use on another device.
- **Export JSON**, **Export C#**, and runtime downloads use the operating system save dialog.
- Exported JSON can be opened on another computer or in the browser edition.
- The packaged app does not require a backend. Its editor assets, Monaco editor, and C# runtime templates are bundled with the application.

Use **Appearance settings** (the `Type` icon at the bottom of the left activity bar) to adjust UI text size (100–150%) and the C# preview font size independently. Changes apply immediately and persist on this device across restarts, without changing the project's JSON or canvas zoom.

The native bridge only accepts UTF-8 text, strips paths from requested file names, and limits accepted extensions to `.json`, `.cs`, and `.txt`. Project imports are limited to 5 MiB; generated file saves are limited to 20 MiB. Imported projects are also limited to 2,000 nodes, 4,000 connections, 500 variables, and 512 tree levels before the project replaces the current editor state.

## Requirements

- [.NET 10 SDK](https://dotnet.microsoft.com/download/dotnet/10.0)
- .NET MAUI workload: `dotnet workload install maui`
- Node.js 22 or later
- pnpm 10.34.5 or a compatible pnpm 10 release
- macOS 14 or later: Xcode with the Mac Catalyst SDK
- Windows: Windows 10 1809 or later with WebView2

## First-time setup

From the repository root:

```sh
dotnet workload restore BranchStudio.Desktop.slnx
pnpm install:web
pnpm prepare:desktop
```

`prepare:desktop` generates the TypeScript/JSON contracts and standalone runtime sources from C#, builds the static Next.js application, and copies it to `src/BranchStudio.Desktop/Resources/Raw/wwwroot`.

You only need to run `pnpm prepare:desktop` again after changing the editor, shared contracts, or downloadable runtimes.

## Shared contracts

`src/BranchStudio.Contracts` is the source of truth for project modes, node kinds, statuses, variable types, validation severity, and the node catalog. It targets .NET Standard 2.1 with C# 9 and has no external package dependency, so the Game runtime can also use it from Unity-compatible projects.

The editor imports generated TypeScript from `web/src/generated`. Do not edit those files directly. After changing a C# contract, regenerate every representation and the downloadable one-file runtimes:

```sh
pnpm generate
pnpm contracts:check
pnpm contracts:test
```

The normal runtime projects reference `BranchStudio.Contracts`. A downloaded Game or Workflow runtime is a convenient standalone source file with the same generated contract declarations appended. When both runtimes are added to one C# project, keep one copy of the shared declarations or reference `BranchStudio.Contracts` and use the sources under `web/runtime`.

## Run on macOS

Build and launch from the repository root:

```sh
dotnet build src/BranchStudio.Desktop/BranchStudio.Desktop.csproj \
  -t:Run \
  -f net10.0-maccatalyst
```

After a normal build, you can also launch the app bundle directly:

```sh
open "src/BranchStudio.Desktop/bin/Debug/net10.0-maccatalyst/maccatalyst-arm64/Branch Studio.app"
```

The first build can take longer while NuGet packages and native workloads are restored. When Xcode is updated, open it once and let it finish installing the platform components before building again.

## Run on Windows

Open PowerShell in the repository root and run:

```powershell
dotnet run --project src/BranchStudio.Desktop/BranchStudio.Desktop.csproj `
  -f net10.0-windows10.0.19041.0
```

## Verify changes

```sh
pnpm check:web
pnpm test:runtime
pnpm prepare:desktop
dotnet build BranchStudio.Desktop.slnx
```

## Repository layout

```text
branch-studio-desktop/
├── src/BranchStudio.Contracts/  Canonical enums and node catalog
├── src/BranchStudio.Desktop/    .NET MAUI host and native file bridge
├── tools/BranchStudio.ContractGen/  Deterministic TS/JSON/C# generator
├── scripts/                     Runtime bundling and static asset synchronization
└── web/                         React editor, generated contracts, and C# runtimes
```

The React Flow graph is converted to the editor's graph model, validated, transformed to a behavior-tree AST, and then passed to the C# generator. The native MAUI host handles only application hosting and user-approved file access.
