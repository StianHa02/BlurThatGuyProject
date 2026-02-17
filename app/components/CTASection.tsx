import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

interface CTASectionProps {
  icon: LucideIcon;
  title: string;
  description: string;
  buttonText: string;
  buttonIcon: LucideIcon;
  buttonHref: string;
}

export function CTASection({
  icon: Icon,
  title,
  description,
  buttonText,
  buttonIcon: ButtonIcon,
  buttonHref
}: CTASectionProps) {
  return (
    <section className="py-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <div className="glass rounded-3xl p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />

          <div className="relative z-10">
            <Icon className="w-12 h-12 text-indigo-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-4">{title}</h2>
            <p className="text-zinc-400 mb-8 max-w-md mx-auto">{description}</p>
            <Link
              href={buttonHref}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 transition-all font-semibold text-white glow-indigo"
            >
              <ButtonIcon className="w-5 h-5" />
              {buttonText}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
