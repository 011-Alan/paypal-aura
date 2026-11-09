import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  Target,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  X,
  Calendar,
  Layers,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';

export type GanttZoomLevel = 'months' | 'quarters' | 'years';

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

interface GanttSummary {
  totalGoals: number;
  totalTargetAmount: number;
  totalSavedAmount: number;
  overallProgressPercent: number;
  activeGoalsCount: number;
  completedGoalsCount: number;
}

const GOAL_PALETTE = [
  { bar: '#8b5cf6', track: '#ede9fe', border: '#7c3aed' }, // Violet
  { bar: '#3b82f6', track: '#dbeafe', border: '#2563eb' }, // Blue
  { bar: '#10b981', track: '#d1fae5', border: '#059669' }, // Emerald
  { bar: '#f59e0b', track: '#fef3c7', border: '#d97706' }, // Amber
  { bar: '#ec4899', track: '#fce7f3', border: '#db2777' }, // Pink
  { bar: '#06b6d4', track: '#cffafe', border: '#0891b2' }, // Cyan
];

export const FinancialRoadmapPage: React.FC = () => {
  const { balancesVisible, formatMoney } = useAuth();
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [summary, setSummary] = useState<GanttSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<GanttZoomLevel>('months');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Active milestone inspection & positioning
  const [activeMilestone, setActiveMilestone] = useState<{
    task: GanttTask;
    milestone: {
      name: string;
      percentage: number;
      targetAmount?: number;
      targetDate?: string;
      currentProgress: number;
      isReached: boolean;
    };
    position: { top: number; left: number; placeAbove: boolean };
  } | null>(null);

  // Active Goal detail panel
  const [selectedGoal, setSelectedGoal] = useState<GanttTask | null>(null);

  // Hover tooltip
  const [hoveredMilestone, setHoveredMilestone] = useState<{
    text: string;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const fetchRoadmap = async () => {
      setLoading(true);
      try {
        const res = await apiRequest<{
          success: boolean;
          tasks: GanttTask[];
          dependencies: any[];
          summary: GanttSummary;
        }>('/calendar/gantt-roadmap');
        setTasks(res.tasks || []);
        setSummary(res.summary || null);

        const initial: Record<string, boolean> = {};
        (res.tasks || []).forEach((t) => {
          initial[t.id] = false; // Start compact as requested in Section 4.E
        });
        setExpandedNodes(initial);
      } catch (err) {
        console.error('Failed to load roadmap dataset:', err);
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

  // Timeline intervals based on selected zoom
  const timelineIntervals = useMemo(() => {
    const now = new Date();
    const startYear = now.getFullYear();
    const intervals: { label: string; date: Date }[] = [];

    if (zoomLevel === 'months') {
      for (let m = -1; m <= 10; m++) {
        const d = new Date(startYear, now.getMonth() + m, 1);
        intervals.push({
          label: d.toLocaleDateString('en-US', { month: 'short' }),
          date: d,
        });
      }
    } else if (zoomLevel === 'quarters') {
      for (let q = 0; q <= 6; q++) {
        const d = new Date(startYear, Math.floor(now.getMonth() / 3) * 3 + q * 3, 1);
        intervals.push({
          label: `Q${Math.floor(d.getMonth() / 3) + 1} '${String(d.getFullYear()).slice(2)}`,
          date: d,
        });
      }
    } else {
      for (let y = 0; y <= 4; y++) {
        const d = new Date(startYear + y, 0, 1);
        intervals.push({ label: `${startYear + y}`, date: d });
      }
    }
    return intervals;
  }, [zoomLevel]);

  // Compute position on the horizontal scale
  const getTimelinePosition = (startDateStr: string, endDateStr: string) => {
    if (timelineIntervals.length < 2) return { left: 10, width: 40 };
    const minTime = timelineIntervals[0].date.getTime();
    const maxTime = timelineIntervals[timelineIntervals.length - 1].date.getTime();
    const totalDuration = maxTime - minTime || 1;

    const start = new Date(startDateStr).getTime();
    const end = new Date(endDateStr).getTime();

    const clampStart = Math.max(minTime, Math.min(maxTime, start));
    const clampEnd = Math.max(minTime, Math.min(maxTime, end));

    const left = ((clampStart - minTime) / totalDuration) * 100;
    const width = Math.max(5, ((clampEnd - clampStart) / totalDuration) * 100);

    return {
      left: Math.max(2, Math.min(92, left)),
      width: Math.max(6, Math.min(100 - left, width)),
    };
  };

  // Intelligent collision-free milestone click positioning (Section 4.D)
  const handleMilestoneClick = (
    e: React.MouseEvent,
    goal: GanttTask,
    milestone: any
  ) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    const isMobile = window.innerWidth < 640;

    if (isMobile) {
      // On mobile: open bottom sheet/panel without hover chase
      setActiveMilestone({
        task: goal,
        milestone,
        position: { top: 0, left: 0, placeAbove: false },
      });
      return;
    }

    const popoverHeight = 150;
    const popoverWidth = 260;

    // Place above if room, else place below
    const spaceAbove = rect.top;
    const placeAbove = spaceAbove > popoverHeight + 80;

    const top = placeAbove ? rect.top - 8 : rect.bottom + 8;

    // Horizontal clamp within viewport bounds
    let left = rect.left + rect.width / 2;
    if (left - popoverWidth / 2 < 20) {
      left = popoverWidth / 2 + 20;
    } else if (left + popoverWidth / 2 > window.innerWidth - 20) {
      left = window.innerWidth - popoverWidth / 2 - 20;
    }

    setActiveMilestone({
      task: goal,
      milestone,
      position: { top, left, placeAbove },
    });
  };

  const handleMilestoneMouseEnter = (
    e: React.MouseEvent,
    text: string
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredMilestone({
      text,
      x: rect.left + rect.width / 2,
      y: rect.top - 6,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Zoom Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white">
            Financial Roadmap
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Visual progress and scheduled timeline for your financial goals.
          </p>
        </div>

        {/* Zoom Selector */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700/60 self-start sm:self-center text-xs font-semibold">
          {(['months', 'quarters', 'years'] as GanttZoomLevel[]).map((z) => (
            <button
              key={z}
              type="button"
              onClick={() => setZoomLevel(z)}
              className={`px-3.5 py-1.5 rounded-xl capitalize transition ${
                zoomLevel === z
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
              }`}
            >
              {z}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI Strip */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Overall Progress</span>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
                {summary.overallProgressPercent}%
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">Across {summary.totalGoals} goals</span>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Capital Saved</span>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {!balancesVisible ? '••••••' : formatMoney(summary.totalSavedAmount)}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                Target: {formatMoney(summary.totalTargetAmount)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Active Plans</span>
              <div className="text-2xl font-bold text-navy-900 dark:text-white mt-1">
                {summary.activeGoalsCount}
              </div>
              <span className="text-[11px] text-slate-400 mt-0.5 block">
                {summary.completedGoalsCount} fulfilled
              </span>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
              <Target className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Minimalist Roadmap Workspace (Section 4.A & 4.B) */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {/* Timeline Header Scale */}
        <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 py-3 px-5 text-xs font-semibold text-slate-500">
          <div className="col-span-5 sm:col-span-4">Goal</div>
          <div className="col-span-7 sm:col-span-8 flex justify-between pr-2">
            {timelineIntervals.map((item, idx) => (
              <span key={idx} className="text-center flex-1 text-[11px] font-medium text-slate-400">
                {item.label}
              </span>
            ))}
          </div>
        </div>

        {/* Scalable Goal Rows */}
        <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
          {tasks.map((goal, index) => {
            const isExpanded = !!expandedNodes[goal.id];
            const palette = GOAL_PALETTE[index % GOAL_PALETTE.length];
            const { left, width } = getTimelinePosition(goal.startDate, goal.endDate);
            const subtasks = goal.children || [];
            const milestoneChildren = subtasks.filter((s) => s.isMilestone);

            return (
              <React.Fragment key={goal.id}>
                {/* Goal Row */}
                <div
                  className="grid grid-cols-12 items-center py-4 px-5 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition cursor-pointer"
                  onClick={() => setSelectedGoal(goal)}
                >
                  {/* Left Column: Name & Compact Progress Indicator */}
                  <div className="col-span-5 sm:col-span-4 flex items-center gap-2 pr-3">
                    {subtasks.length > 0 ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleExpand(goal.id);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-navy-900 dark:hover:text-white"
                        aria-label="Toggle subtasks"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : (
                      <div className="w-5" />
                    )}

                    <div className="truncate">
                      <div className="font-bold text-navy-900 dark:text-white truncate">
                        {goal.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        <span className="font-semibold" style={{ color: palette.bar }}>
                          {goal.percentDone}%
                        </span>
                        {' • '}
                        {!balancesVisible ? '••••••' : `${formatMoney(goal.currentAmount)} / ${formatMoney(goal.targetAmount)}`}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Clean Coloured Horizontal Bar & Milestone Markers (No text inside bars!) */}
                  <div className="col-span-7 sm:col-span-8 relative h-10 flex items-center">
                    {/* Background Scheduled Duration Track */}
                    <div
                      className="absolute h-3 rounded-full overflow-hidden shadow-2xs"
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        backgroundColor: palette.track,
                      }}
                    >
                      {/* Coloured Progress Fill Shape (NO text inside!) */}
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${goal.percentDone}%`,
                          backgroundColor: palette.bar,
                        }}
                      />
                    </div>

                    {/* Circular Milestone Markers along the track (Section 4.C) */}
                    {milestoneChildren.map((m, mIdx) => {
                      const mPos = getTimelinePosition(m.startDate, m.endDate);
                      const isReached = m.percentDone >= 100;

                      return (
                        <button
                          key={m.id || mIdx}
                          type="button"
                          onClick={(e) =>
                            handleMilestoneClick(e, goal, {
                              name: m.name,
                              percentage: m.percentDone,
                              targetAmount: m.targetAmount || goal.targetAmount,
                              targetDate: m.endDate,
                              currentProgress: goal.percentDone,
                              isReached,
                            })
                          }
                          onMouseEnter={(e) =>
                            handleMilestoneMouseEnter(
                              e,
                              `${m.name} (${m.percentDone}%)`
                            )
                          }
                          onMouseLeave={() => setHoveredMilestone(null)}
                          className="absolute -translate-x-1/2 w-4 h-4 rounded-full border-2 bg-white dark:bg-slate-900 shadow-md transition-transform hover:scale-125 focus:scale-125 z-10"
                          style={{
                            left: `${mPos.left}%`,
                            borderColor: palette.bar,
                            backgroundColor: isReached ? palette.bar : 'white',
                          }}
                          aria-label={`Milestone: ${m.name}`}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* Subtask Phases (Collapsible / Expandable) */}
                {isExpanded &&
                  subtasks.map((sub) => {
                    const subPos = getTimelinePosition(sub.startDate, sub.endDate);

                    return (
                      <div
                        key={sub.id}
                        className="grid grid-cols-12 items-center py-2.5 px-5 pl-12 bg-slate-50/40 dark:bg-slate-800/20 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer"
                        onClick={() => setSelectedGoal(sub)}
                      >
                        <div className="col-span-5 sm:col-span-4 flex items-center gap-2 truncate">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: palette.bar }}
                          />
                          <span className="text-slate-600 dark:text-slate-300 font-medium truncate">
                            {sub.name}
                          </span>
                        </div>

                        <div className="col-span-7 sm:col-span-8 relative h-6 flex items-center">
                          <div
                            className="absolute h-1.5 rounded-full"
                            style={{
                              left: `${subPos.left}%`,
                              width: `${subPos.width}%`,
                              backgroundColor: palette.track,
                            }}
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${sub.percentDone}%`,
                                backgroundColor: palette.bar,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Floating Hover Tooltip (Section 4.C) */}
      {hoveredMilestone && (
        <div
          className="fixed pointer-events-none z-50 -translate-x-1/2 -translate-y-full px-2.5 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold shadow-lg border border-slate-700 whitespace-nowrap animate-fadeIn"
          style={{ left: hoveredMilestone.x, top: hoveredMilestone.y }}
        >
          {hoveredMilestone.text}
        </div>
      )}

      {/* Intelligent Non-Overlapping Milestone Popover (Section 4.D) */}
      {activeMilestone && (
        <>
          {/* Backdrop on mobile or click-outside */}
          <div
            className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent"
            onClick={() => setActiveMilestone(null)}
          />

          {/* Desktop: Clamped, collision-checked popover; Mobile: Bottom sheet */}
          <div
            className="fixed z-50 w-full sm:w-64 bg-white dark:bg-slate-900 rounded-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-4 space-y-2 text-xs animate-fadeIn bottom-0 sm:bottom-auto left-0 sm:left-auto"
            style={
              window.innerWidth >= 640
                ? {
                    top: activeMilestone.position.top,
                    left: activeMilestone.position.left,
                    transform: activeMilestone.position.placeAbove
                      ? 'translate(-50%, -100%)'
                      : 'translate(-50%, 0)',
                  }
                : {}
            }
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
              <span className="font-bold text-navy-900 dark:text-white truncate">
                {activeMilestone.milestone.name}
              </span>
              <button
                type="button"
                onClick={() => setActiveMilestone(null)}
                className="text-slate-400 hover:text-navy-900 dark:hover:text-white p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1.5 text-slate-600 dark:text-slate-300">
              <div className="flex justify-between">
                <span className="text-slate-400">Target Date:</span>
                <span className="font-semibold text-navy-900 dark:text-white">
                  {new Date(activeMilestone.milestone.targetDate || Date.now()).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target Amount:</span>
                <span className="font-semibold text-navy-900 dark:text-white">
                  {formatMoney(activeMilestone.milestone.targetAmount)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Goal Progress:</span>
                <span className="font-bold text-purple-600 dark:text-purple-400">
                  {activeMilestone.milestone.currentProgress}%
                </span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-slate-400">Status:</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    activeMilestone.milestone.isReached
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {activeMilestone.milestone.isReached ? 'Completed' : 'In Progress'}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Goal Details Drawer / Modal (Section 4.F) */}
      {selectedGoal && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-navy-900 dark:text-white">Goal Details</h3>
              <button
                type="button"
                onClick={() => setSelectedGoal(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-navy-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Goal Name</span>
                <span className="font-bold text-navy-900 dark:text-white">{selectedGoal.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Capital Saved</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">
                  {formatMoney(selectedGoal.currentAmount)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Target Amount</span>
                <span className="font-bold text-navy-900 dark:text-white">
                  {formatMoney(selectedGoal.targetAmount)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Progress</span>
                <span className="font-bold text-purple-600 dark:text-purple-400">
                  {selectedGoal.percentDone}%
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Target Deadline</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {new Date(selectedGoal.endDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              {selectedGoal.notes && (
                <div className="py-1">
                  <span className="text-slate-400 block mb-0.5">Notes</span>
                  <span className="text-slate-700 dark:text-slate-300">{selectedGoal.notes}</span>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedGoal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
