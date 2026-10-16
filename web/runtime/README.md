# Branch Studio C# runtime

The Game runtime and generated factories target **.NET Standard 2.1 / C# 9**, matching the [Unity .NET Standard scripting profile](https://docs.unity.com/en-us/engine/6000.7/manual/programming-environment/overview-of-dot-net-in-unity/dotnet-profile-support). The Workflow runtime targets **.NET 8+ / C# 12**. Neither has Unity API dependencies. Game code is compiled against the .NET Standard reference assemblies with C# 9 as part of the generation checks; it has not been executed inside a Unity editor.

Download the matching runtime from the editor, or reference `BranchStudio.Game/BranchStudio.Game.csproj` (Game only) or `BranchStudio.Runtime/BranchStudio.Runtime.csproj` (both). Both projects reference the canonical `BranchStudio.Contracts` library. `NodeStatus` and `WorkflowResult` live in that namespace; import it in your handler implementations. The individually downloadable `.cs` files in `public/runtime/` bundle generated contracts with the tested runtime source, so each mode remains self-contained alongside its generated factory. Use one matching standalone runtime per destination project. For applications using both Game and Workflow, reference the runtime projects and shared Contracts project instead of adding both bundles, which would duplicate contract declarations. In Unity, import the Game runtime and Game factory into the same project; do not import the .NET 8 Workflow runtime.

```sh
dotnet build runtime/BranchStudio.Runtime/BranchStudio.Runtime.csproj
dotnet build runtime/BranchStudio.Game/BranchStudio.Game.csproj
dotnet test runtime/BranchStudio.Runtime.Tests/BranchStudio.Runtime.Tests.csproj
```

Game nodes implement `IBehaviorNode`; workflow nodes implement `IWorkflowNode`. All composite and decorator constructors require those interfaces, including custom user nodes. Generated factories return interfaces and require an implementation of their generated `I{ClassName}Handlers` interface. Handlers are ordinary statically checked delegates, with no string lookup, reflection, or fallback implementations. Implementing every referenced method is enforced by the C# compiler.

## Game AI

```csharp
var blackboard = SentinelBehavior.CreateBlackboard();
IBehaviorNode tree = SentinelBehavior.Create(handlers); // ISentinelBehaviorHandlers
BranchStudio.Contracts.NodeStatus status = tree.Tick(blackboard);              // once per game update
```

`NodeStatus.Idle` is an editor/simulation sentinel; executable handlers return Running, Success or Failure. Boolean handlers have signature `bool Method(Blackboard, IReadOnlyList<object?>)`; action handlers return `NodeStatus`. Pass domain services (navigation, combat, perception) to your handler class through its constructor. `Vector3` is `System.Numerics.Vector3`, so converting Unity vectors belongs in that integration layer. JSON primitive arguments are emitted as `object?[]`: numbers are `double`, other values are `string`, `bool`, or `null`.

Sequences/selectors remember the running child, then start fresh after a terminal result. Random composites keep their shuffled order until completion/reset; inject a seeded `Random` into `Blackboard` for reproducible runs. Parallel is one evaluation of each unfinished child per tick, without threads. Terminal child results are cached; failure wins if both thresholds are reached, and an exhausted tree that reaches neither threshold fails.

Repeater performs at most one completed iteration per tick, bounded by `count`; `untilFailure` stops early with Success. Retry yields Running after a failed attempt, up to the maximum total attempts (not additional retries). Timeout checks an elapsed monotonic clock before evaluating its child. Wait starts on its first tick. The default `MonotonicClock` uses `Stopwatch`; inject `IGameClock` for application/game time. Clock values are elapsed seconds and must be monotonic. For Unity time scaling, use an adapter and initialize the generated blackboard with it:

```csharp
public sealed class UnityGameClock : BranchStudio.Game.IGameClock
{
    public double Seconds => UnityEngine.Time.timeAsDouble;
}

// During setup:
var blackboard = SentinelBehavior.CreateBlackboard(new UnityGameClock());
```

Use `Time.unscaledTimeAsDouble` instead when behavior should continue during pauses. An injected clock is also how tests advance time without sleeping.

`Reset()` cancels branch execution memory; no handler rollback occurs. Cooldown remembers its suppression window across branch resets, or enclosing composites could bypass it. It begins after either terminal status and returns Failure while blocked. `CooldownNode.ClearCooldown()` explicitly clears that window for a full session reset.

## Workflow

```csharp
var context = OrderWorkflow.CreateWorkflowContext();
IWorkflowNode tree = OrderWorkflow.Create(handlers); // IOrderWorkflowHandlers
BranchStudio.Contracts.WorkflowResult result;
do
{
    result = await tree.ExecuteAsync(context, cancellationToken);
    if (result == BranchStudio.Contracts.WorkflowResult.Running) await Task.Yield();
} while (result == BranchStudio.Contracts.WorkflowResult.Running);
```

Action/Async Action/Transform handlers return `ValueTask<WorkflowResult>`. Condition/Validate return `ValueTask<bool>`. Every handler receives `(WorkflowContext context, IReadOnlyList<object?> arguments, CancellationToken cancellationToken)` and must pass that token to asynchronous I/O. Each tree instance is single execution / non-reentrant: do not call it concurrently or call `Reset()` during an awaited operation. Create a separate tree and context for each job.

Success and Failure are normal BT results. Unhandled exceptions propagate. Only `ExceptionHandlerNode` converts non-cancellation exceptions into Failure; Retry retries Failure, not exceptions. Compose Retry around Exception Handler when both are wanted. Caller cancellation always propagates as `OperationCanceledException`, including through Exception Handler. Timeout cancels cooperative child operations and converts its own deadline cancellation into Failure; external cancellation still propagates. Timeout includes time across calls returning Running. Cooperative handlers must honor cancellation; the runtime never starts detached work to force-stop a handler. Parent composites reset branch memory on exceptions/cancellation.

Workflow Parallel evaluates unfinished children in order, awaiting each, without concurrent context mutation. Delay awaits a cancellable timer; the browser simulator projects this as virtual Running steps. The browser simulator mocks handlers and HTTP and never executes C# or sends requests.

`WorkflowContext` accepts an injected `HttpClient`, `TimeProvider`, and logger. HTTP Request sends its configured method, URL and headers; any 2xx response succeeds, non-2xx/deadline returns Failure, transport exceptions propagate. The last response is available as `HttpResponseBody` and `HttpStatusCode`. If `credentialEnv` is set, the runtime reads that environment variable at execution and sends its value as a Bearer token; missing credentials raise an exception. No credential value is embedded in generated code. Keep production credentials in the destination application's environment/configuration. The editor stores only the variable name.

Blackboard/context variables have stable types; `Get<T>` throws for missing keys/type mismatches and `Set<T>` rejects type changes. Default declarations are initialized by the generated `CreateBlackboard` / `CreateWorkflowContext` methods. Inject custom services by constructing a context and setting declared defaults as needed.

Disabled nodes, including composite subtrees, produce constant Success and never run descendants. Their handlers are omitted from the generated interface. This is an explicit bypass, so a disabled child satisfies a Selector; remove/disconnect a branch when it should be absent instead.
