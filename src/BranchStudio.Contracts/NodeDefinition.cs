using System.Collections.Generic;

namespace BranchStudio.Contracts
{
    public sealed class NodeDefinition
    {
        public NodeDefinition(NodeKind kind, string label, NodeCategory category, string color,
            string description, string aliases, int minChildren, int? maxChildren,
            IReadOnlyList<ProjectMode> modes, IReadOnlyDictionary<string, object> defaults)
        {
            Kind = kind;
            Label = label;
            Category = category;
            Color = color;
            Description = description;
            Aliases = aliases;
            MinChildren = minChildren;
            MaxChildren = maxChildren;
            Modes = modes;
            Defaults = defaults;
        }

        public NodeKind Kind { get; }
        public string Label { get; }
        public NodeCategory Category { get; }
        public string Color { get; }
        public string Description { get; }
        public string Aliases { get; }
        public int MinChildren { get; }
        /// <summary>Null means unbounded; JSON cannot represent Infinity.</summary>
        public int? MaxChildren { get; }
        public IReadOnlyList<ProjectMode> Modes { get; }
        /// <summary>Values are restricted to string, boolean, or finite number.</summary>
        public IReadOnlyDictionary<string, object> Defaults { get; }
    }
}
