import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  Sparkles,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowRight,
  TrendingUp,
  Target,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  X,
} from 'lucide-react';
import { apiRequest } from '../lib/api';

export type GanttZoomLevel = 'days' | 'weeks' | 'months' | 'quarters' | 'years';

interface GanttTask {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  percentDone: number;
  duration?: number;
  durationUnit?: string;
  category?: string;
  targetAmount?: number;
  currentAmount?: number;
  currency?: string;
  isMilestone?: boolean;
  expanded?: boolean;
  children?: GanttTask[];
  notes?: string;
  status?: string;
}

interface GanttDependency {
  id: string;
  from: string;
  to: string;
  type: number;
}

interface GanttSummary {
  totalGoals: number;
  totalTargetAmount: number;
  totalSavedAmount: number;
  overallProgressPercent: number;
  activeGoalsCount: number;
  completedGoalsCount: number;
}

export const FinancialRoadmapPage: React.FC = () => {
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [dependencies, setDependencies] = useState<GanttDependency[]>([]);
  const [summary, setSummary] = useState<GanttSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<GanttZoomLevel>('months');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [selectedTask, setSelectedTask] = useState<GanttTask | null>(null);

  useEffect(() => {
    const fetchRoadmap = async () => {
      setLoading(true);
      try {
        const res = await apiRequest<{
          success: boolean;
          tasks: GanttTask[];
          dependencies: GanttDependency[];
          summary: GanttSummary;
        }>('/calendar/gantt-roadmap');
        setTasks(res.tasks || []);
        setDependencies(res.dependencies || []);
        setSummary(res.summary || null);

        // Auto-expand all parent goals
        const initialExpanded: Record<string, boolean> = {};
        (res.tasks || []).forEach((t) => {
          initialExpanded[t.id] = true;
        });
        setExpandedNodes(initialExpanded);
      } catch (err) {
        console.error('Failed to load Bryntum Gantt Roadmap dataset:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRoadmap();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Timeline scale calculation
  const timelineDates = useMemo(() => {
    const now = new Date();
    const startYear = now.getFullYear();
    const intervals: { label: string; date: Date }[] = [];

    if (zoomLevel === 'days') {
      for (let i = -7; i <= 21; i++) {
        const d = new Date(now.getTime() + i * 86400000);
        intervals.push({ label: `${d.getDate()} ${d.toLocaleDateString('en-US', { month: 'short' })}`, date: d });
      }
    } else if (zoomLevel === 'weeks') {
      for (let i = -2; i <= 10; i++) {
        const d = new Date(now.getTime() + i * 7 * 86400000);
        intervals.push({ label: `W${i + 3} ${d.toLocaleDateString('en-US', { month: 'short' })}`, date: d });
      }
    } else if (zoomLevel === 'months') {
      for (let m = -2; m <= 10; m++) {
        const d = new Date(startYear, now.getMonth() + m, 1);
        intervals.push({ label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), date: d });
      }
    } else if (zoomLevel === 'quarters') {
      for (let q = 0; q <= 6; q++) {
        const d = new Date(startYear, Math.floor(now.getMonth() / 3) * 3 + q * 3, 1);
        intervals.push({ label: `Q${Math.floor(d.getMonth() / 3) + 1} '${String(d.getFullYear()).slice(2)}`, date: d });
      }
    } else {
      // Years
      for (let y = 0; y <= 4; y++) {
        const d = new Date(startYear + y, 0, 1);
        intervals.push({ label: `${startYear + y}`, date: d });
      }
    }
    return intervals;
  }, [zoomLevel]);

  // Compute Gantt bar position percentages
  const getBarPosition = (startDateStr: string, endDateStr: string) => {
    if (timelineDates.length < 2) return { left: '10%', width: '40%' };
    const minTime = timelineDates[0].date.getTime();
    const maxTime = timelineDates[timelineDates.length - 1].date.getTime();
    const totalDuration = maxTime - minTime || 1;

    const taskStart = new Date(startDateStr).getTime();
    const taskEnd = new Date(endDateStr).getTime();

    const clampStart = Math.max(minTime, Math.min(maxTime, taskStart));
    const clampEnd = Math.max(minTime, Math.min(maxTime, taskEnd));

    const left = ((clampStart - minTime) / totalDuration) * 100;
    const width = Math.max(3, ((clampEnd - clampStart) / totalDuration) * 100);

    return {
      left: `${Math.max(0, Math.min(95, left))}%`,
      width: `${Math.max(4, Math.min(100 - left, width))}%`,
    };
  };

  return (
    <div className="space-y-6">
      {/* Workspace Header */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/60 px-3 py-1 rounded-full">
              <Layers className="w-3.5 h-3.5" />
              Bryntum Gantt Engine
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 rounded-full">
              Finish-to-Start Dependencies Active
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white mt-2">
            Financial Roadmap &amp; Long-Term Goals
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            A structured Bryntum Gantt project plan connecting savings goals, capital allocation phases, and milestone dependencies.
          </p>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold mr-1">Zoom:</span>
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700/60 text-xs font-semibold">
            {(
              [
                { id: 'days', label: 'Days' },
                { id: 'weeks', label: 'Weeks' },
                { id: 'months', label: 'Months' },
                { id: 'quarters', label: 'Quarters' },
                { id: 'years', label: 'Years' },
              ] as { id: GanttZoomLevel; label: string }[]
            ).map((z) => (
              <button
                key={z.id}
                onClick={() => setZoomLevel(z.id)}
                className={`px-3 py-1.5 rounded-lg capitalize transition ${
                  zoomLevel === z.id
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
                }`}
              >
                {z.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Overview Summary */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Overall Progress</span>
              <div className="text-2xl font-extrabold text-purple-600 dark:text-purple-400 mt-0.5">
                {summary.overallProgressPercent}%
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Across {summary.totalGoals} structured plans
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Capital Saved</span>
              <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                ${summary.totalSavedAmount.toLocaleString('en-US')}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Of ${summary.totalTargetAmount.toLocaleString('en-US')} target
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Active Plans</span>
              <div className="text-2xl font-extrabold text-navy-900 dark:text-white mt-0.5">
                {summary.activeGoalsCount}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                In progress accumulation
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Fulfilled Goals</span>
              <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {summary.completedGoalsCount}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                100% milestone reached
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Bryntum Gantt Chart Container */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Gantt Header Columns */}
        <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider py-3 px-4">
          <div className="col-span-5 sm:col-span-4">Financial Goal / Milestone Task</div>
          <div className="col-span-2 hidden sm:block text-right pr-4">Progress</div>
          <div className="col-span-7 sm:col-span-6 flex justify-between">
            {timelineDates.map((item, idx) => (
              <span key={idx} className="text-[11px] font-semibold text-center flex-1">
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* Gantt Tree & Bars */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {tasks.map((parentGoal) => {
            const isExpanded = !!expandedNodes[parentGoal.id];
            const parentPos = getBarPosition(parentGoal.startDate, parentGoal.endDate);

            return (
              <React.Fragment key={parentGoal.id}>
                {/* Parent Goal Row */}
                <div
                  className="grid grid-cols-12 items-center py-3.5 px-4 bg-slate-50/40 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                  onClick={() => toggleExpand(parentGoal.id)}
                >
                  {/* Task Name & Expand Caret */}
                  <div className="col-span-5 sm:col-span-4 flex items-center gap-2">
                    <button
                      type="button"
                      className="p-1 rounded text-slate-400 hover:text-navy-900 dark:hover:text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpand(parentGoal.id);
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <Target className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="font-bold text-navy-900 dark:text-white truncate">
                      {parentGoal.name}
                    </span>
                  </div>

                  {/* Progress Indicator */}
                  <div className="col-span-2 hidden sm:block text-right pr-4">
                    <span className="font-bold text-purple-600 dark:text-purple-400">
                      {parentGoal.percentDone}%
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      ${parentGoal.currentAmount?.toLocaleString('en-US')} / $
                      {parentGoal.targetAmount?.toLocaleString('en-US')}
                    </span>
                  </div>

                  {/* Gantt Timeline Bar Area */}
                  <div className="col-span-7 sm:col-span-6 relative h-7 flex items-center">
                    <div
                      className="absolute h-5 rounded-lg bg-purple-600/30 border border-purple-500 overflow-hidden flex items-center shadow-xs cursor-pointer"
                      style={{
                        left: parentPos.left,
                        width: parentPos.width,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTask(parentGoal);
                      }}
                      title={`${parentGoal.name} (${parentGoal.percentDone}%)`}
                    >
                      {/* Percent Fill */}
                      <div
                        className="h-full bg-purple-600"
                        style={{ width: `${parentGoal.percentDone}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white drop-shadow-xs">
                        {parentGoal.percentDone}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Subtask Children */}
                {isExpanded &&
                  (parentGoal.children || []).map((subtask) => {
                    const subPos = getBarPosition(subtask.startDate, subtask.endDate);

                    return (
                      <div
                        key={subtask.id}
                        className="grid grid-cols-12 items-center py-2.5 px-4 pl-10 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer"
                        onClick={() => setSelectedTask(subtask)}
                      >
                        {/* Subtask Name */}
                        <div className="col-span-5 sm:col-span-4 flex items-center gap-2">
                          {subtask.isMilestone ? (
                            <div className="w-3 h-3 rotate-45 bg-amber-500 border border-amber-600 shrink-0" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                          )}
                          <span
                            className={`truncate ${
                              subtask.isMilestone
                                ? 'font-bold text-amber-600 dark:text-amber-400'
                                : 'text-slate-700 dark:text-slate-300 font-medium'
                            }`}
                          >
                            {subtask.name}
                          </span>
                        </div>

                        {/* Progress */}
                        <div className="col-span-2 hidden sm:block text-right pr-4">
                          <span className="font-semibold text-slate-600 dark:text-slate-400">
                            {subtask.percentDone}%
                          </span>
                        </div>

                        {/* Gantt Bar / Milestone Diamond */}
                        <div className="col-span-7 sm:col-span-6 relative h-6 flex items-center">
                          {subtask.isMilestone ? (
                            <div
                              className="absolute w-4 h-4 rotate-45 bg-amber-500 border-2 border-white dark:border-slate-900 shadow-md flex items-center justify-center"
                              style={{ left: subPos.left }}
                              title={subtask.name}
                            />
                          ) : (
                            <div
                              className="absolute h-3.5 rounded-md bg-purple-500/20 border border-purple-400/50 overflow-hidden"
                              style={{
                                left: subPos.left,
                                width: subPos.width,
                              }}
                              title={`${subtask.name} (${subtask.percentDone}%)`}
                            >
                              <div
                                className="h-full bg-purple-500"
                                style={{ width: `${subtask.percentDone}%` }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Task Inspection Drawer */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-purple-600" />
                <h3 className="text-base font-bold text-navy-900 dark:text-white">
                  Financial Task Inspection
                </h3>
              </div>
              <button
                onClick={() => setSelectedTask(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Task / Phase</span>
                <span className="text-sm font-bold text-navy-900 dark:text-white">
                  {selectedTask.name}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 block text-[11px]">Start Date</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {new Date(selectedTask.startDate).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Target Completion</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {new Date(selectedTask.endDate).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {selectedTask.targetAmount && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Target Amount</span>
                    <span className="text-sm font-extrabold text-navy-900 dark:text-white">
                      ${selectedTask.targetAmount.toLocaleString('en-US')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Current Progress</span>
                    <span className="text-sm font-extrabold text-purple-600 dark:text-purple-400">
                      ${selectedTask.currentAmount?.toLocaleString('en-US')} ({selectedTask.percentDone}%)
                    </span>
                  </div>
                </div>
              )}

              {selectedTask.notes && (
                <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900 text-purple-900 dark:text-purple-200">
                  {selectedTask.notes}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
