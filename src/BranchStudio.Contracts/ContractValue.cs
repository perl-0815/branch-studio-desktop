using System;
using System.Linq;
using System.Reflection;

namespace BranchStudio.Contracts
{
    /// <summary>The stable JSON string for an enum member, independent of its C# name.</summary>
    [AttributeUsage(AttributeTargets.Field)]
    public sealed class ContractValueAttribute : Attribute
    {
        public ContractValueAttribute(string value) => Value = value;
        public string Value { get; }
    }

    public static class ContractValue
    {
        public static string GetName<TEnum>(TEnum value) where TEnum : struct, Enum
        {
            var name = Enum.GetName(typeof(TEnum), value)
                ?? throw new ArgumentOutOfRangeException(nameof(value));
            return typeof(TEnum).GetField(name)!.GetCustomAttribute<ContractValueAttribute>()?.Value
                ?? throw new InvalidOperationException($"Missing contract value for {typeof(TEnum).Name}.{name}.");
        }

        /// <summary>Declaration order, including negative sentinel values such as Idle.</summary>
        public static TEnum[] GetValues<TEnum>() where TEnum : struct, Enum =>
            typeof(TEnum).GetFields(BindingFlags.Public | BindingFlags.Static)
                .OrderBy(field => field.MetadataToken)
                .Select(field => (TEnum)field.GetValue(null)!).ToArray();
    }
}
