#nullable enable
using System;
using NodeStatus = BranchStudio.Contracts.NodeStatus;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;

namespace BranchStudio.Game
{

    public interface IGameClock { double Seconds { get; } }
    public sealed class MonotonicClock : IGameClock
    {
        public double Seconds => Stopwatch.GetTimestamp() / (double)Stopwatch.Frequency;
    }

    public interface IBehaviorNode
    {
        NodeStatus Tick(Blackboard blackboard);
        void Reset();
    }

    public abstract class BehaviorNode : IBehaviorNode
    {
        public abstract NodeStatus Tick(Blackboard blackboard);
        public virtual void Reset() { }
        protected static void CheckDuration(TimeSpan duration)
        {
            if (duration < TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(duration));
        }
    }

    public sealed class Blackboard
    {
        private readonly Dictionary<string, object?> values = new();
        public IGameClock Clock { get; }
        public Random Random { get; }
        public Blackboard(IGameClock? clock = null, Random? random = null)
        { Clock = clock ?? new MonotonicClock(); Random = random ?? new Random(); }
        public T Get<T>(string key) => values.TryGetValue(key, out var value) && value is T typed
            ? typed : throw new KeyNotFoundException($"Missing variable or incompatible type: {key}");
        public void Set<T>(string key, T value)
        {
            if (values.TryGetValue(key, out var existing) && existing is not T)
                throw new InvalidOperationException($"Variable type cannot change: {key}");
            values[key] = value;
        }
    }

    public sealed class ConstantNode : BehaviorNode
    {
        private readonly NodeStatus status;
        public ConstantNode(NodeStatus status) { this.status = status; }
        public override NodeStatus Tick(Blackboard blackboard) => status;
    }
    public sealed class ActionNode : BehaviorNode
    {
        private readonly Func<Blackboard, NodeStatus> action;
        public ActionNode(Func<Blackboard, NodeStatus> action) { this.action = action ?? throw new ArgumentNullException(nameof(action)); }
        public override NodeStatus Tick(Blackboard blackboard) => action(blackboard);
    }
    public sealed class ConditionNode : BehaviorNode
    {
        private readonly Func<Blackboard, bool> condition;
        public ConditionNode(Func<Blackboard, bool> condition) { this.condition = condition ?? throw new ArgumentNullException(nameof(condition)); }
        public override NodeStatus Tick(Blackboard blackboard) => condition(blackboard) ? NodeStatus.Success : NodeStatus.Failure;
    }
    public sealed class VariableCheckNode<T> : BehaviorNode
    {
        private readonly string key;
        private readonly T expected;
        public VariableCheckNode(string key, T expected) { this.key = key; this.expected = expected; }
        public override NodeStatus Tick(Blackboard blackboard) => EqualityComparer<T>.Default.Equals(blackboard.Get<T>(key), expected) ? NodeStatus.Success : NodeStatus.Failure;
    }
    public sealed class SetVariableNode<T> : BehaviorNode
    {
        private readonly string key;
        private readonly T value;
        public SetVariableNode(string key, T value) { this.key = key; this.value = value; }
        public override NodeStatus Tick(Blackboard blackboard) { blackboard.Set(key, value); return NodeStatus.Success; }
    }

    public abstract class CompositeNode : BehaviorNode
    {
        protected readonly IBehaviorNode[] Children;
        protected CompositeNode(params IBehaviorNode[] children)
        {
            if (children.Length == 0 || children.Any(c => c is null)) throw new ArgumentException("Composite requires non-null children.", nameof(children));
            Children = children;
        }
        public override void Reset() { foreach (var child in Children) child.Reset(); }
    }

    public class SequenceNode : CompositeNode
    {
        public SequenceNode(params IBehaviorNode[] children) : base(children) { }
        private int cursor;
        public override NodeStatus Tick(Blackboard blackboard)
        {
            while (cursor < Children.Length)
            {
                var status = Children[cursor].Tick(blackboard);
                if (status == NodeStatus.Running) return status;
                if (status == NodeStatus.Failure) { Reset(); return status; }
                cursor++;
            }
            Reset(); return NodeStatus.Success;
        }
        public override void Reset() { cursor = 0; base.Reset(); }
    }

