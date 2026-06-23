import { useState, useEffect, useCallback } from 'react';
import API from '../services/api';

const ReloanModal = ({ isOpen, onClose, customerId, onReloanSubmitted }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  
  // Form State
  const [desiredAmount, setDesiredAmount] = useState('');
  const [loanTerm, setLoanTerm] = useState('45');
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchReloanData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await API.get(`/customers/${customerId}/reloan-eval`);
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch reloan evaluation data');
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    if (isOpen && customerId) {
      fetchReloanData();
    }
  }, [isOpen, customerId, fetchReloanData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!desiredAmount || isNaN(desiredAmount) || Number(desiredAmount) <= 0) {
      setError('Please enter a valid loan amount.');
      return;
    }
    
    setSubmitting(true);
    setError('');
    try {
      await API.post(`/customers/${customerId}/reloan`, {
        principal: Number(desiredAmount),
        loan_period: Number(loanTerm),
        remarks: remarks
      });
      onReloanSubmitted();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit reloan application');
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 960, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ background: '#2563eb', color: '#fff', borderRadius: 8, padding: 8, display: 'flex' }}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h2 className="modal-title">RELOAN APPLICATION</h2>
          </div>
          <button onClick={onClose} className="modal-close">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">{error}</div>
          ) : data ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: History & Eligibility */}
              <div className="lg:col-span-1 space-y-6">
                
                {/* Eligibility Card */}
                <div className={`p-5 rounded-xl border ${data.is_eligible ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">Eligibility Status</h3>
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full animate-pulse ${data.is_eligible ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                    <span className={`text-xl font-bold ${data.is_eligible ? 'text-emerald-700' : 'text-red-700'}`}>
                      {data.is_eligible ? 'Eligible for Reloan' : 'Not Eligible'}
                    </span>
                  </div>
                  {!data.is_eligible && (
                    <p className="text-xs text-red-600 mt-2">Client must be Fully Paid with no active balance or hold status.</p>
                  )}
                </div>

                {/* History Summary */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4 border-b pb-2">Loan History Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-sm">Total Loans Availed</span>
                      <span className="font-medium">{data.total_loans}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-sm">Successful Loans</span>
                      <span className="font-medium text-emerald-600">{data.successful_loans}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-sm">Past Due Accounts</span>
                      <span className="font-medium text-red-600">{data.past_due_occurrences}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-sm">Recon Accounts</span>
                      <span className="font-medium text-orange-600">{data.recon_history}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500 text-sm">Collection Efficiency</span>
                      <span className="font-bold text-indigo-600">{data.collection_efficiency}%</span>
                    </div>
                    <div className="pt-3 mt-3 border-t border-gray-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-500 text-sm">Last Loan Amount</span>
                        <span className="font-medium text-gray-900">₱{data.last_loan_amount?.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-500 text-sm">Last Fully Paid</span>
                        <span className="text-sm text-gray-700">{data.last_fully_paid_date || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Right Column: Request Form */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Recommendation Engine */}
                {data.is_eligible && (
                  <div className="bg-white rounded-xl border border-indigo-100 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-indigo-900 uppercase tracking-wider mb-4">Recommended Loan Amounts</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div 
                        onClick={() => setDesiredAmount(data.recommendations.conservative)}
                        className="cursor-pointer group relative overflow-hidden bg-slate-50 border border-slate-200 p-4 rounded-lg hover:border-indigo-400 hover:shadow-md transition-all text-center"
                      >
                        <div className="text-xs text-slate-500 uppercase font-semibold mb-1">Conservative</div>
                        <div className="text-xl font-bold text-slate-800">₱{data.recommendations.conservative?.toLocaleString()}</div>
                      </div>
                      <div 
                        onClick={() => setDesiredAmount(data.recommendations.standard)}
                        className="cursor-pointer group relative overflow-hidden bg-indigo-50 border border-indigo-200 p-4 rounded-lg hover:border-indigo-500 hover:shadow-md transition-all text-center"
                      >
                        <div className="absolute top-0 right-0 bg-indigo-500 text-white text-[10px] px-2 py-0.5 font-bold rounded-bl-lg">STANDARD</div>
                        <div className="text-xs text-indigo-600 uppercase font-semibold mb-1">Standard</div>
                        <div className="text-2xl font-bold text-indigo-900">₱{data.recommendations.standard?.toLocaleString()}</div>
                      </div>
                      <div 
                        onClick={() => setDesiredAmount(data.recommendations.progressive)}
                        className="cursor-pointer group relative overflow-hidden bg-amber-50 border border-amber-200 p-4 rounded-lg hover:border-amber-400 hover:shadow-md transition-all text-center"
                      >
                        <div className="text-xs text-amber-600 uppercase font-semibold mb-1">Progressive</div>
                        <div className="text-xl font-bold text-amber-900">₱{data.recommendations.progressive?.toLocaleString()}</div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-3 text-center italic">Click a recommendation to auto-fill the desired amount.</p>
                  </div>
                )}

                {/* Form */}
                <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="bg-gray-50 px-5 py-3 border-b border-gray-200">
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Loan Request Details</h3>
                  </div>
                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Desired Loan Amount (₱)</label>
                        <input
                          type="number"
                          value={desiredAmount}
                          onChange={(e) => setDesiredAmount(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-lg font-semibold"
                          placeholder="0.00"
                          disabled={!data.is_eligible}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Loan Term</label>
                        <select
                          value={loanTerm}
                          onChange={(e) => setLoanTerm(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-gray-50"
                          disabled={!data.is_eligible}
                        >
                          <option value="30">30 Days</option>
                          <option value="45">45 Days</option>
                          <option value="60">60 Days</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Remarks (Optional)</label>
                      <textarea
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        rows="2"
                        placeholder="Add any notes for the approver..."
                        disabled={!data.is_eligible}
                      ></textarea>
                    </div>
                  </div>
                  <div className="bg-gray-50 px-5 py-4 border-t border-gray-200 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!data.is_eligible || submitting}
                      className={`px-5 py-2 text-white rounded-lg font-medium shadow-sm transition-all flex items-center gap-2 ${
                        !data.is_eligible || submitting
                          ? 'bg-indigo-300 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-700 hover:shadow-md'
                      }`}
                    >
                      {submitting ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Submitting...
                        </>
                      ) : 'Submit for Approval'}
                    </button>
                  </div>
                </form>

              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ReloanModal;
