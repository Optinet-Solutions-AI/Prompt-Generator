// The start page. Shows a greeting, a "Continue" shortcut to the last screen used,
// and a tile for every screen, grouped like the sidebar. It loads no data.
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { firstName } from '@/lib/auth-api';
import { SCREENS, GROUP_LABELS, LAST_SCREEN_KEY, continueTarget, greetingFor } from '@/lib/nav/screens';
import { SCREEN_ICONS } from '@/components/layout/screen-icons';

const GROUPS = ['create', 'libraries', 'tools'] as const;

// Reads the remembered screen. Browser storage can be blocked, so never let it crash the page.
function readLastScreen(): string | null {
  try {
    return localStorage.getItem(LAST_SCREEN_KEY);
  } catch {
    return null;
  }
}

export default function Home() {
  const { user } = useAuth();
  const greeting = greetingFor(new Date().getHours());
  const heading = user ? `${greeting}, ${firstName(user)}` : greeting;
  const resume = continueTarget(readLastScreen());
  const ResumeIcon = resume ? SCREEN_ICONS[resume.id] : null;

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-6 space-y-8">
      <h1 className="text-2xl sm:text-3xl font-semibold">{heading}</h1>

      {resume && ResumeIcon && (
        <Link
          to={resume.path}
          className="flex items-center gap-3 bg-card border border-border rounded-xl p-4 hover:bg-accent transition-colors"
        >
          <ResumeIcon className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Continue where you left off</p>
            <p className="font-medium">{resume.label}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Link>
      )}

      {GROUPS.map(group => (
        <section key={group} className="space-y-3">
          <h2 className="text-xs font-semibold tracking-wider text-muted-foreground">{GROUP_LABELS[group]}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SCREENS.filter(s => s.group === group).map(s => {
              const Icon = SCREEN_ICONS[s.id];
              return (
                <Link
                  key={s.id}
                  to={s.path}
                  className="bg-card border border-border rounded-xl p-4 hover:bg-accent transition-colors"
                >
                  <Icon className="h-5 w-5 text-primary mb-3" />
                  <p className="font-medium">{s.label}</p>
                  <p className="text-sm text-muted-foreground mt-1">{s.blurb}</p>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
