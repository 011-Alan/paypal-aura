import React, { useEffect, useState } from 'react';
import { Repeat, CheckCircle2, AlertCircle, Plus, Calendar } from 'lucide-react';
import { apiRequest, formatInr } from '../lib/api';

export const CommitmentsPage: React.FC = () => {
  const [mandates, setMandates] = useState<any[]>([]);
  const [confirmedTotal, setConfirmedTotal] = useState(0);
  const [title, setTitle] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState('Subscription');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('5');

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
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-navy-900">Recurring Mandates &amp; Upcoming Commitments</h2>
          <p className="text-xs text-slate-500">
            Detected by AURA Mandate Intelligence Agent and synchronised with your Bryntum Financial Life Calendar.
          </p>
        </div>
        <div className="bg-blue-50 px-4 py-2.5 rounded-xl border border-blue-100 text-right">
          <div className="text-[11px] font-semibold text-blue-700 uppercase">Confirmed Monthly Outflow</div>
          <div className="text-xl font-bold text-navy-900">{formatInr(confirmedTotal)}</div>
        </div>
      </div>

      {/* Mandates List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {mandates.map((m) => (
          <div
            key={m._id}
            className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between gap-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                    {m.category}
                  </span>
                  {m.status === 'confirmed' ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3 h-3" /> Confirmed Mandate
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      <AlertCircle className="w-3 h-3" /> Inferred Pattern ({Math.round(m.confidenceScore * 100)}% match)
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-navy-900 mt-2">{m.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Merchant: {m.merchant}</p>
                {m.notes && <p className="text-[11px] text-slate-500 mt-1">{m.notes}</p>}
              </div>
              <div className="text-right">
                <div className={`text-lg font-bold ${m.category === 'Salary' ? 'text-emerald-600' : 'text-navy-900'}`}>
                  {formatInr(m.amount)}
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
                  Confirm this recurring commitment to include in calendar reminders?
                </span>
                <button
                  onClick={() => handleConfirmMandate(m._id)}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  Confirm Mandate
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add New Mandate */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <h3 className="text-sm font-bold text-navy-900 flex items-center gap-2 mb-4">
          <Repeat className="w-4 h-4 text-blue-600" />
          Add Recurring Commitment
        </h3>
        <form onSubmit={handleCreateMandate} className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <input
            type="text"
            placeholder="Commitment Title (e.g. Gym Membership)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
          />
          <input
            type="text"
            placeholder="Merchant Name"
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            required
            className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="px-3.5 py-2 rounded-xl border border-slate-200 text-xs bg-white"
          >
            <option value="Rent">Rent</option>
            <option value="Loan EMI">Loan EMI</option>
            <option value="Insurance">Insurance</option>
            <option value="Internet">Internet</option>
            <option value="Electricity">Electricity</option>
            <option value="Subscription">Subscription</option>
            <option value="Education">Education</option>
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Amount ₹"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
            />
            <input
              type="number"
              min={1}
              max={31}
              placeholder="Day"
              value={dueDay}
              onChange={(e) => setDueDay(e.target.value)}
              required
              className="w-20 px-3 py-2 rounded-xl border border-slate-200 text-xs"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-navy-900 hover:bg-navy-800 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add &amp; Sync Calendar
          </button>
        </form>
      </div>
    </div>
  );
};
