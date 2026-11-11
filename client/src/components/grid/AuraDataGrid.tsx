import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridReadyEvent, SelectionChangedEvent } from 'ag-grid-community';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';
import {
  Sparkles,
  Search,
  Download,
  RotateCcw,
  RefreshCw,
  Bookmark,
  Check,
  X,
  Layers,
  ChevronDown,
  Trash2,
  Undo2,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAskAura } from '../../context/AskAuraContext';
import { gridStateManager } from '../../lib/gridStateManager';

export interface AuraDataGridProps {
  gridId: string;
  source: 'transactions' | 'orders' | 'commitments' | 'goals' | 'budget';
  rowData: any[];
  columnDefs: ColDef[];
  loading?: boolean;
  error?: string;
  onRefresh?: () => void;
  height?: string;
  title?: string;
  subtitle?: string;
  enableSavedViews?: boolean;
  defaultColDef?: ColDef;
  quickSearch?: string;
  onRowClicked?: (row: any) => void;
}

export const AuraDataGrid: React.FC<AuraDataGridProps> = ({
  gridId,
  source,
  rowData,
  columnDefs,
  loading = false,
  error = '',
  onRefresh,
  height = '520px',
  title,
  subtitle,
  enableSavedViews = true,
  defaultColDef,
  quickSearch,
  onRowClicked,
}) => {
  const askAura = useAskAura();
  const [gridApi, setGridApi] = useState<any>(null);
  const [quickFilterText, setQuickFilterText] = useState('');
  const [selectedRows, setSelectedRows] = useState<any[]>([]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  });

  // Saved views state
  const [savedViews, setSavedViews] = useState<any[]>([]);
  const [activeViewName, setActiveViewName] = useState<string>('All Records');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [savingView, setSavingView] = useState(false);

  // Theme change listener
  useEffect(() => {
    const handleThemeChange = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    window.addEventListener('aura-theme-changed', handleThemeChange);
    const observer = new MutationObserver(handleThemeChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener('aura-theme-changed', handleThemeChange);
      observer.disconnect();
    };
  }, []);

  // Load saved views
  const loadSavedViews = useCallback(async () => {
    if (!enableSavedViews) return;
    try {
      const res = await apiRequest<{ success: boolean; views: any[] }>(`/grid/views?gridId=${gridId}`);
      if (res.success) {
        setSavedViews(res.views || []);
      }
    } catch {
      // ignore
    }
  }, [gridId, enableSavedViews]);

  useEffect(() => {
    loadSavedViews();
  }, [loadSavedViews]);

  // Register grid with gridStateManager
  const onGridReady = (params: GridReadyEvent) => {
    setGridApi(params.api);
    gridStateManager.registerGrid(gridId, params.api);
  };

  useEffect(() => {
    if (gridApi && quickSearch !== undefined) {
      gridApi.setGridOption('quickFilterText', quickSearch);
    }
  }, [gridApi, quickSearch]);

  useEffect(() => {
    return () => {
      gridStateManager.unregisterGrid(gridId);
    };
  }, [gridId]);

  // Selection handler
  const onSelectionChanged = (event: SelectionChangedEvent) => {
    const selected = event.api.getSelectedRows();
    setSelectedRows(selected || []);
  };

  // Analyse with AURA action
  const handleAnalyseWithAura = () => {
    if (selectedRows.length === 0) return;
    const selectedIds = selectedRows.map((r) => String(r.id || r._id)).filter(Boolean);
    const totalAmount = selectedRows.reduce((sum, r) => sum + (Number(r.amount || r.totalAmount || r.targetAmount) || 0), 0);
    const preview = `${selectedRows.length} ${source} ($${totalAmount.toFixed(2)})`;

    askAura.attachSelectionContext({
      source,
      gridId,
      selectedIds,
      count: selectedRows.length,
      previewText: preview,
    });

    // Open Ask AURA floating panel or navigate
    if (askAura.activeTab !== 'ask-aura') {
      askAura.openFloatingChat();
    }
  };

  // Clear selection
  const handleClearSelection = () => {
    if (gridApi) {
      gridApi.deselectAll();
      setSelectedRows([]);
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setQuickFilterText('');
    gridStateManager.clearFilters(gridId);
    setActiveViewName('All Records');
  };

  // Export CSV
  const handleExportCsv = () => {
    if (gridApi) {
      gridApi.exportDataAsCsv({
        fileName: `AURA_${source}_export_${new Date().toISOString().split('T')[0]}.csv`,
      });
    }
  };

  // Undo last filter/sort change
  const handleUndo = () => {
    gridStateManager.undo(gridId);
  };

  // Apply saved view
  const handleSelectView = (view: any) => {
    if (!view) {
      handleResetFilters();
      return;
    }
    setActiveViewName(view.name);
    if (view.filterModel) {
      gridStateManager.applyFilters(gridId, view.filterModel);
    }
    if (view.sortModel) {
      gridStateManager.applySorting(gridId, view.sortModel);
    }
    if (view.columnVisibility) {
      const hides = Object.entries(view.columnVisibility).filter(([, v]) => !v).map(([k]) => k);
      const shows = Object.entries(view.columnVisibility).filter(([, v]) => !!v).map(([k]) => k);
      gridStateManager.setColumnVisibility(gridId, hides, shows);
    }
  };

  // Save current view
  const handleSaveViewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newViewName.trim() || !gridApi) return;
    setSavingView(true);
    try {
      const filterModel = gridApi.getFilterModel?.() || {};
      const colState = gridApi.getColumnState?.() || [];
      const sortModel = colState.filter((c: any) => c.sort).map((c: any) => ({ colId: c.colId, sort: c.sort }));
      const columnVisibility: Record<string, boolean> = {};
      colState.forEach((c: any) => {
        columnVisibility[c.colId] = !c.hide;
      });

      const res = await apiRequest<{ success: boolean; view: any }>('/grid/views', {
        method: 'POST',
        body: JSON.stringify({
          gridId,
          name: newViewName.trim(),
          filterModel,
          sortModel,
          columnVisibility,
        }),
      });
      if (res.success) {
        setActiveViewName(res.view.name);
        setNewViewName('');
        setShowSaveModal(false);
        loadSavedViews();
      }
    } finally {
      setSavingView(false);
    }
  };

  // Delete saved view
  const handleDeleteView = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiRequest(`/grid/views/${id}`, { method: 'DELETE' });
      loadSavedViews();
      if (activeViewName !== 'All Records') {
        setActiveViewName('All Records');
      }
    } catch {
      // ignore
    }
  };

  // Merge columns with row selection checkbox column
  const enrichedColumnDefs = useMemo<ColDef[]>(() => {
    const selectionCol: ColDef = {
      headerCheckboxSelection: true,
      checkboxSelection: true,
      width: 48,
      minWidth: 48,
      maxWidth: 48,
      pinned: 'left',
      lockPosition: 'left',
      suppressMovable: true,
      filter: false,
      sortable: false,
      resizable: false,
    };
    return [selectionCol, ...columnDefs];
  }, [columnDefs]);

  const defaultCol = useMemo<ColDef>(() => {
    return {
      sortable: true,
      filter: true,
      resizable: true,
      minWidth: 100,
      ...defaultColDef,
    };
  }, [defaultColDef]);

  const themeClass = isDarkMode ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';

  return (
    <div className="space-y-3 relative">
      {/* Top Header & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        <div>
          {title && <h3 className="font-bold text-sm text-navy-900 dark:text-white">{title}</h3>}
          {subtitle && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Quick Search */}
          <div className="relative min-w-[180px] max-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={quickFilterText}
              onChange={(e) => {
                setQuickFilterText(e.target.value);
                gridApi?.setGridOption?.('quickFilterText', e.target.value);
              }}
              placeholder="Search in table..."
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Saved Views Dropdown */}
          {enableSavedViews && (
            <div className="relative group">
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 transition"
              >
                <Bookmark className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span className="truncate max-w-[110px]">{activeViewName}</span>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </button>

              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg p-1.5 hidden group-hover:block z-30">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 py-1">
                  Saved Views
                </div>
                <button
                  type="button"
                  onClick={() => handleSelectView(null)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between ${
                    activeViewName === 'All Records'
                      ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>All Records (Default)</span>
                  {activeViewName === 'All Records' && <Check className="w-3 h-3" />}
                </button>

                {savedViews.map((v) => (
                  <div
                    key={v._id}
                    onClick={() => handleSelectView(v)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between cursor-pointer ${
                      activeViewName === v.name
                        ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span className="truncate">{v.name}</span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteView(v._id, e)}
                      className="text-slate-400 hover:text-rose-500 p-0.5 ml-1"
                      title="Delete view"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                <div className="border-t border-slate-100 dark:border-slate-800 mt-1 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowSaveModal(true)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 flex items-center gap-1.5"
                  >
                    <Bookmark className="w-3 h-3" />
                    Save Current View
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Undo Button */}
          <button
            type="button"
            onClick={handleUndo}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
            title="Undo last grid change"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>

          {/* Reset Filters */}
          <button
            type="button"
            onClick={handleResetFilters}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
            title="Reset filters"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          {/* Export CSV */}
          <button
            type="button"
            onClick={handleExportCsv}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Refresh */}
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
              title="Refresh records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 font-semibold">
          {error}
        </div>
      )}

      {/* AG Grid Container */}
      <div
        className={`${themeClass} w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xs transition-colors`}
        style={{ height }}
      >
        <AgGridReact
          rowData={rowData}
          columnDefs={enrichedColumnDefs}
          defaultColDef={defaultCol}
          rowSelection="multiple"
          suppressRowClickSelection={true}
          pagination={true}
          paginationPageSize={15}
          paginationPageSizeSelector={[10, 15, 25, 50, 100]}
          onGridReady={onGridReady}
          onSelectionChanged={onSelectionChanged}
          onRowClicked={(event) => onRowClicked?.(event.data)}
          getRowId={(params) => String(params.data.id || params.data._id)}
          animateRows={true}
        />
      </div>

      {/* Contextual Action Bar when Rows are Selected */}
      {selectedRows.length > 0 && (
        <div className="sticky bottom-4 z-30 flex items-center justify-between px-5 py-3 rounded-2xl bg-navy-950/95 dark:bg-slate-900/95 backdrop-blur-md text-white border border-blue-500/30 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-600 text-xs font-bold">
              {selectedRows.length}
            </span>
            <span className="text-xs font-semibold text-slate-200">
              {selectedRows.length === 1 ? '1 record selected' : `${selectedRows.length} records selected`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAnalyseWithAura}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 shadow-md shadow-blue-600/30 transition transform active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Analyse with AURA
            </button>
            <button
              type="button"
              onClick={handleClearSelection}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition"
              title="Clear selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Save View Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-base text-navy-900 dark:text-white">Save Current View</h4>
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Saves active column filters, sorting order, and visible columns for your account.
            </p>

            <form onSubmit={handleSaveViewSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  View Name
                </label>
                <input
                  type="text"
                  required
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="e.g. Monthly Expenses, Large Purchases..."
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSaveModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingView || !newViewName.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                >
                  {savingView ? 'Saving...' : 'Save View'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
