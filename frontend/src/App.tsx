import { useState, useTransition } from 'react';
import { Layout } from './components/Layout';
import { Overview } from './components/Overview';
import { CronTimeline } from './components/CronTimeline';
import { SkillsPage } from './components/SkillsPage';
import { ModelsPage } from './components/ModelsPage';
import { AgentDetail } from './components/AgentDetail';
import { LogViewer } from './components/LogViewer';
import { ActiveSessions } from './components/ActiveSessions';
import { CollabPanel } from './components/CollabPanel';

type Page = 'overview' | 'cron' | 'skills' | 'models' | 'logs' | 'sessions' | 'collab';

function PageContent({ page, onViewAgent }: { page: Page; onViewAgent: (id: string) => void }) {
  switch (page) {
    case 'overview':
      return <Overview key="overview" onViewAgent={onViewAgent} />;
    case 'cron':
      return <CronTimeline key="cron" />;
    case 'skills':
      return <SkillsPage key="skills" />;
    case 'models':
      return <ModelsPage key="models" />;
    case 'logs':
      return <LogViewer key="logs" />;
    case 'sessions':
      return <ActiveSessions key="sessions" />;
    case 'collab':
      return <CollabPanel key="collab" />;
  }
}

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const handlePageChange = (p: Page) => {
    startTransition(() => {
      setPage(p);
      setSelectedAgent(null);
    });
  };

  const handleViewAgent = (id: string) => {
    setSelectedAgent(id);
  };

  // Show agent detail page when an agent card is clicked from overview
  if (selectedAgent) {
    return (
      <Layout page="overview" onPageChange={handlePageChange}>
        <AgentDetail
          key={selectedAgent}
          agentId={selectedAgent}
          onBack={() => setSelectedAgent(null)}
        />
      </Layout>
    );
  }

  return (
    <Layout page={page} onPageChange={handlePageChange}>
      <PageContent page={page} onViewAgent={handleViewAgent} />
    </Layout>
  );
}