    public class SelectorNode : CompositeNode
    {
        public SelectorNode(params IBehaviorNode[] children) : base(children) { }
        private int cursor;
        public override NodeStatus Tick(Blackboard blackboard)
        {
            while (cursor < Children.Length)
            {
                var status = Children[cursor].Tick(blackboard);
                if (status == NodeStatus.Running) return status;
                if (status == NodeStatus.Success) { Reset(); return status; }
                cursor++;
            }
            Reset(); return NodeStatus.Failure;
        }
        public override void Reset() { cursor = 0; base.Reset(); }
    }

    public sealed class ParallelNode : CompositeNode
    {
        private readonly int successThreshold, failureThreshold;
        private readonly NodeStatus?[] results;
        public ParallelNode(int successThreshold, int failureThreshold, params IBehaviorNode[] children) : base(children)
        {
            if (successThreshold < 1 || successThreshold > children.Length || failureThreshold < 1 || failureThreshold > children.Length)
                throw new ArgumentOutOfRangeException(nameof(successThreshold));
            this.successThreshold = successThreshold; this.failureThreshold = failureThreshold;
            results = new NodeStatus?[children.Length];
        }
        public override NodeStatus Tick(Blackboard blackboard)
        {
            for (var i = 0; i < Children.Length; i++)
                if (results[i] is null or NodeStatus.Running) results[i] = Children[i].Tick(blackboard);
            var failures = results.Count(r => r == NodeStatus.Failure);
            var successes = results.Count(r => r == NodeStatus.Success);
            if (failures >= failureThreshold) { Reset(); return NodeStatus.Failure; }
            if (successes >= successThreshold) { Reset(); return NodeStatus.Success; }
            if (failures + successes == Children.Length) { Reset(); return NodeStatus.Failure; }
            return NodeStatus.Running;
        }
        public override void Reset() { Array.Clear(results, 0, results.Length); base.Reset(); }
    }

