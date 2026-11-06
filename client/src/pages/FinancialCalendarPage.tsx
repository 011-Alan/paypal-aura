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
} from 'lucide-react';
import { apiRequest, formatInr, formatDateShort } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';

type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

export const FinancialCalendarPage: React.FC = () => {
  const { balancesVisible } = useAuth();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [resources, setResources] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [selectedResource, setSelectedResource] = useState<string>('all');

  // Reschedule state
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [newEventDate, setNewEventDate] = useState('');
  const [syncNotice, setSyncNotice] = useState('');

  // Add reminder state
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState('reminder');
  const [newStartDate, setNewStartDate] = useState('');
  const [newAmount, setNewAmount] = useState('');

  // AI calendar question
  const [aiAnswer, setAiAnswer] = useState('');
  const [askingAi, setAskingAi] = useState(false);

  const loadCalendar = async () => {
    const res = await apiRequest('/calendar');
    setResources(res.resources || []);
    setEvents(res.events || []);
    setSummary(res.summary || null);
  };

  useEffect(() => {
    loadCalendar();
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      if (selectedResource !== 'all' && ev.resourceId !== selectedResource && ev.eventType !== selectedResource) {
        return false;
      }
      return true;
    });
  }, [events, selectedResource]);

  // Month grid cells
  const monthDays = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDayOfMonth = new Date(year, month, 1);
    const startOffset = firstDayOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: { date: Date; inMonth: boolean; dayNumber: number; dayEvents: any[] }[] = [];
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

  const handleRescheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !newEventDate) return;
    const res = await apiRequest(`/calendar/events/${editingEvent.id}/reschedule`, {
      method: 'PATCH',
      body: JSON.stringify({ newStartDate: newEventDate }),
    });
    setSyncNotice(res.message || 'Calendar event and linked recurring mandate updated consistently.');
    setEditingEvent(null);
    await loadCalendar();
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

  const handleAskUpcoming = async () => {
    setAskingAi(true);
    try {
      const res = await apiRequest('/ai/ask', {
        method: 'POST',
        body: JSON.stringify({ prompt: 'What payments are coming up next week?' }),
      });
      setAiAnswer(res.explanation);
    } finally {
      setAskingAi(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & View Switcher */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 lg:p-8 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-colors">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900/60 px-3 py-1 rounded-full">
            <CalendarDays className="w-3.5 h-3.5" />
            Bryntum Financial Life Calendar Engine
          </span>
          <h2 className="text-xl font-bold text-navy-900 dark:text-white mt-2">
            Your Financial Commitments, Milestones &amp; Due Dates
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Automatically synchronised with confirmed recurring mandates, salary credits, and savings goal deadlines.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAskUpcoming}
            disabled={askingAi}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 text-xs font-semibold transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {askingAi ? 'Checking Calendar...' : 'Ask AURA: “What payments are coming up next week?”'}
          </button>

          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
            {(['month', 'week', 'day', 'agenda'] as CalendarViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                  viewMode === mode
                    ? 'bg-white dark:bg-slate-700 text-navy-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-navy-900 dark:hover:text-white'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      {aiAnswer && (
        <div className="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 text-xs sm:text-sm text-navy-900 dark:text-white flex items-start justify-between gap-4">
          <div>
            <div className="font-bold text-blue-700 dark:text-blue-300 mb-1 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" /> AURA Calendar Intelligence
            </div>
            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{aiAnswer}</p>
          </div>
          <button onClick={() => setAiAnswer('')} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            Dismiss
          </button>
        </div>
      )}

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

      {/* Calendar Navigation & Resource Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                const d = new Date(currentDate);
                if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
                else if (viewMode === 'week') d.setDate(d.getDate() - 7);
                else d.setDate(d.getDate() - 1);
                setCurrentDate(d);
              }}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-navy-900 dark:text-white min-w-[160px] text-center">
              {currentDate.toLocaleDateString('en-IN', {
                month: 'long',
                year: 'numeric',
                ...(viewMode === 'day' ? { day: 'numeric' } : {}),
              })}
            </h3>
            <button
              onClick={() => {
                const d = new Date(currentDate);
                if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
                else if (viewMode === 'week') d.setDate(d.getDate() + 7);
                else d.setDate(d.getDate() + 1);
                setCurrentDate(d);
              }}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Resource Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setSelectedResource('all')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition ${
                selectedResource === 'all'
                  ? 'bg-navy-900 dark:bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              All Events ({events.length})
            </button>
            {resources.slice(0, 6).map((res) => (
              <button
                key={res.id}
                onClick={() => setSelectedResource(res.id === selectedResource ? 'all' : res.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 transition ${
                  selectedResource === res.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: res.eventColor }} />
                {res.name}
              </button>
            ))}
          </div>
        </div>

        {/* MONTH VIEW */}
        {viewMode === 'month' && (
          <div>
            <div className="grid grid-cols-7 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 pb-2 border-b border-slate-200 dark:border-slate-800">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden mt-2">
              {monthDays.map((cell, idx) => (
                <div
                  key={idx}
                  className={`min-h-[108px] p-2 bg-white dark:bg-slate-900 flex flex-col justify-between ${
                    !cell.inMonth ? 'bg-slate-50/70 dark:bg-slate-950/60 text-slate-300 dark:text-slate-600' : ''
                  }`}
                >
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">{cell.dayNumber}</div>
                  <div className="space-y-1 mt-1">
                    {cell.dayEvents.map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => {
                          setEditingEvent(ev);
                          setNewEventDate(new Date(ev.startDate).toISOString().split('T')[0]);
                        }}
                        className="w-full text-left px-2 py-1 rounded-md text-[11px] font-medium text-white truncate transition hover:opacity-90"
                        style={{ backgroundColor: ev.eventColor || '#2563eb' }}
                        title={`${ev.name} — Click to reschedule`}
                      >
                        {ev.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WEEK VIEW */}
        {viewMode === 'week' && (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {weekDays.map((wd, i) => (
              <div key={i} className="p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 min-h-[200px]">
                <div className="text-xs font-bold text-navy-900 dark:text-white pb-2 border-b border-slate-200 dark:border-slate-700">
                  {wd.date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
                <div className="space-y-2 mt-2">
                  {wd.dayEvents.length === 0 ? (
                    <div className="text-[11px] text-slate-400 dark:text-slate-500">No events</div>
                  ) : (
                    wd.dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => {
                          setEditingEvent(ev);
                          setNewEventDate(new Date(ev.startDate).toISOString().split('T')[0]);
                        }}
                        className="p-2 rounded-lg text-xs text-white cursor-pointer"
                        style={{ backgroundColor: ev.eventColor || '#2563eb' }}
                      >
                        <div className="font-semibold">{ev.name}</div>
                        <div className="text-[10px] opacity-90">{ev.eventType}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DAY VIEW */}
        {viewMode === 'day' && (
          <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/40 space-y-3">
            <div className="text-sm font-bold text-navy-900 dark:text-white">
              Events for {formatDateShort(currentDate)}
            </div>
            {filteredEvents.filter((ev) => {
              const ed = new Date(ev.startDate);
              return (
                ed.getFullYear() === currentDate.getFullYear() &&
                ed.getMonth() === currentDate.getMonth() &&
                ed.getDate() === currentDate.getDate()
              );
            }).length === 0 ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 py-4">
                No financial commitments scheduled on this specific day. Switch to Month or Agenda view to inspect all upcoming dates.
              </div>
            ) : (
              filteredEvents
                .filter((ev) => {
                  const ed = new Date(ev.startDate);
                  return (
                    ed.getFullYear() === currentDate.getFullYear() &&
                    ed.getMonth() === currentDate.getMonth() &&
                    ed.getDate() === currentDate.getDate()
                  );
                })
                .map((ev) => (
                  <div
                    key={ev.id}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-bold text-navy-900 dark:text-white">{ev.name}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{ev.notes || ev.eventType}</div>
                    </div>
                    <div className="font-bold text-navy-900 dark:text-white">{formatInr(ev.amount, !balancesVisible)}</div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* AGENDA VIEW */}
        {viewMode === 'agenda' && (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredEvents.map((ev) => (
              <div key={ev.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: ev.eventColor || '#2563eb' }}
                  />
                  <div>
                    <div className="font-bold text-navy-900 dark:text-white">{ev.name}</div>
                    <div className="text-slate-500 dark:text-slate-400">
                      {formatDateShort(ev.startDate)} • {ev.notes || ev.eventType}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {ev.amount > 0 && <span className="font-bold text-navy-900 dark:text-white">{formatInr(ev.amount, !balancesVisible)}</span>}
                  <button
                    onClick={() => {
                      setEditingEvent(ev);
                      setNewEventDate(new Date(ev.startDate).toISOString().split('T')[0]);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium transition"
                  >
                    <Edit3 className="w-3 h-3" /> Reschedule
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bidirectional Due-Date Reschedule Modal / Drawer */}
      {editingEvent && (
        <div className="bg-blue-50/80 dark:bg-blue-950/50 rounded-3xl p-5 border border-blue-200 dark:border-blue-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase">
              Bidirectional Calendar &amp; Mandate Synchronisation
            </div>
            <div className="text-sm font-bold text-navy-900 dark:text-white mt-0.5">
              Reschedule: {editingEvent.name}
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Updating this confirmed due date automatically updates the linked Recurring Mandate and upcoming commitment reminders.
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
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
            >
              Save New Due Date
            </button>
            <button
              type="button"
              onClick={() => setEditingEvent(null)}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300 shadow-xs"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Schedule Custom Financial Reminder */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors">
        <h3 className="text-sm font-bold text-navy-900 dark:text-white flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          Schedule Financial Reminder or Milestone Event
        </h3>
        <form onSubmit={handleCreateEvent} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <input
            type="text"
            placeholder="Event Title (e.g. Tax Filing Deadline)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="reminder">Scheduled Reminder</option>
            <option value="commitment">Financial Commitment</option>
            <option value="milestone">Savings Milestone</option>
            <option value="education">Educational Fee</option>
          </select>
          <input
            type="date"
            value={newStartDate}
            onChange={(e) => setNewStartDate(e.target.value)}
            required
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount INR (optional)"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-navy-900 hover:bg-navy-800 dark:bg-blue-600 dark:hover:bg-blue-500 text-white text-xs font-semibold shrink-0 inline-flex items-center gap-1 transition shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
