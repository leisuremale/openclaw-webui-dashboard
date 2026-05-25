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
import type { Page } from './lib/types';

function PageContent({
  page,
  onViewAgent,
  onNavigate,
}: {
  page: Page;
  onViewAgent: (id: string) => void;
  onNavigate: (p: Page) => void;
}) {
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
      return <CollabPanel key="collab" onNavigate={onNavigate} />;
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

  // Agent detail is a sub-view: it overlays the current page but keeps the
  // underlying `page` state so the sidebar highlight stays consistent with
  // where the user came from. Clicking a sidebar entry calls
  // handlePageChange which clears selectedAgent and switches the page.
  return (
    <Layout page={page} onPageChange={handlePageChange}>
      {selectedAgent ? (
        <AgentDetail
          key={selectedAgent}
          agentId={selectedAgent}
          onBack={() => setSelectedAgent(null)}
        />
      ) : (
        <PageContent page={page} onViewAgent={handleViewAgent} onNavigate={handlePageChange} />
      )}
    </Layout>
  );
}
