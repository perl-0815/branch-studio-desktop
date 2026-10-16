using System;

namespace BranchStudio.Contracts
{

    // These names are the persisted JSON contract, independent of C# member names.
    public enum ProjectMode
    {
        [ContractValue("game")] Game,
        [ContractValue("workflow")] Workflow,
    }

    public enum NodeKind
    {
        [ContractValue("Root")] Root,
        [ContractValue("Selector")] Selector,
        [ContractValue("Sequence")] Sequence,
        [ContractValue("Parallel")] Parallel,
        [ContractValue("Inverter")] Inverter,
        [ContractValue("Repeater")] Repeater,
        [ContractValue("Retry")] Retry,
        [ContractValue("Timeout")] Timeout,
        [ContractValue("Condition")] Condition,
        [ContractValue("Action")] Action,
        [ContractValue("Wait")] Wait,
        [ContractValue("Cooldown")] Cooldown,
        [ContractValue("RandomSelector")] RandomSelector,
        [ContractValue("RandomSequence")] RandomSequence,
        [ContractValue("BlackboardCheck")] BlackboardCheck,
        [ContractValue("SetBlackboard")] SetBlackboard,
        [ContractValue("AsyncAction")] AsyncAction,
        [ContractValue("HttpRequest")] HttpRequest,
        [ContractValue("Delay")] Delay,
        [ContractValue("Validate")] Validate,
        [ContractValue("Transform")] Transform,
        [ContractValue("Log")] Log,
        [ContractValue("ExceptionHandler")] ExceptionHandler,
        [ContractValue("SetContext")] SetContext,
        [ContractValue("ContextCheck")] ContextCheck,
    }

    public enum NodeCategory
    {
        [ContractValue("Structure")] Structure,
        [ContractValue("Composite")] Composite,
        [ContractValue("Decorator")] Decorator,
        [ContractValue("Leaf")] Leaf,
        [ContractValue("Game AI")] GameAi,
        [ContractValue("Workflow")] Workflow,
    }

    public enum NodeStatus
    {
        [ContractValue("Idle")] Idle = -1,
        [ContractValue("Running")] Running = 0,
        [ContractValue("Success")] Success,
        [ContractValue("Failure")] Failure,
    }

    public enum VariableType
    {
        [ContractValue("bool")] Bool,
        [ContractValue("int")] Int,
        [ContractValue("float")] Float,
        [ContractValue("string")] String,
        [ContractValue("Vector3")] Vector3,
    }

    public enum ValidationSeverity
    {
        [ContractValue("error")] Error,
        [ContractValue("warning")] Warning,
    }

    public enum WorkflowResult
    {
        [ContractValue("Running")] Running = 0,
        [ContractValue("Success")] Success,
        [ContractValue("Failure")] Failure,
    }
}
