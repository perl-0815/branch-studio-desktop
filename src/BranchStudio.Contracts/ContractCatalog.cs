using System.Collections.ObjectModel;
using System;
using System.Collections.Generic;
using System.Linq;

namespace BranchStudio.Contracts
{

    /// <summary>The source of shared editor vocabulary and node metadata.</summary>
    public static class ContractCatalog
    {
        public const int SchemaVersion = 1;

        public static IReadOnlyList<ProjectMode> Modes { get; } = Values<ProjectMode>();
        public static IReadOnlyList<NodeKind> NodeKinds { get; } = Values<NodeKind>();
        public static IReadOnlyList<NodeCategory> NodeCategories { get; } = Values<NodeCategory>();
        public static IReadOnlyList<NodeStatus> Statuses { get; } = Values<NodeStatus>();
        public static IReadOnlyList<WorkflowResult> WorkflowResults { get; } = Values<WorkflowResult>();
        public static IReadOnlyList<VariableType> VariableTypes { get; } = Values<VariableType>();
        public static IReadOnlyList<ValidationSeverity> ValidationSeverities { get; } = Values<ValidationSeverity>();

        public static IReadOnlyList<NodeDefinition> NodeDefinitions { get; } = Array.AsReadOnly(new NodeDefinition[] {
        Define(NodeKind.Root, "Root", NodeCategory.Structure, "#b6becb", "Single entry point", 1, 1),
        Define(NodeKind.Selector, "Selector", NodeCategory.Composite, "#899cf6", "First successful child wins", 1, null,
            aliases: "fallback or"),
        Define(NodeKind.Sequence, "Sequence", NodeCategory.Composite, "#70c4d4", "Run children in order", 1, null,
            aliases: "and ordered"),
        Define(NodeKind.Parallel, "Parallel", NodeCategory.Composite, "#b694dc", "Evaluate children in one tick", 1, null,
            Defaults(("successThreshold", 1), ("failureThreshold", 1))),
        Define(NodeKind.Inverter, "Inverter", NodeCategory.Decorator, "#d5b375", "Invert success and failure", 1, 1),
        Define(NodeKind.Repeater, "Repeater", NodeCategory.Decorator, "#d5b375", "Repeat a bounded number of times", 1, 1,
            Defaults(("count", 3), ("untilFailure", false))),
        Define(NodeKind.Retry, "Retry", NodeCategory.Decorator, "#d5b375", "Retry failed child", 1, 1,
            Defaults(("attempts", 3))),
        Define(NodeKind.Timeout, "Timeout", NodeCategory.Decorator, "#d5b375", "Fail after a time limit", 1, 1,
            Defaults(("seconds", 5))),
        Define(NodeKind.Condition, "Condition", NodeCategory.Leaf, "#89bb9a", "Evaluate a boolean handler", 0, 0,
            Defaults(("method", "CheckCondition"), ("arguments", ""), ("mock", "Success"))),
        Define(NodeKind.Action, "Action", NodeCategory.Leaf, "#d29d80", "Execute a status handler", 0, 0,
            Defaults(("method", "PerformAction"), ("arguments", ""), ("mock", "Success"))),
        Define(NodeKind.Wait, "Wait", NodeCategory.GameAi, "#7fb7b8", "Wait for elapsed time", 0, 0,
            Defaults(("seconds", 1)), new[] { ProjectMode.Game }),
        Define(NodeKind.Cooldown, "Cooldown", NodeCategory.GameAi, "#d5b375", "Limit execution frequency", 1, 1,
            Defaults(("seconds", 2)), new[] { ProjectMode.Game }),
        Define(NodeKind.RandomSelector, "Random Selector", NodeCategory.GameAi, "#899cf6", "Try children in shuffled order", 1, null,
            modes: new[] { ProjectMode.Game }),
        Define(NodeKind.RandomSequence, "Random Sequence", NodeCategory.GameAi, "#70c4d4", "Execute children in shuffled order", 1, null,
            modes: new[] { ProjectMode.Game }),
        Define(NodeKind.BlackboardCheck, "Blackboard Check", NodeCategory.GameAi, "#89bb9a", "Compare a shared variable", 0, 0,
            Defaults(("variable", "targetVisible"), ("value", "true")), new[] { ProjectMode.Game }),
        Define(NodeKind.SetBlackboard, "Set Blackboard", NodeCategory.GameAi, "#d29d80", "Update a shared variable", 0, 0,
            Defaults(("variable", "targetVisible"), ("value", "true")), new[] { ProjectMode.Game }),
        Define(NodeKind.AsyncAction, "Async Action", NodeCategory.Workflow, "#d29d80", "Await an asynchronous handler", 0, 0,
            Defaults(("method", "ProcessAsync"), ("arguments", ""), ("mock", "Success")), new[] { ProjectMode.Workflow }),
        Define(NodeKind.HttpRequest, "HTTP Request", NodeCategory.Workflow, "#899cf6", "Send an HTTP request", 0, 0,
            Defaults(("method", "CheckInventory"), ("httpMethod", "GET"), ("url", "https://api.example.com/inventory"),
                ("headers", "{}"), ("timeout", 30), ("credentialEnv", ""), ("mock", "Success")), new[] { ProjectMode.Workflow }),
        Define(NodeKind.Delay, "Delay", NodeCategory.Workflow, "#7fb7b8", "Asynchronous cancellable delay", 0, 0,
            Defaults(("seconds", 1)), new[] { ProjectMode.Workflow }),
        Define(NodeKind.Validate, "Validate", NodeCategory.Workflow, "#89bb9a", "Validate input using a handler", 0, 0,
            Defaults(("method", "ValidateOrder"), ("arguments", ""), ("mock", "Success")), new[] { ProjectMode.Workflow }),
        Define(NodeKind.Transform, "Transform", NodeCategory.Workflow, "#d29d80", "Transform context using a handler", 0, 0,
            Defaults(("method", "TransformData"), ("arguments", ""), ("mock", "Success")), new[] { ProjectMode.Workflow }),
        Define(NodeKind.Log, "Log", NodeCategory.Workflow, "#a9b2c4", "Write a context log message", 0, 0,
            Defaults(("message", "Completed")), new[] { ProjectMode.Workflow }),
        Define(NodeKind.ExceptionHandler, "Exception Handler", NodeCategory.Workflow, "#d5b375", "Convert child exceptions to failure", 1, 1,
            modes: new[] { ProjectMode.Workflow }),
        Define(NodeKind.SetContext, "Set Context", NodeCategory.Workflow, "#d29d80", "Update a context variable", 0, 0,
            Defaults(("variable", "hasStock"), ("value", "true")), new[] { ProjectMode.Workflow }),
        Define(NodeKind.ContextCheck, "Context Check", NodeCategory.Workflow, "#89bb9a", "Compare a context variable", 0, 0,
            Defaults(("variable", "hasStock"), ("value", "true")), new[] { ProjectMode.Workflow }),
    });

        private static IReadOnlyList<TEnum> Values<TEnum>() where TEnum : struct, Enum =>
            Array.AsReadOnly(ContractValue.GetValues<TEnum>());

        private static IReadOnlyDictionary<string, object> Defaults(params (string Name, object Value)[] values) =>
            new ReadOnlyDictionary<string, object>(values.ToDictionary(
                item => item.Name,
                item => item.Value is string or bool or int or double
                    ? item.Value
                    : throw new ArgumentException("Node defaults must be string, number, or boolean."),
                StringComparer.Ordinal));

        private static NodeDefinition Define(
            NodeKind kind, string label, NodeCategory category, string color, string description,
            int minChildren, int? maxChildren, IReadOnlyDictionary<string, object>? defaults = null,
            ProjectMode[]? modes = null, string aliases = "") => new(
                kind, label, category, color, description, aliases, minChildren, maxChildren,
                modes is null ? Modes : Array.AsReadOnly(modes), defaults ?? Defaults());
    }
}
