using NodeStatus = BranchStudio.Contracts.NodeStatus;
using WorkflowResult = BranchStudio.Contracts.WorkflowResult;
using Xunit;
using System.Net;
using Game = BranchStudio.Game;
using Flow = BranchStudio.Workflow;

namespace BranchStudio.Runtime.Tests;

public sealed class RuntimeTests
{
    private sealed class Clock : TimeProvider, Game.IGameClock
    {
        private long ticks;
        public override long TimestampFrequency => TimeSpan.TicksPerSecond;
        public override long GetTimestamp() => ticks;
        public double Seconds => ticks / (double)TimeSpan.TicksPerSecond;
        public void Advance(double seconds) => ticks += TimeSpan.FromSeconds(seconds).Ticks;
    }

    [Fact]
    public void NodeInterfacesUseCanonicalContractTypesAndStableStatusNumbers()
    {
        Assert.Equal(typeof(NodeStatus), typeof(Game.IBehaviorNode).GetMethod("Tick")!.ReturnType);
        Assert.Equal(typeof(ValueTask<WorkflowResult>), typeof(Flow.IWorkflowNode).GetMethod("ExecuteAsync")!.ReturnType);
        Assert.Equal("BranchStudio.Contracts", typeof(NodeStatus).Assembly.GetName().Name);
        Assert.Equal("BranchStudio.Contracts", typeof(WorkflowResult).Assembly.GetName().Name);
        Assert.Equal(-1, (int)NodeStatus.Idle);
        Assert.Equal(0, (int)NodeStatus.Running);
        Assert.Equal(1, (int)NodeStatus.Success);
        Assert.Equal(2, (int)NodeStatus.Failure);
    }

    [Fact]
    public void SequenceResumesRunningChildAndStartsFreshAfterTerminal()
    {
        var first = 0; var running = true; var last = 0;
        Game.IBehaviorNode tree = new Game.SequenceNode(
            new Game.ActionNode(_ => { first++; return NodeStatus.Success; }),
            new Game.ActionNode(_ => running ? NodeStatus.Running : NodeStatus.Success),
            new Game.ActionNode(_ => { last++; return NodeStatus.Success; }));
        var board = new Game.Blackboard();
        Assert.Equal(NodeStatus.Running, tree.Tick(board));
        Assert.Equal(NodeStatus.Running, tree.Tick(board));
        Assert.Equal(1, first); Assert.Equal(0, last);
        running = false;
        Assert.Equal(NodeStatus.Success, tree.Tick(board));
        Assert.Equal(1, first); Assert.Equal(1, last);
        Assert.Equal(NodeStatus.Success, tree.Tick(board));
        Assert.Equal(2, first);
    }

    [Fact]
    public void SelectorResumesAndShortCircuits()
    {
        var rejected = 0; var running = true; var fallback = 0;
        var tree = new Game.SelectorNode(
            new Game.ActionNode(_ => { rejected++; return NodeStatus.Failure; }),
            new Game.ActionNode(_ => running ? NodeStatus.Running : NodeStatus.Success),
            new Game.ActionNode(_ => { fallback++; return NodeStatus.Success; }));
        var board = new Game.Blackboard();
        Assert.Equal(NodeStatus.Running, tree.Tick(board));
        running = false;
        Assert.Equal(NodeStatus.Success, tree.Tick(board));
        Assert.Equal(1, rejected); Assert.Equal(0, fallback);
    }

    [Fact]
    public void RetryAndRepeatAreBoundedAndYieldBetweenAttempts()
    {
        var attempts = 0;
        var retry = new Game.RetryNode(3, new Game.ActionNode(_ => { attempts++; return NodeStatus.Failure; }));
        var board = new Game.Blackboard();
        Assert.Equal(NodeStatus.Running, retry.Tick(board));
        Assert.Equal(1, attempts);
        Assert.Equal(NodeStatus.Running, retry.Tick(board));
        Assert.Equal(NodeStatus.Failure, retry.Tick(board));
        Assert.Equal(3, attempts);
        var repeat = new Game.RepeaterNode(2, false, new Game.ConstantNode(NodeStatus.Success));
        Assert.Equal(NodeStatus.Running, repeat.Tick(board));
        Assert.Equal(NodeStatus.Success, repeat.Tick(board));
    }