    public abstract class DecoratorNode : BehaviorNode
    {
        protected readonly IBehaviorNode Child;
        protected DecoratorNode(IBehaviorNode child) { Child = child ?? throw new ArgumentNullException(nameof(child)); }
        public override void Reset() => Child.Reset();
    }
    public sealed class InverterNode : DecoratorNode
    {
        public InverterNode(IBehaviorNode child) : base(child) { }
        public override NodeStatus Tick(Blackboard blackboard) => Child.Tick(blackboard) switch
        { NodeStatus.Success => NodeStatus.Failure, NodeStatus.Failure => NodeStatus.Success, _ => NodeStatus.Running };
    }
    public sealed class RepeaterNode : DecoratorNode
    {
        private readonly int count;
        private readonly bool untilFailure;
        private int completed;
        public RepeaterNode(int count, bool untilFailure, IBehaviorNode child) : base(child)
        { if (count < 1 || count > 10000) throw new ArgumentOutOfRangeException(nameof(count)); this.count = count; this.untilFailure = untilFailure; }
        public override NodeStatus Tick(Blackboard blackboard)
        {
            var status = Child.Tick(blackboard);
            if (status == NodeStatus.Running) return status;
            Child.Reset();
            if (++completed >= count || (untilFailure && status == NodeStatus.Failure)) { Reset(); return NodeStatus.Success; }
            return NodeStatus.Running;
        }
        public override void Reset() { completed = 0; base.Reset(); }
    }
    public sealed class RetryNode : DecoratorNode
    {
        private readonly int attempts;
        private int failed;
        public RetryNode(int attempts, IBehaviorNode child) : base(child)
        { if (attempts < 1 || attempts > 10000) throw new ArgumentOutOfRangeException(nameof(attempts)); this.attempts = attempts; }
        public override NodeStatus Tick(Blackboard blackboard)
        {
            var status = Child.Tick(blackboard);
            if (status == NodeStatus.Running) return status;
            if (status == NodeStatus.Success) { Reset(); return status; }
            Child.Reset();
            if (++failed >= attempts) { Reset(); return NodeStatus.Failure; }
            return NodeStatus.Running;
        }
        public override void Reset() { failed = 0; base.Reset(); }
    }
    public sealed class TimeoutNode : DecoratorNode
    {
        private readonly TimeSpan duration;
        private double? started;
        public TimeoutNode(TimeSpan duration, IBehaviorNode child) : base(child) { CheckDuration(duration); this.duration = duration; }
        public override NodeStatus Tick(Blackboard blackboard)
        {
            started ??= blackboard.Clock.Seconds;
            if (blackboard.Clock.Seconds - started.Value >= duration.TotalSeconds) { Reset(); return NodeStatus.Failure; }
            var result = Child.Tick(blackboard);
            if (result != NodeStatus.Running) Reset();
            return result;
        }
        public override void Reset() { started = null; base.Reset(); }
    }
    public sealed class WaitNode : BehaviorNode
    {
        private readonly TimeSpan duration;
        private double? started;
        public WaitNode(TimeSpan duration) { CheckDuration(duration); this.duration = duration; }
        public override NodeStatus Tick(Blackboard blackboard)
        {
            started ??= blackboard.Clock.Seconds;
            if (blackboard.Clock.Seconds - started.Value < duration.TotalSeconds) return NodeStatus.Running;
            Reset(); return NodeStatus.Success;
        }
        public override void Reset() => started = null;
    }
    public sealed class CooldownNode : DecoratorNode
    {
        private readonly TimeSpan duration;
        private double? completed;
        public CooldownNode(TimeSpan duration, IBehaviorNode child) : base(child) { CheckDuration(duration); this.duration = duration; }
        public override NodeStatus Tick(Blackboard blackboard)
        {
            if (completed.HasValue && blackboard.Clock.Seconds - completed.Value < duration.TotalSeconds) return NodeStatus.Failure;
            var result = Child.Tick(blackboard);
            if (result != NodeStatus.Running) { completed = blackboard.Clock.Seconds; Child.Reset(); }
            return result;
        }
        // Branch resets retain the suppression window; call ClearCooldown for a full session reset.
        public void ClearCooldown() { completed = null; base.Reset(); }
    }

    public abstract class RandomCompositeNode : CompositeNode
    {
        protected RandomCompositeNode(params IBehaviorNode[] children) : base(children) { }
        private int[]? order;
        private int cursor;
        protected abstract bool IsSequence { get; }
        public override NodeStatus Tick(Blackboard blackboard)
        {
            if (order is null)
            {
                order = Enumerable.Range(0, Children.Length).ToArray();
                for (var i = order.Length - 1; i > 0; i--)
                {
                    var index = blackboard.Random.Next(i + 1);
                    var previous = order[i]; order[i] = order[index]; order[index] = previous;
                }
            }
            while (cursor < order.Length)
            {
                var result = Children[order[cursor]].Tick(blackboard);
                if (result == NodeStatus.Running) return result;
                if ((result == NodeStatus.Failure) == IsSequence) { Reset(); return result; }
                cursor++;
            }
            Reset(); return IsSequence ? NodeStatus.Success : NodeStatus.Failure;
        }
        public override void Reset() { order = null; cursor = 0; base.Reset(); }
    }
    public sealed class RandomSelectorNode : RandomCompositeNode
    {
        public RandomSelectorNode(params IBehaviorNode[] children) : base(children) { }
        protected override bool IsSequence => false;
    }
    public sealed class RandomSequenceNode : RandomCompositeNode
    {
        public RandomSequenceNode(params IBehaviorNode[] children) : base(children) { }
        protected override bool IsSequence => true;
    }
}
