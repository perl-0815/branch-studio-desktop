import {
  GitBranch,
  ArrowDownWideNarrow,
  ListOrdered,
  Layers,
  CircleHelp,
  Zap,
  Repeat2,
  RotateCcw,
  Timer,
  Hourglass,
  Shuffle,
  Database,
  PencilLine,
  Globe,
  CheckCheck,
  Braces,
  AlignLeft,
  ShieldCheck,
  CircleDot,
  Workflow,
} from 'lucide-react';
import type { NodeKind } from '@/lib/types';
const icons = {
  Root: GitBranch,
  Selector: ArrowDownWideNarrow,
  Sequence: ListOrdered,
  Parallel: Layers,
  Inverter: RotateCcw,
  Repeater: Repeat2,
  Retry: RotateCcw,
  Timeout: Timer,
  Condition: CircleHelp,
  Action: Zap,
  Wait: Hourglass,
  Cooldown: Timer,
  RandomSelector: Shuffle,
  RandomSequence: Shuffle,
  BlackboardCheck: Database,
  SetBlackboard: PencilLine,
  AsyncAction: Workflow,
  HttpRequest: Globe,
  Delay: Hourglass,
  Validate: CheckCheck,
  Transform: Braces,
  Log: AlignLeft,
  ExceptionHandler: ShieldCheck,
  SetContext: PencilLine,
  ContextCheck: CircleDot,
};
export default function NodeIcon({
  kind,
  size = 16,
  className,
}: {
  kind: NodeKind;
  size?: number;
  className?: string;
}) {
  const Icon = icons[kind];
  return <Icon size={size} strokeWidth={1.7} className={className} />;
}
