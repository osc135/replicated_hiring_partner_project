import { AlertTriangle, AlertCircle, Info } from 'lucide-react';

interface Props {
  severity: 'critical' | 'warning' | 'info';
}

const config = {
  critical: {
    gradient: 'bg-gradient-to-r from-red-700 to-red-500',
    text: 'text-white',
    label: 'CRITICAL',
    description: 'Immediate attention required — critical issues detected',
    Icon: AlertCircle,
  },
  warning: {
    gradient: 'bg-gradient-to-r from-amber-600 to-amber-400',
    text: 'text-white',
    label: 'WARNING',
    description: 'Review recommended — potential issues detected',
    Icon: AlertTriangle,
  },
  info: {
    gradient: 'bg-gradient-to-r from-blue-600 to-blue-400',
    text: 'text-white',
    label: 'INFO',
    description: 'No critical issues — bundle looks healthy',
    Icon: Info,
  },
};

export default function SeverityBanner({ severity }: Props) {
  const { gradient, text, label, description, Icon } = config[severity] || config.info;

  return (
    <div className={`${gradient} ${text} rounded-lg px-5 py-4 flex items-start gap-3 shadow-sm`}>
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <div>
        <span className="font-bold text-sm tracking-wide">{label}</span>
        <p className="text-sm opacity-90 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
