import React, { useState, useEffect, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  Building2,
  Calendar,
} from 'lucide-react';
import { apiRequest } from '../lib/api';
import { useAuth } from '../context/AuthContext';

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
  const { balancesVisible, formatMoney } = useAuth();
  const [resources, setResources] = useState<SchedulerResource[]>([]);
  const [events, setEvents] = useState<SchedulerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<SchedulerEvent | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<SchedulerEvent | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

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
        console.error('Failed to load commitments dataset:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchScheduler();
  }, []);

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

  const handleMouseEnter = (ev: SchedulerEvent, e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
    setHoveredEvent(ev);
  };

  const handleMouseLeave = () => {
    setHoveredEvent(null);
    setTooltipPos(null);
  };

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-navy-900 dark:text-white">
            Recurring Commitment Timeline
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {events.length} commitments mapped across resource categories
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <button
            type="button"
            onClick={() => {
              const d = new Date(currentDate);
              d.setMonth(d.getMonth() - 1);
              setCurrentDate(d);
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
            aria-label="Previous Month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="font-bold text-xs sm:text-sm text-navy-900 dark:text-white min-w-[130px] text-center">
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
          <button
            type="button"
            onClick={() => {
              const d = new Date(currentDate);
              d.setMonth(d.getMonth() + 1);
              setCurrentDate(d);
            }}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition"
            aria-label="Next Month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Collision-Free Multi-Resource Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-x-auto">
        <div className="min-w-[900px]">
          {/* Day Header Row */}
          <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-500 py-2.5 px-4">
            <div className="col-span-3 text-xs font-bold text-slate-700 dark:text-slate-300">
              Category Lane
            </div>
            <div className="col-span-9 flex justify-between pr-2">
              {daysInMonth.map((d) => {
                const isToday =
                  d.getDate() === new Date().getDate() &&
                  d.getMonth() === new Date().getMonth() &&
                  d.getFullYear() === new Date().getFullYear();

                return (
                  <span
                    key={d.getDate()}
                    className={`text-center flex-1 text-[10px] ${
                      isToday
                        ? 'text-blue-600 dark:text-blue-400 font-extrabold bg-blue-50 dark:bg-blue-950/60 rounded'
                        : 'text-slate-400'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Resource Lane Rows */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {resources.map((res) => {
              const resEvents = events.filter((ev) => {
                if (ev.resourceId !== res.id) return false;
                const d = new Date(ev.startDate);
                return (
                  d.getFullYear() === currentDate.getFullYear() &&
                  d.getMonth() === currentDate.getMonth()
                );
              });

              // Group events by day to avoid collisions
              const dayGroups = new Map<number, SchedulerEvent[]>();
              resEvents.forEach((ev) => {
                const day = new Date(ev.startDate).getDate();
                if (!dayGroups.has(day)) dayGroups.set(day, []);
                dayGroups.get(day)!.push(ev);
              });

              return (
                <div
                  key={res.id}
                  className="grid grid-cols-12 items-center py-3.5 px-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                >
                  {/* Lane Info */}
                  <div className="col-span-3 pr-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: res.eventColor }}
                      />
                      <span className="font-bold text-navy-900 dark:text-white truncate">
                        {res.name}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 ml-4.5 block truncate">
                      {res.category}
                    </span>
                  </div>

                  {/* Lane Track */}
                  <div className="col-span-9 relative h-11 flex items-center bg-slate-50/30 dark:bg-slate-900/40 rounded-xl px-1">
                    {resEvents.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic pl-3">
                        No obligations scheduled
                      </span>
                    ) : (
                      Array.from(dayGroups.entries()).map(([dayNum, dayEvs]) => {
                        const totalDays = daysInMonth.length;
                        const leftPct = ((dayNum - 1) / totalDays) * 100;
                        const primary = dayEvs[0];
                        const totalAmount = dayEvs.reduce((s, e) => s + (e.amount || 0), 0);

                        return (
                          <div
                            key={dayNum}
                            className="absolute -translate-x-1/2 z-10"
                            style={{
                              left: `${Math.max(3, Math.min(96, leftPct))}%`,
                            }}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedEvent(primary)}
                              onMouseEnter={(e) => handleMouseEnter(primary, e)}
                              onMouseLeave={handleMouseLeave}
                              className="px-2 py-1 rounded-lg border text-[10px] font-bold shadow-xs whitespace-nowrap transition-transform hover:scale-110 flex items-center gap-1 active:scale-95"
                              style={{
                                backgroundColor: `${res.eventColor}18`,
                                borderColor: res.eventColor,
                                color: res.eventColor,
                              }}
                            >
                              <span>{dayEvs.length > 1 ? `${formatMoney(totalAmount)} (${dayEvs.length})` : formatMoney(primary.amount)}</span>
                            </button>
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

      {/* Floating Hover Tooltip (Positioned above marker without collision) */}
      {hoveredEvent && tooltipPos && (
        <div
          className="fixed pointer-events-none z-50 -translate-x-1/2 -translate-y-full px-3 py-2 rounded-xl bg-slate-900 text-white text-xs shadow-xl border border-slate-700 space-y-0.5 animate-fadeIn"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="font-bold">{hoveredEvent.counterparty || hoveredEvent.name}</div>
          <div className="text-[11px] text-slate-300">
            Due: {new Date(hoveredEvent.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • Amount: {formatMoney(hoveredEvent.amount)}
          </div>
        </div>
      )}

      {/* C. Event Details Modal on Click */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-navy-900 dark:text-white">
                Commitment Details
              </h3>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-navy-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Payee / Merchant</span>
                <span className="font-bold text-navy-900 dark:text-white">
                  {selectedEvent.counterparty || selectedEvent.name}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Amount</span>
                <span className="font-bold text-navy-900 dark:text-white">
                  {formatMoney(selectedEvent.amount)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Due Date</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {new Date(selectedEvent.startDate).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Category</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {selectedEvent.category}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Frequency</span>
                <span className="capitalize text-slate-700 dark:text-slate-300">
                  {selectedEvent.frequency || 'Monthly'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-400">Payment Status</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                  {selectedEvent.status || 'Active'}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
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
