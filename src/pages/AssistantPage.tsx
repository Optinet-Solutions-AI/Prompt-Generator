import { useParams } from 'react-router-dom';
import NotFound from './NotFound';

function isAllowed(token: string | undefined): boolean {
  if (!token) return false;
  const raw = import.meta.env.VITE_ASSISTANT_TOKENS as string | undefined;
  if (!raw) return false;
  return raw.split(',').map(s => s.trim()).includes(token);
}

export default function AssistantPage() {
  const { token } = useParams();
  if (!isAllowed(token)) return <NotFound />;

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">AI Concept Assistant</h1>
      <p className="mt-2 text-muted-foreground">
        Hello, <span className="font-mono">{token}</span>. Page under construction.
      </p>
    </main>
  );
}
