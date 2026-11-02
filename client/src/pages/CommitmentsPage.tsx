import React, { useEffect, useState } from 'react';
import { Repeat, CheckCircle2, AlertCircle, Plus, Calendar, ShieldCheck } from 'lucide-react';
import { apiRequest, formatInr } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { Tooltip } from '../components/Tooltip';

export const CommitmentsPage: React.FC = () => {
  const { balancesVisible } = useAuth();
  const [mandates, setMandates] = useState<any[]>([]);
  const [confirmedTotal, setConfirmedTotal] = useState(0);
  const [title, setTitle] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('Subscription');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('5');
  const [submitting, setSubmitting] = useState(false);

  const loadMandates = async () => {
    const res = await apiRequest('/mandates');
    setMandates(res.mandates || []);
    setConfirmedTotal(res.confirmedMonthlyOutflow || 0);
  };

  useEffect(() => {
    loadMandates();
  }, []);

  const handleConfirmMandate = async (id: string) => {
    await apiRequest(`/mandates/${id}/confirm`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'confirmed' }),
    });
    await loadMandates();
  };

  const handleCreateMandate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !merchant || !amount) return;
    setSubmitting(true);
    try {
      await apiRequest('/mandates', {
        method: 'POST',
        body: JSON.stringify({
          title,
          merchant,
          category,
          amount: Number(amount),
          dueDayOfMonth: Number(dueDay || 5),
        }),
      });
      setTitle('');
      setMerchant('');
      setAmount('');
      await loadMandates();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 lg:p-8 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-navy-900 tracking-tight">Recurring Mandates &amp; Commitments</h2>
            <Tooltip content="Confirmed recurring payments like Rent, Insurance, Internet, and Loan EMIs detected from bank statements or entered manually." />
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Automated commitment intelligence synchronised with your Bryntum Financial Life Calendar.
          </p>
        </div>
        <div className="bg-blue-50 px-5 py-3 rounded-2xl border border-blue-100 text-right">
          <div className="text-[11px] font-semibold text-blue-700 uppercase flex items-center gap-1 justify-end">
            Confirmed Monthly Outflow
            <Tooltip content="Total sum of all recurring obligations due within each calendar cycle." />
          </div>
          <div className="text-2xl font-bold text-navy-900">
            {formatInr(confirmedTotal, !balancesVisible)}
          </div>
        </div>
      </div>

      {/* Mandates List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mandates.map((m) => (
          <div
            key={m._id}
            className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col justify-between gap-4 hover:border-slate-300 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                    {m.category}
                  </span>
                  {m.status === 'confirmed' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> Confirmed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertCircle className="w-3 h-3" /> Inferred ({Math.round(m.confidenceScore * 100)}% match)
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-navy-900 mt-2">{m.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Merchant: {m.merchant}</p>
                {m.notes && <p className="text-[11px] text-slate-500 mt-1">{m.notes}</p>}
              </div>
              <div className="text-right">
                <div className={`text-xl font-bold ${m.category === 'Salary' ? 'text-emerald-600' : 'text-navy-900'}`}>
                  {formatInr(m.amount, !balancesVisible)}
                </div>
                <div className="text-xs text-slate-500 flex items-center justify-end gap-1 mt-1">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  Due {m.dueDayOfMonth}th of month
                </div>
              </div>
            </div>

            {m.status === 'inferred' && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-amber-700 font-medium">
                  Confirm this recurring commitment to sync with calendar reminders?
                </span>
                <button
                  onClick={() => handleConfirmMandate(m._id)}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition"
                >
                  Confirm Mandate
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add New Mandate */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2">
          <Repeat className="w-4 h-4 text-blue-600" />
          Add Custom Recurring Commitment
        </h3>
        <form onSubmit={handleCreateMandate} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Commitment Title (e.g. Gym Membership)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            placeholder="Merchant Name"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            required
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="Rent">Rent</option>
            <option value="Loan EMI">Loan EMI</option>
            <option value="Insurance">Insurance</option>
            <option value="Subscription">Subscription</option>
            <option value="Electricity">Electricity</option>
            <option value="Internet">Internet</option>
            <option value="Education">Education</option>
            <option value="Other">Other</option>
          </select>
          <input
            type="number"
            placeholder="Amount (INR)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              max={31}
              placeholder="Day (1-31)"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              required
              className="w-24 px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition"
            >
              Add
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