    [Fact]
    public void TimeoutUsesInjectedClockAcrossTicksAndResets()
    {
        var clock = new Clock(); var count = 0;
        var board = new Game.Blackboard(clock);
        var tree = new Game.TimeoutNode(TimeSpan.FromSeconds(1), new Game.ActionNode(_ => { count++; return NodeStatus.Running; }));
        Assert.Equal(NodeStatus.Running, tree.Tick(board));
        clock.Advance(1);
        Assert.Equal(NodeStatus.Failure, tree.Tick(board));
        Assert.Equal(1, count);
        Assert.Equal(NodeStatus.Running, tree.Tick(board));
    }

    [Fact]
    public void ParallelCachesCompletedChildrenAndFailureWinsTies()
    {
        var first = 0; var ready = false;
        var tree = new Game.ParallelNode(2, 1,
            new Game.ActionNode(_ => { first++; return NodeStatus.Success; }),
            new Game.ActionNode(_ => ready ? NodeStatus.Success : NodeStatus.Running));
        var board = new Game.Blackboard();
        Assert.Equal(NodeStatus.Running, tree.Tick(board));
        ready = true;
        Assert.Equal(NodeStatus.Success, tree.Tick(board));
        Assert.Equal(1, first);
        Assert.Equal(NodeStatus.Failure, new Game.ParallelNode(1, 1, new Game.ConstantNode(NodeStatus.Success), new Game.ConstantNode(NodeStatus.Failure)).Tick(board));
    }

    [Fact]
    public void CooldownSurvivesCompositeResetAndCanBeExplicitlyCleared()
    {
        var clock = new Clock(); var board = new Game.Blackboard(clock);
        var cooldown = new Game.CooldownNode(TimeSpan.FromSeconds(1), new Game.ConstantNode(NodeStatus.Success));
        var sequence = new Game.SequenceNode(cooldown);
        Assert.Equal(NodeStatus.Success, sequence.Tick(board));
        Assert.Equal(NodeStatus.Failure, sequence.Tick(board));
        clock.Advance(1);
        Assert.Equal(NodeStatus.Success, sequence.Tick(board));
        cooldown.ClearCooldown();
        Assert.Equal(NodeStatus.Success, sequence.Tick(board));
    }

    [Fact]
    public async Task WorkflowSequenceAndSelectorRetainRunningCursor()
    {
        var first = 0; var running = true;
        Flow.IWorkflowNode tree = new Flow.SequenceNode(
            new Flow.ActionNode((_, _) => { first++; return ValueTask.FromResult(WorkflowResult.Success); }),
            new Flow.SelectorNode(new Flow.ActionNode((_, _) => ValueTask.FromResult(running ? WorkflowResult.Running : WorkflowResult.Success)),
                new Flow.ConstantNode(WorkflowResult.Failure)));
        var context = new Flow.WorkflowContext();
        Assert.Equal(WorkflowResult.Running, await tree.ExecuteAsync(context));
        running = false;
        Assert.Equal(WorkflowResult.Success, await tree.ExecuteAsync(context));
        Assert.Equal(1, first);
    }

    [Fact]
    public async Task WorkflowRetryYieldsAndStopsAtMaximum()
    {
        var attempts = 0;
        var tree = new Flow.RetryNode(2, new Flow.ActionNode((_, _) => { attempts++; return ValueTask.FromResult(WorkflowResult.Failure); }));
        var context = new Flow.WorkflowContext();
        Assert.Equal(WorkflowResult.Running, await tree.ExecuteAsync(context));
        Assert.Equal(WorkflowResult.Failure, await tree.ExecuteAsync(context));
        Assert.Equal(2, attempts);
    }

    [Fact]
    public async Task WorkflowTimeoutCancelsInFlightAsyncOperation()
    {
        var tree = new Flow.TimeoutNode(TimeSpan.FromMilliseconds(20), new Flow.DelayNode(TimeSpan.FromSeconds(5)));
        Assert.Equal(WorkflowResult.Failure, await tree.ExecuteAsync(new Flow.WorkflowContext()));
    }

