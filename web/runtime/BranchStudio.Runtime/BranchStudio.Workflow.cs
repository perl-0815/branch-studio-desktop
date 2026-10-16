#nullable enable
using System;
using WorkflowResult = BranchStudio.Contracts.WorkflowResult;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading;
using System.Threading.Tasks;

namespace BranchStudio.Workflow
{
    public interface IWorkflowNode
    {
        ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default);
        void Reset();
    }
    public abstract class WorkflowNode : IWorkflowNode
    {
        public abstract ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default);
        public virtual void Reset() { }
    }
    public sealed class WorkflowContext
    {
        private static readonly HttpClient SharedHttpClient = new() { Timeout = System.Threading.Timeout.InfiniteTimeSpan };
        private readonly Dictionary<string, object?> values = new();
        public TimeProvider TimeProvider { get; }
        public HttpClient HttpClient { get; }
        public Action<string> Logger { get; }
        public string? HttpResponseBody { get; internal set; }
        public int? HttpStatusCode { get; internal set; }
        public WorkflowContext(HttpClient? httpClient = null, TimeProvider? timeProvider = null, Action<string>? logger = null)
        { HttpClient = httpClient ?? SharedHttpClient; TimeProvider = timeProvider ?? TimeProvider.System; Logger = logger ?? Console.WriteLine; }
        public T Get<T>(string key) => values.TryGetValue(key, out var value) && value is T typed
            ? typed : throw new KeyNotFoundException($"Missing variable or incompatible type: {key}");
        public void Set<T>(string key, T value)
        {
            if (values.TryGetValue(key, out var existing) && existing is not T) throw new InvalidOperationException($"Variable type cannot change: {key}");
            values[key] = value;
        }
    }
    public sealed class ConstantNode(WorkflowResult result) : WorkflowNode
    {
        public override ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        { cancellationToken.ThrowIfCancellationRequested(); return ValueTask.FromResult(result); }
    }
    public sealed class ActionNode(Func<WorkflowContext, CancellationToken, ValueTask<WorkflowResult>> action) : WorkflowNode
    {
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var result = await action(context, cancellationToken).ConfigureAwait(false);
            cancellationToken.ThrowIfCancellationRequested();
            return result;
        }
    }
    public sealed class ConditionNode(Func<WorkflowContext, CancellationToken, ValueTask<bool>> condition) : WorkflowNode
    {
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var result = await condition(context, cancellationToken).ConfigureAwait(false);
            cancellationToken.ThrowIfCancellationRequested();
            return result ? WorkflowResult.Success : WorkflowResult.Failure;
        }
    }
    public sealed class VariableCheckNode<T>(string key, T expected) : WorkflowNode
    {
        public override ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        { cancellationToken.ThrowIfCancellationRequested(); return ValueTask.FromResult(EqualityComparer<T>.Default.Equals(context.Get<T>(key), expected) ? WorkflowResult.Success : WorkflowResult.Failure); }
    }
    public sealed class SetVariableNode<T>(string key, T value) : WorkflowNode
    {
        public override ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        { cancellationToken.ThrowIfCancellationRequested(); context.Set(key, value); return ValueTask.FromResult(WorkflowResult.Success); }
    }
    public abstract class CompositeNode : WorkflowNode
    {
        protected readonly IWorkflowNode[] Children;
        protected CompositeNode(params IWorkflowNode[] children)
        {
            if (children.Length == 0 || children.Any(c => c is null)) throw new ArgumentException("Composite requires non-null children.", nameof(children));
            Children = children;
        }
        public override void Reset() { foreach (var child in Children) child.Reset(); }
    }
    public sealed class SequenceNode(params IWorkflowNode[] children) : CompositeNode(children)
    {
        private int cursor;
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                while (cursor < Children.Length)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var result = await Children[cursor].ExecuteAsync(context, cancellationToken).ConfigureAwait(false);
                    if (result == WorkflowResult.Running) return result;
                    if (result == WorkflowResult.Failure) { Reset(); return result; }
                    cursor++;
                }
                Reset(); return WorkflowResult.Success;
            }
            catch { Reset(); throw; }
        }
        public override void Reset() { cursor = 0; base.Reset(); }
    }
    public sealed class SelectorNode(params IWorkflowNode[] children) : CompositeNode(children)
    {
        private int cursor;
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                while (cursor < Children.Length)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var result = await Children[cursor].ExecuteAsync(context, cancellationToken).ConfigureAwait(false);
                    if (result == WorkflowResult.Running) return result;
                    if (result == WorkflowResult.Success) { Reset(); return result; }
                    cursor++;
                }
                Reset(); return WorkflowResult.Failure;
            }
            catch { Reset(); throw; }
        }
        public override void Reset() { cursor = 0; base.Reset(); }
    }
    public sealed class ParallelNode : CompositeNode
    {
        private readonly int successThreshold, failureThreshold;
        private readonly WorkflowResult?[] results;
        public ParallelNode(int successThreshold, int failureThreshold, params IWorkflowNode[] children) : base(children)
        {
            if (successThreshold < 1 || successThreshold > children.Length || failureThreshold < 1 || failureThreshold > children.Length) throw new ArgumentOutOfRangeException(nameof(successThreshold));
            this.successThreshold = successThreshold; this.failureThreshold = failureThreshold;
            results = new WorkflowResult?[children.Length];
        }
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                // Logical parallel evaluation, deliberately no threads or concurrent context mutations.
                for (var i = 0; i < Children.Length; i++)
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    if (results[i] is null or WorkflowResult.Running) results[i] = await Children[i].ExecuteAsync(context, cancellationToken).ConfigureAwait(false);
                }
                var failures = results.Count(r => r == WorkflowResult.Failure);
                var successes = results.Count(r => r == WorkflowResult.Success);
                if (failures >= failureThreshold) { Reset(); return WorkflowResult.Failure; }
                if (successes >= successThreshold) { Reset(); return WorkflowResult.Success; }
                if (failures + successes == Children.Length) { Reset(); return WorkflowResult.Failure; }
                return WorkflowResult.Running;
            }
            catch { Reset(); throw; }
        }
        public override void Reset() { Array.Clear(results); base.Reset(); }
    }
    public abstract class DecoratorNode(IWorkflowNode child) : WorkflowNode
    {
        protected readonly IWorkflowNode Child = child ?? throw new ArgumentNullException(nameof(child));
        public override void Reset() => Child.Reset();
    }
    public sealed class InverterNode(IWorkflowNode child) : DecoratorNode(child)
    {
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                return await Child.ExecuteAsync(context, cancellationToken).ConfigureAwait(false) switch
                { WorkflowResult.Success => WorkflowResult.Failure, WorkflowResult.Failure => WorkflowResult.Success, _ => WorkflowResult.Running };
            }
            catch { Reset(); throw; }
        }
    }
    public sealed class RepeaterNode : DecoratorNode
    {
        private readonly int count;
        private readonly bool untilFailure;
        private int completed;
        public RepeaterNode(int count, bool untilFailure, IWorkflowNode child) : base(child)
        { if (count < 1 || count > 10000) throw new ArgumentOutOfRangeException(nameof(count)); this.count = count; this.untilFailure = untilFailure; }
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                var result = await Child.ExecuteAsync(context, cancellationToken).ConfigureAwait(false);
                if (result == WorkflowResult.Running) return result;
                Child.Reset();
                if (++completed >= count || (untilFailure && result == WorkflowResult.Failure)) { Reset(); return WorkflowResult.Success; }
                return WorkflowResult.Running;
            }
            catch { Reset(); throw; }
        }
        public override void Reset() { completed = 0; base.Reset(); }
    }
    public sealed class RetryNode : DecoratorNode
    {
        private readonly int attempts;
        private int failed;
        public RetryNode(int attempts, IWorkflowNode child) : base(child)
        { if (attempts < 1 || attempts > 10000) throw new ArgumentOutOfRangeException(nameof(attempts)); this.attempts = attempts; }
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            try
            {
                cancellationToken.ThrowIfCancellationRequested();
                var result = await Child.ExecuteAsync(context, cancellationToken).ConfigureAwait(false);
                if (result == WorkflowResult.Running) return result;
                if (result == WorkflowResult.Success) { Reset(); return result; }
                Child.Reset();
                if (++failed >= attempts) { Reset(); return WorkflowResult.Failure; }
                return WorkflowResult.Running;
            }
            catch { Reset(); throw; }
        }
        public override void Reset() { failed = 0; base.Reset(); }
    }
    public sealed class TimeoutNode : DecoratorNode
    {
        private readonly TimeSpan duration;
        private long? started;
        public TimeoutNode(TimeSpan duration, IWorkflowNode child) : base(child)
        { if (duration <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(duration)); this.duration = duration; }
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            if (cancellationToken.IsCancellationRequested) { Reset(); cancellationToken.ThrowIfCancellationRequested(); }
            started ??= context.TimeProvider.GetTimestamp();
            var remaining = duration - context.TimeProvider.GetElapsedTime(started.Value);
            if (remaining <= TimeSpan.Zero) { Reset(); return WorkflowResult.Failure; }
            using var timer = new CancellationTokenSource(remaining, context.TimeProvider);
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timer.Token);
            try
            {
                var result = await Child.ExecuteAsync(context, linked.Token).ConfigureAwait(false);
                cancellationToken.ThrowIfCancellationRequested();
                if (timer.IsCancellationRequested) { Reset(); return WorkflowResult.Failure; }
                if (result != WorkflowResult.Running) Reset();
                return result;
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested && timer.IsCancellationRequested)
            { Reset(); return WorkflowResult.Failure; }
            catch { Reset(); throw; }
        }
        public override void Reset() { started = null; base.Reset(); }
    }
    public sealed class DelayNode : WorkflowNode
    {
        private readonly TimeSpan duration;
        public DelayNode(TimeSpan duration)
        { if (duration < TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(duration)); this.duration = duration; }
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            await Task.Delay(duration, context.TimeProvider, cancellationToken).ConfigureAwait(false);
            return WorkflowResult.Success;
        }
    }
    public sealed class LogNode(string message) : WorkflowNode
    {
        public override ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        { cancellationToken.ThrowIfCancellationRequested(); context.Logger(message); return ValueTask.FromResult(WorkflowResult.Success); }
    }
    public sealed class ExceptionHandlerNode(IWorkflowNode child) : DecoratorNode(child)
    {
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            try { cancellationToken.ThrowIfCancellationRequested(); return await Child.ExecuteAsync(context, cancellationToken).ConfigureAwait(false); }
            catch (OperationCanceledException) { Reset(); throw; }
            catch (Exception) { Reset(); cancellationToken.ThrowIfCancellationRequested(); return WorkflowResult.Failure; }
        }
    }
    public sealed class HttpRequestNode : WorkflowNode
    {
        private readonly HttpMethod method;
        private readonly Uri url;
        private readonly TimeSpan timeout;
        private readonly IReadOnlyDictionary<string, string> headers;
        private readonly string credentialEnv;
        public HttpRequestNode(string method, string url, TimeSpan timeout, IReadOnlyDictionary<string, string>? headers = null, string credentialEnv = "")
        {
            this.method = new HttpMethod(method); this.url = new Uri(url, UriKind.Absolute);
            if (this.url.Scheme != "http" && this.url.Scheme != "https") throw new ArgumentException("HTTP(S) URL required.", nameof(url));
            if (timeout <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(timeout));
            this.timeout = timeout; this.headers = headers ?? new Dictionary<string, string>(); this.credentialEnv = credentialEnv;
        }
        public override async ValueTask<WorkflowResult> ExecuteAsync(WorkflowContext context, CancellationToken cancellationToken = default)
        {
            cancellationToken.ThrowIfCancellationRequested();
            context.HttpResponseBody = null; context.HttpStatusCode = null;
            using var timer = new CancellationTokenSource(timeout, context.TimeProvider);
            using var linked = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timer.Token);
            using var request = new HttpRequestMessage(method, url);
            foreach (var header in headers)
            {
                if (request.Headers.TryAddWithoutValidation(header.Key, header.Value)) continue;
                request.Content ??= new StringContent("");
                request.Content.Headers.Add(header.Key, header.Value);
            }
            if (!string.IsNullOrWhiteSpace(credentialEnv))
            {
                var token = Environment.GetEnvironmentVariable(credentialEnv);
                if (string.IsNullOrWhiteSpace(token)) throw new InvalidOperationException("Required HTTP credential environment variable is not set.");
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            }
            try
            {
                using var response = await context.HttpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, linked.Token).ConfigureAwait(false);
                context.HttpStatusCode = (int)response.StatusCode;
                context.HttpResponseBody = await response.Content.ReadAsStringAsync(linked.Token).ConfigureAwait(false);
                cancellationToken.ThrowIfCancellationRequested();
                return !timer.IsCancellationRequested && response.IsSuccessStatusCode ? WorkflowResult.Success : WorkflowResult.Failure;
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested && timer.IsCancellationRequested)
            { return WorkflowResult.Failure; }
        }
    }
}
