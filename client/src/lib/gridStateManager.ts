export interface GridSelectionContext {
  source: 'transactions' | 'orders' | 'commitments' | 'goals' | 'budget';
  gridId: string;
  selectedIds: string[];
  count: number;
  previewText?: string;
}

export interface GridActionPayload {
  action:
    | 'apply_filters'
    | 'clear_filters'
    | 'apply_sorting'
    | 'set_column_visibility'
    | 'select_rows'
    | 'undo'
    | 'save_view'
    | 'restore_view';
  gridId?: string;
  filterModel?: Record<string, any>;
  sortModel?: Array<{ colId: string; sort: 'asc' | 'desc' }>;
  hideColumns?: string[];
  showColumns?: string[];
  criteria?: string;
  count?: number;
  ids?: string[];
  view?: any;
}

interface GridEntry {
  api: any;
  history: Array<{ filterModel: any; sortModel: any }>;
  redoStack: Array<{ filterModel: any; sortModel: any }>;
}

export class GridStateManager {
  private grids = new Map<string, GridEntry>();

  registerGrid(gridId: string, api: any) {
    this.grids.set(gridId, {
      api,
      history: [],
      redoStack: [],
    });
  }

  unregisterGrid(gridId: string) {
    this.grids.delete(gridId);
  }

  getGrid(gridId: string): GridEntry | undefined {
    return this.grids.get(gridId);
  }

  saveSnapshot(gridId: string) {
    const entry = this.grids.get(gridId);
    if (!entry || !entry.api) return;
    try {
      const filterModel = entry.api.getFilterModel?.() || {};
      const colState = entry.api.getColumnState?.() || [];
      const sortModel = colState
        .filter((c: any) => c.sort)
        .map((c: any) => ({ colId: c.colId, sort: c.sort }));

      entry.history.push({ filterModel, sortModel });
      if (entry.history.length > 20) entry.history.shift();
      entry.redoStack = [];
    } catch {
      // ignore
    }
  }

  applyFilters(gridId: string, filterModel: Record<string, any>) {
    const entry = this.grids.get(gridId);
    if (!entry || !entry.api) return false;
    this.saveSnapshot(gridId);
    try {
      const current = entry.api.getFilterModel?.() || {};
      const merged = { ...current, ...filterModel };
      entry.api.setFilterModel(merged);
      entry.api.onFilterChanged();
      return true;
    } catch {
      return false;
    }
  }

  clearFilters(gridId: string) {
    const entry = this.grids.get(gridId);
    if (!entry || !entry.api) return false;
    this.saveSnapshot(gridId);
    try {
      entry.api.setFilterModel(null);
      entry.api.onFilterChanged();
      return true;
    } catch {
      return false;
    }
  }

  applySorting(gridId: string, sortModel: Array<{ colId: string; sort: 'asc' | 'desc' }>) {
    const entry = this.grids.get(gridId);
    if (!entry || !entry.api) return false;
    this.saveSnapshot(gridId);
    try {
      entry.api.applyColumnState?.({
        state: sortModel,
        defaultState: { sort: null },
      });
      return true;
    } catch {
      return false;
    }
  }

  setColumnVisibility(gridId: string, hideCols: string[] = [], showCols: string[] = []) {
    const entry = this.grids.get(gridId);
    if (!entry || !entry.api) return false;
    try {
      if (hideCols.length > 0) {
        entry.api.setColumnsVisible?.(hideCols, false);
      }
      if (showCols.length > 0) {
        entry.api.setColumnsVisible?.(showCols, true);
      }
      return true;
    } catch {
      return false;
    }
  }

  selectRows(gridId: string, criteria: string = 'top_largest', count: number = 5, ids?: string[]) {
    const entry = this.grids.get(gridId);
    if (!entry || !entry.api) return false;
    try {
      entry.api.deselectAll();

      if (Array.isArray(ids) && ids.length > 0) {
        const idSet = new Set(ids);
        entry.api.forEachNode((node: any) => {
          if (node.data && idSet.has(node.data.id)) {
            node.setSelected(true);
          }
        });
        return true;
      }

      // Collect all rendered nodes
      const nodes: any[] = [];
      entry.api.forEachNodeAfterFilterAndSort((node: any) => {
        if (node.data) nodes.push(node);
      });

      if (criteria === 'top_largest') {
        nodes.sort((a, b) => (Number(b.data.amount || b.data.totalAmount) || 0) - (Number(a.data.amount || a.data.totalAmount) || 0));
      } else if (criteria === 'bottom_smallest') {
        nodes.sort((a, b) => (Number(a.data.amount || a.data.totalAmount) || 0) - (Number(b.data.amount || b.data.totalAmount) || 0));
      }

      nodes.slice(0, count).forEach((node) => node.setSelected(true));
      return true;
    } catch {
      return false;
    }
  }

  undo(gridId: string) {
    const entry = this.grids.get(gridId);
    if (!entry || !entry.api || entry.history.length === 0) return false;
    try {
      const currentFilter = entry.api.getFilterModel?.() || {};
      const colState = entry.api.getColumnState?.() || [];
      const currentSort = colState.filter((c: any) => c.sort).map((c: any) => ({ colId: c.colId, sort: c.sort }));

      entry.redoStack.push({ filterModel: currentFilter, sortModel: currentSort });
      const previous = entry.history.pop()!;

      entry.api.setFilterModel(previous.filterModel);
      entry.api.onFilterChanged();
      if (previous.sortModel) {
        entry.api.applyColumnState?.({
          state: previous.sortModel,
          defaultState: { sort: null },
        });
      }
      return true;
    } catch {
      return false;
    }
  }

  handleAction(payload: GridActionPayload): boolean {
    if (!payload || !payload.action) return false;
    const targetGridId = payload.gridId || 'transactions-grid';

    switch (payload.action) {
      case 'apply_filters':
        return this.applyFilters(targetGridId, payload.filterModel || {});
      case 'clear_filters':
        return this.clearFilters(targetGridId);
      case 'apply_sorting':
        return this.applySorting(targetGridId, payload.sortModel || []);
      case 'set_column_visibility':
        return this.setColumnVisibility(targetGridId, payload.hideColumns, payload.showColumns);
      case 'select_rows':
        return this.selectRows(targetGridId, payload.criteria, payload.count, payload.ids);
      case 'undo':
        return this.undo(targetGridId);
      case 'restore_view':
        if (payload.view?.filterModel) {
          this.applyFilters(targetGridId, payload.view.filterModel);
        }
        if (payload.view?.sortModel) {
          this.applySorting(targetGridId, payload.view.sortModel);
        }
        return true;
      default:
        return false;
    }
  }
}

export const gridStateManager = new GridStateManager();
