import React, { useEffect, useState, useMemo } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Plus,
  Clock,
  CheckCircle2,
  Edit3,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Filter,
  Search,
  Tag,
  X,
  ExternalLink,
  RefreshCw,
  ShoppingCart,
  Truck,
  Layers,
  Calendar as CalendarIcon,
} from 'lucide-react';
import { apiRequest, formatInr, formatDateShort } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';
import { pageActionDispatcher } from '../lib/pageActionDispatcher';

export type CalendarViewMode = 'timeline' | 'month' | 'week' | 'agenda' | 'cashflow';

interface BryntumEvent {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  resourceId: string;
  eventType: string;
  amount: number;
  currency: string;
  status: string;
  direction: 'incoming' | 'outgoing';
  isCompleted: boolean;
  isOverdue?: boolean;
  eventColor: string;
  counterparty?: string;
  paymentMethod?: string;
  linkedMandateId?: string;
  linkedGoalId?: string;
  linkedTransactionId?: string;
  linkedOrderId?: string;
  notes?: string;
}

export const FinancialCalendarPage: React.FC = () => {
  const { balancesVisible } = useAuth();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('timeline');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [resources, setResources] = useState<any[]>([]);
  const [events, setEvents] = useState<BryntumEvent[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [loading, setLoading] = useState(false);

  // Selected date for Monthly Overview drilldown
  const [selectedDateDetails, setSelectedDateDetails] = useState<Date | null>(() => new Date());

  // Event Inspection Modal / Drawer
  const [inspectingEvent, setInspectingEvent] = useState<BryntumEvent | null>(null);

  // Reschedule state
  const [editingEvent, setEditingEvent] = useState<BryntumEvent | null>(null);
  const [newEventDate, setNewEventDate] = useState('');
  const [syncNotice, setSyncNotice] = useState('');
  const [rescheduleError, setRescheduleError] = useState('');

  // Add reminder state
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('reminder');
  const [newStartDate, setNewStartDate] = useState('');
  const [newAmount, setNewAmount] = useState('');

  const loadCalendar = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/calendar');
      setResources(res.resources || []);
      setEvents(res.events || []);
      setSummary(res.summary || null);
      pageActionDispatcher.setPageReady('calendar', true);
    } catch (err) {
      console.error('Failed to load calendar dataset:', err);
      pageActionDispatcher.setPageReady('calendar', true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCalendar();

    const unregister = pageActionDispatcher.registerPage('calendar', {
      executeAction: async (actionType: string) => {
        if (actionType === 'REFRESH_CALENDAR') {
          await loadCalendar();
          return true;
        }
        return false;
      },
      isReady: () => !loading,
    });

    return () => {
      unregister();
      pageActionDispatcher.setPageReady('calendar', false);
    };
  }, []);

  // Filtered Events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Direction
      if (directionFilter !== 'all' && ev.direction !== directionFilter) {
        return false;
      }
      // Category
      if (selectedCategory !== 'all' && ev.eventType !== selectedCategory && ev.resourceId !== selectedCategory) {
        return false;
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = ev.name.toLowerCase().includes(q);
        const matchesNotes = ev.notes?.toLowerCase().includes(q);
        const matchesCounterparty = ev.counterparty?.toLowerCase().includes(q);
        if (!matchesName && !matchesNotes && !matchesCounterparty) return false;
      }
      return true;
    });
  }, [events, selectedCategory, directionFilter, searchQuery]);

  // Selected Date Events for drilldown
  const selectedDateEvents = useMemo(() => {
    if (!selectedDateDetails) return [];
    const yr = selectedDateDetails.getFullYear();
    const mo = selectedDateDetails.getMonth();
    const dt = selectedDateDetails.getDate();

    return filteredEvents.filter((ev) => {
      const d = new Date(ev.startDate);
      return d.getFullYear() === yr && d.getMonth() === mo && d.getDate() === dt;
    });
  }, [selectedDateDetails, filteredEvents]);

  // Compact Month grid cells
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const startOffset = firstDayOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: { date: Date; inMonth: boolean; dayNumber: number; dayEvents: BryntumEvent[] }[] = [];
    for (let i = 0; i < startOffset; i++) {
      const d = new Date(year, month, -startOffset + i + 1);
      cells.push({ date: d, inMonth: false, dayNumber: d.getDate(), dayEvents: [] });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const dayEvents = filteredEvents.filter((ev) => {
        const ed = new Date(ev.startDate);
        return ed.getFullYear() === year && ed.getMonth() === month && ed.getDate() === day;
      });
      cells.push({ date: d, inMonth: true, dayNumber: day, dayEvents });
    }
    return cells;
  }, [currentDate, filteredEvents]);

  // Week days
  const weekDays = useMemo(() => {
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dayEvents = filteredEvents.filter((ev) => {
        const ed = new Date(ev.startDate);
        return (
          ed.getFullYear() === d.getFullYear() &&
          ed.getMonth() === d.getMonth() &&
          ed.getDate() === d.getDate()
        );
      });
      days.push({ date: d, dayEvents });
    }
    return days;
  }, [currentDate, filteredEvents]);

  // Chronologically sorted events for Timeline & Agenda
  const sortedEvents = useMemo(() => {
    return [...filteredEvents].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  }, [filteredEvents]);

  // Grouped by date for Agenda view
  const groupedAgendaEvents = useMemo(() => {
    const map = new Map<string, BryntumEvent[]>();
    for (const ev of sortedEvents) {
      const dateKey = new Date(ev.startDate).toDateString();
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(ev);
    }
    return Array.from(map.entries()).map(([dateStr, items]) => ({
      dateStr,
      date: new Date(items[0].startDate),
      items,
    }));
  }, [sortedEvents]);

  // Reschedule submission with immutable check
  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !newEventDate) return;

    if (editingEvent.isCompleted || editingEvent.status === 'completed' || editingEvent.linkedTransactionId) {
      setRescheduleError('Completed payments cannot be rescheduled. Only scheduled commitments may be adjusted.');
      return;
    }

    setRescheduleError('');
    try {
      const res = await apiRequest(`/calendar/events/${editingEvent.id}/reschedule`, {
        method: 'PATCH',
        body: JSON.stringify({ newStartDate: newEventDate }),
      });
      setSyncNotice(res.message || 'Calendar event and linked recurring mandate updated consistently.');
      setEditingEvent(null);
      await loadCalendar();
    } catch (err: any) {
      setRescheduleError(err?.message || 'Failed to reschedule commitment.');
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newStartDate) return;
    await apiRequest('/calendar/events', {
      method: 'POST',
      body: JSON.stringify({
        title: newTitle,
        eventType: newType,
        startDate: newStartDate,
        amount: newAmount ? Number(newAmount) : undefined,
      }),
    });
    setNewTitle('');
    setNewStartDate('');
    setNewAmount('');
    await loadCalendar();
  };

  return (
    <div className="space-y-6">
      {/* Workspace Header & Views */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-colors">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-navy-900 dark:text-white">
            Financial Calendar
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track upcoming bills, scheduled payments, and cash flow.
          </p>
        </div>

        {/* View Mode Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700/60">
            {(
              [
                { mode: 'timeline', label: 'Timeline' },
                { mode: 'month', label: 'Month' },
                { mode: 'week', label: 'Week' },
                { mode: 'agenda', label: 'Agenda' },
                { mode: 'cashflow', label: 'Cash Flow' },
              ] as { mode: CalendarViewMode; label: string }[]
            ).map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  viewMode === mode
                    ? 'bg-white dark:bg-slate-700 text-navy-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Highlights Bar */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Upcoming 14 Days</span>
              <div className="text-lg font-bold text-navy-900 dark:text-white mt-0.5">
                {summary.upcoming14DaysCount} commitments
              </div>
              <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 mt-0.5">
                -${summary.upcoming14DaysTotalAmount?.toLocaleString('en-US') || 0}
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Projected Inflow</span>
              <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                +${summary.cashFlow?.projectedIncome?.toLocaleString('en-US') || 0}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Salary &amp; Credits</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Net Projected Cashflow</span>
              <div
                className={`text-lg font-bold mt-0.5 ${
                  (summary.cashFlow?.netProjectedCashFlow || 0) >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {(summary.cashFlow?.netProjectedCashFlow || 0) >= 0 ? '+' : ''}$
                {summary.cashFlow?.netProjectedCashFlow?.toLocaleString('en-US') || 0}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">Current Planning Cycle</div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Overdue / Action Needed</span>
              <div
                className={`text-lg font-bold mt-0.5 ${
                  summary.overdueCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                }`}
              >
                {summary.overdueCount} {summary.overdueCount === 1 ? 'item' : 'items'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                {summary.overdueCount > 0
                  ? `$${summary.overdueTotalAmount?.toLocaleString('en-US')} outstanding`
                  : 'All payments on schedule'}
              </div>
            </div>
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                summary.overdueCount > 0
                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
        </div>
      )}

      {/* Sync Notices / Errors */}
      {syncNotice && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            {syncNotice}
          </span>
          <button onClick={() => setSyncNotice('')} className="text-xs font-semibold hover:underline">
            OK
          </button>
        </div>
      )}
      {rescheduleError && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-800 dark:text-rose-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            {rescheduleError}
          </span>
          <button onClick={() => setRescheduleError('')} className="text-xs font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Navigation, Search & Filter Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Date Range Navigation */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const d = new Date(currentDate);
                if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
                else if (viewMode === 'week') d.setDate(d.getDate() - 7);
                else d.setMonth(d.getMonth() - 1);
                setCurrentDate(d);
              }}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-navy-900 dark:text-white min-w-[160px] text-center">
              {currentDate.toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
                ...(viewMode === 'week' ? { day: 'numeric' } : {}),
              })}
            </h3>
            <button
              onClick={() => {
                const d = new Date(currentDate);
                if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
                else if (viewMode === 'week') d.setDate(d.getDate() + 7);
                else d.setMonth(d.getMonth() + 1);
                setCurrentDate(d);
              }}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              Today
            </button>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[220px] flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search commitments, bills, PayPal..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Direction Filter */}
          <div className="flex items-center gap-1 text-xs">
            <button
              onClick={() => setDirectionFilter('all')}
              className={`px-2.5 py-1 rounded-lg transition ${
                directionFilter === 'all'
                  ? 'bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-navy-900'
              }`}
            >
              All Flows
            </button>
            <button
              onClick={() => setDirectionFilter('incoming')}
              className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                directionFilter === 'incoming'
                  ? 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-emerald-600'
              }`}
            >
              <ArrowDownLeft className="w-3 h-3" /> Inflow
            </button>
            <button
              onClick={() => setDirectionFilter('outgoing')}
              className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                directionFilter === 'outgoing'
                  ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-rose-600'
              }`}
            >
              <ArrowUpRight className="w-3 h-3" /> Outflow
            </button>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none text-xs">
          <span className="font-semibold text-slate-400 shrink-0 text-[11px] uppercase tracking-wider">
            Category:
          </span>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-2.5 py-1 rounded-lg shrink-0 transition text-xs ${
              selectedCategory === 'all'
                ? 'bg-navy-900 dark:bg-white text-white dark:text-navy-900 font-bold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
            }`}
          >
            All Categories ({events.length})
          </button>
          {resources.map((res) => {
            const count = events.filter((e) => e.eventType === res.id || e.resourceId === res.id).length;
            return (
              <button
                key={res.id}
                onClick={() => setSelectedCategory(res.id)}
                className={`px-2.5 py-1 rounded-lg shrink-0 transition flex items-center gap-1.5 text-xs ${
                  selectedCategory === res.id
                    ? 'font-bold text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                style={
                  selectedCategory === res.id
                    ? { backgroundColor: res.eventColor || '#7c3aed' }
                    : undefined
                }
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: res.eventColor || '#7c3aed' }}
                />
                {res.name}
                {count > 0 && <span className="opacity-75 text-[10px]">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* VIEW MODES */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        {/* 1. FINANCIAL TIMELINE VIEW (PRIMARY RECOMMENDED) */}
        {viewMode === 'timeline' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h4 className="text-sm font-bold text-navy-900 dark:text-white">
                  Timeline
                </h4>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {sortedEvents.length} scheduled events
              </span>
            </div>

            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
              {sortedEvents.map((ev) => {
                const isIncoming = ev.direction === 'incoming';
                const isOverdue = ev.isOverdue;
                const isCompleted = ev.isCompleted;

                return (
                  <div
                    key={ev.id}
                    onClick={() => setInspectingEvent(ev)}
                    className="group relative flex items-start justify-between gap-4 p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/60 hover:border-purple-400 dark:hover:border-purple-600 transition cursor-pointer"
                  >
                    {/* Timeline Node Dot */}
                    <div
                      className="absolute -left-6.5 top-4 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 shadow-xs flex items-center justify-center shrink-0"
                      style={{ backgroundColor: ev.eventColor || '#7c3aed' }}
                    >
                      {isCompleted && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-navy-900 dark:text-white group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                          {ev.name}
                        </span>

                        {isCompleted ? (
                          <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            Completed / Settled
                          </span>
                        ) : isOverdue ? (
                          <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                            Overdue Commitment
                          </span>
                        ) : (
                          <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20">
                            Scheduled
                          </span>
                        )}

                        {ev.paymentMethod === 'paypal' && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                            PayPal
                          </span>
                        )}
                        {ev.eventType === 'commerce_delivery' && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 flex items-center gap-1">
                            <Truck className="w-3 h-3" /> Delivery
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3">
                        <span className="font-medium">
                          {formatDateShort(ev.startDate)}
                        </span>
                        {ev.counterparty && (
                          <span>• Merchant: {ev.counterparty}</span>
                        )}
                        {ev.notes && (
                          <span className="text-slate-400">• {ev.notes}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {ev.amount > 0 && (
                        <div className="text-right">
                          <div
                            className={`text-sm font-extrabold ${
                              isIncoming
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-navy-900 dark:text-white'
                            }`}
                          >
                            {isIncoming ? '+' : '-'}${ev.amount.toLocaleString('en-US')}
                          </div>
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                            {ev.currency || 'USD'}
                          </span>
                        </div>
                      )}

                      {!isCompleted && !ev.linkedTransactionId && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingEvent(ev);
                            setNewEventDate(new Date(ev.startDate).toISOString().split('T')[0]);
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-700 text-slate-500 hover:text-purple-600 transition"
                          title="Reschedule this commitment"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 2. COMPACT MONTHLY OVERVIEW WITH DATE DRILLDOWN */}
        {viewMode === 'month' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Month Grid (Compact, not oversized) */}
            <div className="lg:col-span-8 space-y-3">
              <div className="grid grid-cols-7 gap-1 text-center font-bold text-[11px] text-slate-400 uppercase tracking-wider pb-2 border-b border-slate-100 dark:border-slate-800">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {monthDays.map((cell, idx) => {
                  const isSelected =
                    selectedDateDetails &&
                    selectedDateDetails.getFullYear() === cell.date.getFullYear() &&
                    selectedDateDetails.getMonth() === cell.date.getMonth() &&
                    selectedDateDetails.getDate() === cell.date.getDate();

                  const isToday =
                    new Date().toDateString() === cell.date.toDateString();

                  const dayIncoming = cell.dayEvents
                    .filter((e) => e.direction === 'incoming')
                    .reduce((sum, e) => sum + e.amount, 0);

                  const dayOutgoing = cell.dayEvents
                    .filter((e) => e.direction === 'outgoing')
                    .reduce((sum, e) => sum + e.amount, 0);

                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedDateDetails(cell.date)}
                      className={`min-h-[72px] p-2 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                        !cell.inMonth
                          ? 'opacity-30 bg-slate-50/30 dark:bg-slate-900/30 border-transparent'
                          : isSelected
                          ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-500 shadow-xs'
                          : isToday
                          ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-400'
                          : 'bg-white dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:border-purple-300'
                      }`}
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={`font-semibold ${
                            isSelected
                              ? 'text-purple-600 dark:text-purple-400 font-bold'
                              : isToday
                              ? 'text-blue-600 dark:text-blue-400 font-bold'
                              : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {cell.dayNumber}
                        </span>

                        {cell.dayEvents.length > 0 && (
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                        )}
                      </div>

                      {/* Mini Daily Totals */}
                      <div className="space-y-0.5 text-[10px]">
                        {dayIncoming > 0 && (
                          <div className="text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                            +${dayIncoming}
                          </div>
                        )}
                        {dayOutgoing > 0 && (
                          <div className="text-rose-600 dark:text-rose-400 font-semibold truncate">
                            -${dayOutgoing}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right Date Drill-down Drawer */}
            <div className="lg:col-span-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
                  <div>
                    <span className="text-[11px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
                      Date Inspection
                    </span>
                    <h4 className="text-sm font-bold text-navy-900 dark:text-white mt-0.5">
                      {selectedDateDetails?.toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </h4>
                  </div>
                  <span className="text-xs font-semibold text-slate-400">
                    {selectedDateEvents.length} events
                  </span>
                </div>

                <div className="mt-4 space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                  {selectedDateEvents.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      No commitments or transactions scheduled on this day.
                    </div>
                  ) : (
                    selectedDateEvents.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => setInspectingEvent(ev)}
                        className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-purple-400 transition cursor-pointer space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-navy-900 dark:text-white">
                            {ev.name}
                          </span>
                          <span
                            className="text-xs font-bold"
                            style={{
                              color: ev.direction === 'incoming' ? '#10b981' : '#ef4444',
                            }}
                          >
                            {ev.direction === 'incoming' ? '+' : '-'}${ev.amount}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center justify-between">
                          <span>{ev.counterparty || ev.eventType}</span>
                          <span className="capitalize">{ev.status}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500">
                Click any calendar day to inspect scheduled commitments.
              </div>
            </div>
          </div>
        )}

        {/* 3. WEEKLY VIEW */}
        {viewMode === 'week' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {weekDays.map((day, idx) => (
                <div
                  key={idx}
                  className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-3 border border-slate-200 dark:border-slate-700 flex flex-col justify-between min-h-[220px]"
                >
                  <div className="border-b border-slate-200 dark:border-slate-700/60 pb-2 mb-2 text-center">
                    <div className="text-[11px] font-bold text-slate-400 uppercase">
                      {day.date.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div className="text-base font-extrabold text-navy-900 dark:text-white mt-0.5">
                      {day.date.getDate()}
                    </div>
                  </div>

                  <div className="flex-1 space-y-2 overflow-y-auto max-h-[160px]">
                    {day.dayEvents.length === 0 ? (
                      <span className="text-[11px] text-slate-400 block text-center pt-4">Clear</span>
                    ) : (
                      day.dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          onClick={() => setInspectingEvent(ev)}
                          className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] space-y-0.5 cursor-pointer hover:border-purple-400"
                        >
                          <div className="font-bold text-navy-900 dark:text-white truncate">
                            {ev.name}
                          </div>
                          <div className="flex justify-between text-slate-400">
                            <span>{ev.direction === 'incoming' ? 'Inflow' : 'Due'}</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              ${ev.amount}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. AGENDA VIEW */}
        {viewMode === 'agenda' && (
          <div className="space-y-6">
            {groupedAgendaEvents.map(({ dateStr, date, items }) => (
              <div key={dateStr} className="space-y-2">
                <div className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/50 dark:bg-slate-800/30 rounded-2xl border border-slate-200/80 dark:border-slate-700/60 overflow-hidden">
                  {items.map((ev) => (
                    <div
                      key={ev.id}
                      onClick={() => setInspectingEvent(ev)}
                      className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-white dark:hover:bg-slate-800 transition cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: ev.eventColor || '#7c3aed' }}
                        />
                        <div>
                          <div className="font-bold text-navy-900 dark:text-white text-sm">
                            {ev.name}
                          </div>
                          <div className="text-slate-500 dark:text-slate-400 text-xs">
                            {ev.counterparty ? `${ev.counterparty} • ` : ''}
                            {ev.notes || ev.eventType}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {ev.amount > 0 && (
                          <div className="text-right">
                            <span
                              className={`text-sm font-extrabold ${
                                ev.direction === 'incoming'
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-navy-900 dark:text-white'
                              }`}
                            >
                              {ev.direction === 'incoming' ? '+' : '-'}${ev.amount.toLocaleString('en-US')}
                            </span>
                          </div>
                        )}

                        {!ev.isCompleted && !ev.linkedTransactionId && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingEvent(ev);
                              setNewEventDate(new Date(ev.startDate).toISOString().split('T')[0]);
                            }}
                            className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" /> Reschedule
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 5. CASH FLOW VIEW */}
        {viewMode === 'cashflow' && summary?.cashFlow && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase">
                  Total Expected Inflow
                </span>
                <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                  +${summary.cashFlow.projectedIncome?.toLocaleString('en-US')}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Completed: +${summary.cashFlow.actualIncome?.toLocaleString('en-US')}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800">
                <span className="text-xs font-semibold text-rose-700 dark:text-rose-400 uppercase">
                  Total Scheduled Outflow
                </span>
                <div className="text-2xl font-extrabold text-rose-700 dark:text-rose-300 mt-1">
                  -${summary.cashFlow.projectedOutgoing?.toLocaleString('en-US')}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Settled: -${summary.cashFlow.actualOutgoing?.toLocaleString('en-US')}
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800">
                <span className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase">
                  Net Cash Position
                </span>
                <div className="text-2xl font-extrabold text-purple-700 dark:text-purple-300 mt-1">
                  {summary.cashFlow.netProjectedCashFlow >= 0 ? '+' : ''}$
                  {summary.cashFlow.netProjectedCashFlow?.toLocaleString('en-US')}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Actual Net: ${summary.cashFlow.netActualCashFlow?.toLocaleString('en-US')}
                </div>
              </div>
            </div>

            {/* Daily Cashflow Breakdown Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-500 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Incoming</th>
                    <th className="py-3 px-4">Outgoing</th>
                    <th className="py-3 px-4">Net Cashflow</th>
                    <th className="py-3 px-4 text-right">Transactions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {(summary.cashFlow.dailyCashFlow || []).map((row: any) => (
                    <tr key={row.date} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-4 font-bold text-navy-900 dark:text-white">
                        {row.date}
                      </td>
                      <td className="py-2.5 px-4 text-emerald-600 dark:text-emerald-400">
                        {row.incoming > 0 ? `+$${row.incoming.toLocaleString('en-US')}` : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-rose-600 dark:text-rose-400">
                        {row.outgoing > 0 ? `-$${row.outgoing.toLocaleString('en-US')}` : '—'}
                      </td>
                      <td
                        className={`py-2.5 px-4 font-bold ${
                          row.net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {row.net >= 0 ? '+' : ''}${row.net.toLocaleString('en-US')}
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-400">
                        {row.count} event{row.count > 1 ? 's' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Inspect Event Details Modal */}
      {inspectingEvent && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: inspectingEvent.eventColor }}
                />
                <h3 className="text-base font-bold text-navy-900 dark:text-white">
                  Event Details
                </h3>
              </div>
              <button
                onClick={() => setInspectingEvent(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Title</span>
                <span className="text-sm font-bold text-navy-900 dark:text-white">
                  {inspectingEvent.name}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 block text-[11px]">Due / Scheduled Date</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                    {formatDateShort(inspectingEvent.startDate)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Amount</span>
                  <span className="font-extrabold text-navy-900 dark:text-white text-sm">
                    ${inspectingEvent.amount.toLocaleString('en-US')} {inspectingEvent.currency}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-slate-400 block text-[11px]">Category</span>
                  <span className="capitalize font-medium text-slate-700 dark:text-slate-200">
                    {inspectingEvent.eventType.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[11px]">Status</span>
                  <span className="capitalize font-semibold text-purple-600 dark:text-purple-400">
                    {inspectingEvent.status}
                  </span>
                </div>
              </div>

              {inspectingEvent.counterparty && (
                <div>
                  <span className="text-slate-400 block text-[11px]">Merchant / Counterparty</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {inspectingEvent.counterparty}
                  </span>
                </div>
              )}

              {inspectingEvent.notes && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300">
                  {inspectingEvent.notes}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
              {!inspectingEvent.isCompleted && !inspectingEvent.linkedTransactionId && (
                <button
                  onClick={() => {
                    setEditingEvent(inspectingEvent);
                    setNewEventDate(new Date(inspectingEvent.startDate).toISOString().split('T')[0]);
                    setInspectingEvent(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition"
                >
                  Reschedule Commitment
                </button>
              )}
              <button
                onClick={() => setInspectingEvent(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bidirectional Due-Date Reschedule Drawer / Box */}
      {editingEvent && (
        <div className="bg-purple-50/80 dark:bg-purple-950/50 rounded-3xl p-5 border border-purple-200 dark:border-purple-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase">
              Reschedule Commitment
            </div>
            <div className="text-sm font-bold text-navy-900 dark:text-white mt-0.5">
              {editingEvent.name}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Update the scheduled date for this recurring commitment.
            </p>
          </div>
          <form onSubmit={handleRescheduleSubmit} className="flex items-center gap-2 shrink-0">
            <input
              type="date"
              value={newEventDate}
              onChange={(e) => setNewEventDate(e.target.value)}
              required
              className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shadow-xs transition"
            >
              Save Due Date
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingEvent(null);
                setRescheduleError('');
              }}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 shadow-xs"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Schedule Custom Financial Reminder / Commitment */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          Schedule Future Financial Reminder or Payment Commitment
        </h3>
        <form onSubmit={handleCreateEvent} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Commitment Title (e.g. AWS Server Invoice, Insurance Premium)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="reminder">Scheduled Reminder</option>
            <option value="bill">Utility / Household Bill</option>
            <option value="subscription">Subscription Renewal</option>
            <option value="loan_repayment">Loan / EMI Repayment</option>
            <option value="credit_card">Credit Card Due Date</option>
            <option value="milestone">Savings Milestone</option>
            <option value="planned_purchase">Planned Purchase</option>
          </select>
          <input
            type="date"
            value={newStartDate}
            onChange={(e) => setNewStartDate(e.target.value)}
            required
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount USD (optional)"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold shrink-0 inline-flex items-center gap-1 transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
