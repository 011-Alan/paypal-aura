import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Repeat,
  DollarSign,
  TrendingDown,
  Building2,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Truck,
  CreditCard,
  Home,
  Zap,
} from 'lucide-react';
import { apiRequest } from '../lib/api';

interface SchedulerResource {
  id: string;
  name: string;
  category: string;
  eventColor: string;
}

interface SchedulerEvent {
  id: string;
  resourceId: string;
  name: string;
  startDate: string;
  endDate: string;
  amount: number;
  frequency?: string;
  category: string;
  status: string;
  autoPay?: boolean;
  counterparty?: string;
}

export const FinancialSchedulerView: React.FC = () => {
  const [resources, setResources] = useState<SchedulerResource[]>([]);
  const [events, setEvents] = useState<SchedulerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedResourceId, setSelectedResourceId] = useState<string>('all');

  useEffect(() => {
    const fetchScheduler = async () => {
      setLoading(true);
      try {
        const res = await apiRequest<{
          success: boolean;
          resources: SchedulerResource[];
          events: SchedulerEvent[];
        }>('/calendar/scheduler-commitments');
        setResources(res.resources || []);
        setEvents(res.events || []);
      } catch (err) {
        console.error('Failed to load Bryntum Scheduler commitments dataset:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchScheduler();
  }, []);

  // Compute days in the current month view for the timeline grid
  const daysInMonth = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const count = new Date(year, month + 1, 0).getDate();
    const days: Date[] = [];
    for (let i = 1; i <= count; i++) {
      days.push(new Date(year, month, i));
    }
    return days;
  }, [currentDate]);

  // Filtered resources
  const activeResources = useMemo(() => {
    if (selectedResourceId === 'all') return resources;
    return resources.filter((r) => r.id === selectedResourceId);
  }, [resources, selectedResourceId]);

  return (
    <div className="space-y-6">
      {/* Header & Month Navigation */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 border border-purple-100 dark:border-purple-900/60 px-3 py-1 rounded-full">
              <Repeat className="w-3.5 h-3.5" />
              Bryntum Scheduler Multi-Resource Engine
            </span>
            <span className="text-xs text-slate-400">
              {events.length} Scheduled Commitments
            </span>
          </div>
          <h3 className="text-lg font-bold text-navy-900 dark:text-white mt-1.5">
            Recurring Commitments by Category &amp; Resource Lane
          </h3>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const d = new Date(currentDate);
              d.setMonth(d.getMonth() - 1);
              setCurrentDate(d);
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-sm text-navy-900 dark:text-white min-w-[130px] text-center">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => {
              const d = new Date(currentDate);
              d.setMonth(d.getMonth() + 1);
              setCurrentDate(d);
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Scheduler Multi-Resource Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-x-auto">
        <div className="min-w-[850px]">
          {/* Day Headers */}
          <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-500 py-2.5 px-4">
            <div className="col-span-3">Resource Category Lane</div>
            <div className="col-span-9 flex justify-between pr-2">
              {daysInMonth.map((d) => (
                <span
                  key={d.getDate()}
                  className={`text-center flex-1 text-[10px] ${
                    d.toDateString() === new Date().toDateString()
                      ? 'text-purple-600 font-extrabold'
                      : ''
                  }`}
                >
                  {d.getDate()}
                </span>
              ))}
            </div>
          </div>

          {/* Resource Rows */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {activeResources.map((res) => {
              // Find events belonging to this resource in the current displayed month
              const resEvents = events.filter((ev) => {
                if (ev.resourceId !== res.id) return false;
                const d = new Date(ev.startDate);
                return (
                  d.getFullYear() === currentDate.getFullYear() &&
                  d.getMonth() === currentDate.getMonth()
                );
              });

              return (
                <div
                  key={res.id}
                  className="grid grid-cols-12 items-center py-4 px-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                >
                  {/* Resource Lane Info */}
                  <div className="col-span-3 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: res.eventColor }}
                      />
                      <span className="font-bold text-navy-900 dark:text-white truncate">
                        {res.name}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 block ml-5">
                      {res.category}
                    </span>
                  </div>

                  {/* Resource Timeline Track */}
                  <div className="col-span-9 relative h-10 flex items-center bg-slate-50/30 dark:bg-slate-900/40 rounded-xl px-1">
                    {resEvents.length === 0 ? (
                      <span className="text-[10px] text-slate-400 italic pl-3">
                        No obligations due this month
                      </span>
                    ) : (
                      resEvents.map((ev) => {
                        const dayNum = new Date(ev.startDate).getDate();
                        const totalDays = daysInMonth.length;
                        const leftPct = ((dayNum - 1) / totalDays) * 100;

                        return (
                          <div
                            key={ev.id}
                            className="absolute -translate-x-1/2 px-2.5 py-1 rounded-lg border text-[11px] font-bold shadow-xs whitespace-nowrap cursor-pointer transition hover:scale-105 z-10"
                            style={{
                              left: `${Math.max(4, Math.min(94, leftPct))}%`,
                              backgroundColor: `${res.eventColor}20`,
                              borderColor: res.eventColor,
                              color: res.eventColor,
                            }}
                            title={`${ev.name} • ${ev.frequency || 'Monthly'} on Day ${dayNum}`}
                          >
                            <span className="text-white drop-shadow-xs font-semibold">
                              {ev.counterparty || ev.name} (${ev.amount})
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
