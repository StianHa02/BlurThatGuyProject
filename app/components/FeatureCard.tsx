import { LucideIcon } from 'lucide-react';

interface FeatureCardProps {
  icon: LucideIcon;
  step: number;
  title: string;
  description: string;
  color: 'indigo' | 'purple' | 'pink';
}

const colorClasses = {
  indigo: {
    bg: 'bg-indigo-500/10',
    text: 'text-indigo-400',
    border: 'hover:border-indigo-500/50',
  },
  purple: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'hover:border-purple-500/50',
  },
  pink: {
    bg: 'bg-pink-500/10',
    text: 'text-pink-400',
    border: 'hover:border-pink-500/50',
  },
};

export function FeatureCard({ icon: Icon, step, title, description, color }: FeatureCardProps) {
  const colors = colorClasses[color];

  return (
    <div className={`glass rounded-2xl p-8 group ${colors.border} transition-colors`}>
      <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center mb-8 `}>
        <Icon className={`w-6 h-6 ${colors.text}`} />
      </div>
      <div className={`text-sm ${colors.text} font-medium mb-2`}>Step {step}</div>
      <h3 className="text-xl font-semibold mb-4">{title}</h3>
      <p className="text-zinc-400 text-sm leading-relaxed">{description}</p>
    </div>
  );
}