    [Fact]
    public async Task WorkflowTimeoutIncludesElapsedRunningInvocations()
    {
        var clock = new Clock(); var context = new Flow.WorkflowContext(timeProvider: clock);
        var tree = new Flow.TimeoutNode(TimeSpan.FromSeconds(1), new Flow.ConstantNode(WorkflowResult.Running));
        Assert.Equal(WorkflowResult.Running, await tree.ExecuteAsync(context));
        clock.Advance(1);
        Assert.Equal(WorkflowResult.Failure, await tree.ExecuteAsync(context));
    }

    [Fact]
    public async Task CancellationPropagatesThroughTimeoutAndExceptionHandler()
    {
        using var cts = new CancellationTokenSource();
        var tree = new Flow.ExceptionHandlerNode(new Flow.TimeoutNode(TimeSpan.FromSeconds(5),
            new Flow.ActionNode(async (_, ct) => { cts.Cancel(); await Task.Delay(1000, ct); return WorkflowResult.Success; })));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await tree.ExecuteAsync(new Flow.WorkflowContext(), cts.Token));
    }

    [Fact]
    public async Task ExceptionsAreDistinctFromFailureUntilExplicitlyHandled()
    {
        var context = new Flow.WorkflowContext();
        var action = new Flow.ActionNode((_, _) => throw new InvalidOperationException("test"));
        await Assert.ThrowsAsync<InvalidOperationException>(async () => await action.ExecuteAsync(context));
        Assert.Equal(WorkflowResult.Failure, await new Flow.ExceptionHandlerNode(action).ExecuteAsync(context));
    }

    [Fact]
    public async Task WorkflowParallelCachesTerminalChildren()
    {
        var first = 0; var ready = false;
        var tree = new Flow.ParallelNode(2, 1,
            new Flow.ActionNode((_, _) => { first++; return ValueTask.FromResult(WorkflowResult.Success); }),
            new Flow.ActionNode((_, _) => ValueTask.FromResult(ready ? WorkflowResult.Success : WorkflowResult.Running)));
        var context = new Flow.WorkflowContext();
        Assert.Equal(WorkflowResult.Running, await tree.ExecuteAsync(context));
        ready = true;
        Assert.Equal(WorkflowResult.Success, await tree.ExecuteAsync(context));
        Assert.Equal(1, first);
    }

    [Fact]
    public void BlackboardRejectsTypeChanges()
    {
        var board = new Game.Blackboard(); board.Set("health", 100f);
        Assert.Equal(100f, board.Get<float>("health"));
        Assert.Throws<InvalidOperationException>(() => board.Set("health", "invalid"));
    }

    private sealed class HttpStub : HttpMessageHandler
    {
        public int Calls { get; private set; }
        public string? Header { get; private set; }
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            cancellationToken.ThrowIfCancellationRequested(); Calls++;
            Header = request.Headers.GetValues("X-Client").Single();
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) { Content = new StringContent("{\"stock\":true}") });
        }
    }

    [Fact]
    public async Task HttpUsesConfiguredClientAndExposesResponseInContext()
    {
        using var stub = new HttpStub(); using var client = new HttpClient(stub);
        var context = new Flow.WorkflowContext(client);
        var tree = new Flow.HttpRequestNode("GET", "https://example.invalid/stock", TimeSpan.FromSeconds(5), new Dictionary<string, string> { ["X-Client"] = "BranchStudio" });
        Assert.Equal(WorkflowResult.Success, await tree.ExecuteAsync(context));
        Assert.Equal(200, context.HttpStatusCode);
        Assert.Equal("{\"stock\":true}", context.HttpResponseBody);
        Assert.Equal("BranchStudio", stub.Header); Assert.Equal(1, stub.Calls);
    }

    [Fact]
    public async Task PreCancelledHttpNeverCallsTransport()
    {
        using var stub = new HttpStub(); using var client = new HttpClient(stub);
        using var cts = new CancellationTokenSource(); cts.Cancel();
        var tree = new Flow.HttpRequestNode("GET", "https://example.invalid/stock", TimeSpan.FromSeconds(5));
        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () => await tree.ExecuteAsync(new Flow.WorkflowContext(client), cts.Token));
        Assert.Equal(0, stub.Calls);
    }
}
