import { useState } from 'react';
import { Activity, Clock, Cpu, Layers, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Radio, Terminal } from 'lucide-react';
import { cn } from '../lib/utils';

type Page = 'overview' | 'cron' | 'skills' | 'models' | 'logs' | 'sessions';

interface LayoutProps {
  children: React.ReactNode;
  page: Page;
  onPageChange: (p: Page) => void;
}

const navItems: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: '总览', icon: LayoutDashboard },
  { id: 'sessions', label: '会话', icon: Radio },
  { id: 'cron', label: 'Cron', icon: Clock },
  { id: 'skills', label: 'Skills', icon: Layers },
  { id: 'models', label: '模型', icon: Cpu },
  { id: 'logs', label: '日志', icon: Terminal },
];

export function Layout({ children, page, onPageChange }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          'flex-shrink-0 border-r border-white/[0.06] bg-slate-900/50 flex flex-col transition-all duration-300 ease-in-out',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        <div className={cn(
          'h-16 flex items-center border-b border-white/[0.06] transition-all duration-300',
          collapsed ? 'justify-center px-2' : 'gap-3 px-5'
        )}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center flex-shrink-0">
            <Activity className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="font-semibold text-slate-100 tracking-tight whitespace-nowrap animate-in fade-in duration-200">
              Le's Openclaw
            </span>
          )}
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = page === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onPageChange(item.id)}
                title={collapsed ? item.label : undefined}
                className={cn(
                  'w-full flex items-center rounded-lg text-sm font-medium transition-all duration-200',
                  collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                  active
                    ? 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
                )}
              >
                <Icon className={cn('w-4 h-4 flex-shrink-0 transition-colors', active && 'text-indigo-400')} />
                {!collapsed && <span className="whitespace-nowrap">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className={cn(
          'border-t border-white/[0.06] transition-all duration-300',
          collapsed ? 'p-2' : 'p-4'
        )}>
          {collapsed ? (
            <div className="flex justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                Gateway 在线
              </div>
              <div className="text-[10px] text-slate-600 mt-1 font-mono">port 18789</div>
            </>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-white/[0.06] flex items-center justify-between px-6 bg-slate-900/30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 rounded-lg hover:bg-white/[0.04] text-slate-400 hover:text-slate-200 transition-colors"
              title={collapsed ? '展开侧栏' : '收起侧栏'}
            >
              {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
            <h1 className="text-lg font-semibold text-slate-100">
              {navItems.find((n) => n.id === page)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-mono">
              {new Date().toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
