/**
 * Central Application Action Dispatcher & Page Readiness Coordinator
 *
 * Ensures that Ask AURA executes real operations on destination pages
 * rather than merely suggesting navigation links or firing events into unmounted views.
 *
 * Features:
 * 1. Route & component lifecycle registration (mount / unmount).
 * 2. Asynchronous page readiness handshake (Promise-based, zero reliance on arbitrary setTimeout).
 * 3. Typed sequential multi-action execution (NAVIGATE -> WAIT_READY -> EXECUTE -> CONFIRM).
 * 4. Action queueing for pending route transitions.
 * 5. Execution feedback events for real-time progress indicators.
 */

export type ApplicationActionType =
  | 'NAVIGATE'
  | 'SEARCH_PRODUCTS'
  | 'FILTER_PRODUCTS'
  | 'COMPARE_PRODUCTS'
  | 'SELECT_PRODUCT'
  | 'PREPARE_CHECKOUT'
  | 'OPEN_FINANCIAL_GOALS'
  | 'CREATE_FINANCIAL_GOAL'
  | 'UPDATE_FINANCIAL_GOAL'
  | 'REFRESH_GOALS'
  | 'OPEN_TRANSACTIONS'
  | 'FILTER_TRANSACTIONS'
  | 'SORT_TRANSACTIONS'
  | 'OPEN_BILLS'
  | 'FILTER_BILLS'
  | 'CREATE_REMINDER'
  | 'SCHEDULE_EVENT'
  | 'REFRESH_CALENDAR'
  | 'CHANGE_THEME'
  | 'UPDATE_SIDEBAR'
  | 'LOGOUT';

export interface ActionWorkflowStep {
  stepIndex: number;
  action: ApplicationActionType | string;
  targetTab?: string;
  parameters: Record<string, any>;
  description: string;
  status?: 'pending' | 'executing' | 'completed' | 'failed';
  result?: any;
}

export interface ApplicationAction {
  id?: string;
  type: ApplicationActionType | string;
  targetPage?: string;
  targetRoute?: string;
  targetTab?: string;
  payload?: any;
  workflowSteps?: ActionWorkflowStep[];
  onProgress?: (message: string) => void;
}

export interface ActionExecutionResult {
  success: boolean;
  actionType: string;
  page?: string;
  data?: any;
  error?: string;
  timestamp: string;
}

export type PageActionHandlerFn = (actionType: string, payload: any) => Promise<any> | any;

export interface PageActionHandler {
  executeAction: (actionType: string, payload: any) => Promise<any> | any;
  isReady?: () => boolean;
}

class PageActionDispatcher {
  private handlers = new Map<string, PageActionHandler>();
  private readinessWaiters = new Map<string, Array<() => void>>();
  private pendingPageActions = new Map<string, ApplicationAction[]>();
  private activeRoute: string = 'overview';
  private navigationHandler: ((tab: string) => void) | null = null;

  /**
   * Register the root navigation handler (App.tsx / AppShell)
   */
  public registerNavigationHandler(fn: (tab: string) => void): () => void {
    this.navigationHandler = fn;
    return () => {
      this.navigationHandler = null;
    };
  }

  /**
   * Track current active tab
   */
  public setActiveRoute(route: string) {
    this.activeRoute = route;
  }

  public getActiveRoute(): string {
    return this.activeRoute;
  }

  /**
   * Register a mounted destination page component
   */
  public registerPage(pageId: string, handler: PageActionHandler | PageActionHandlerFn): () => void {
    const normalizedHandler: PageActionHandler =
      typeof handler === 'function'
        ? { executeAction: handler, isReady: () => true }
        : {
            executeAction: handler.executeAction,
            isReady: handler.isReady || (() => true),
          };

    this.handlers.set(pageId, normalizedHandler);

    // If there were components waiting for readiness, resolve them
    this.setPageReady(pageId);

    // Execute any queued actions for this page
    const queued = this.pendingPageActions.get(pageId);
    if (queued && queued.length > 0) {
      this.pendingPageActions.delete(pageId);
      queued.forEach((action) => {
        try {
          normalizedHandler.executeAction(action.type, action.payload);
        } catch (err: any) {
          console.warn(`[PageActionDispatcher] Failed to execute queued action on ${pageId}:`, err);
        }
      });
    }

    return () => {
      this.handlers.delete(pageId);
    };
  }

  /**
   * Check if destination page is mounted and ready
   */
  public isPageReady(pageId: string): boolean {
    const handler = this.handlers.get(pageId);
    return handler ? (handler.isReady ? handler.isReady() : true) : false;
  }

  /**
   * Signal that a page is ready for action execution
   */
  public setPageReady(pageId: string, _ready: boolean = true) {
    const waiters = this.readinessWaiters.get(pageId);
    if (waiters && waiters.length > 0) {
      this.readinessWaiters.delete(pageId);
      waiters.forEach((cb) => cb());
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aura-page-ready', { detail: { pageId } }));
    }
  }

  /**
   * Wait asynchronously for a page to mount and report readiness
   */
  public whenPageReady(pageId: string, timeoutMs = 8000): Promise<boolean> {
    if (this.isPageReady(pageId)) {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve) => {
      let resolved = false;

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Clean up waiter
          const current = this.readinessWaiters.get(pageId) || [];
          this.readinessWaiters.set(pageId, current.filter((cb) => cb !== onReady));
          console.warn(`[PageActionDispatcher] Timeout waiting for page "${pageId}" readiness (${timeoutMs}ms)`);
          resolve(false);
        }
      }, timeoutMs);

      const onReady = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(true);
        }
      };

      const current = this.readinessWaiters.get(pageId) || [];
      current.push(onReady);
      this.readinessWaiters.set(pageId, current);
    });
  }

  /**
   * Execute a single action or sequential workflow with reliable page handoff
   */
  public async dispatchAction(action: ApplicationAction): Promise<ActionExecutionResult> {
    const target = action.targetPage || action.targetRoute || action.targetTab;

    // 1. If navigation is required, navigate first
    if (target && target !== this.activeRoute) {
      action.onProgress?.(`Navigating to ${target}...`);
      if (this.navigationHandler) {
        this.navigationHandler(target);
      } else if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aura-navigate', { detail: { page: target } }));
      }
      this.activeRoute = target;

      // 2. Wait for destination page to mount and report readiness
      action.onProgress?.(`Waiting for ${target} to become ready...`);
      const ready = await this.whenPageReady(target);
      if (!ready) {
        console.warn(`[PageActionDispatcher] Page ${target} not ready; queueing action`);
        const q = this.pendingPageActions.get(target) || [];
        q.push(action);
        this.pendingPageActions.set(target, q);
        return {
          success: false,
          actionType: action.type,
          page: target,
          error: `Page "${target}" did not become ready within timeout. Action queued.`,
          timestamp: new Date().toISOString(),
        };
      }
    }

    // 3. Execute action on the page handler
    if (target) {
      const handler = this.handlers.get(target);
      if (handler) {
        action.onProgress?.(`Executing ${action.type}...`);
        try {
          const res = await handler.executeAction(action.type, action.payload);
          return {
            success: true,
            actionType: action.type,
            page: target,
            data: res,
            timestamp: new Date().toISOString(),
          };
        } catch (err: any) {
          return {
            success: false,
            actionType: action.type,
            page: target,
            error: err?.message || 'Action execution failed',
            timestamp: new Date().toISOString(),
          };
        }
      }
    }

    // Global / fallback actions
    if (action.type === 'CHANGE_THEME' && action.payload?.theme) {
      const newTheme = action.payload.theme;
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(newTheme);
      }
      try {
        localStorage.setItem('aura_theme', newTheme);
      } catch {}
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aura-theme-changed', { detail: { theme: newTheme } }));
      }
      return { success: true, actionType: action.type, data: { theme: newTheme }, timestamp: new Date().toISOString() };
    }

    return {
      success: true,
      actionType: action.type,
      data: action.payload,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Dispatch a sequence of actions or workflow steps
   */
  public async dispatchSequence(actions: Array<ApplicationAction | ActionWorkflowStep>): Promise<boolean> {
    for (const act of actions) {
      if ('action' in act) {
        await this.dispatchAction({
          type: act.action as ApplicationActionType,
          targetPage: act.targetTab,
          payload: act.parameters,
        });
      } else {
        await this.dispatchAction(act);
      }
    }
    return true;
  }

  /**
   * Execute a sequential multi-step workflow with dependent steps
   */
  public async executeWorkflow(steps: ActionWorkflowStep[]): Promise<{
    completed: boolean;
    executedSteps: ActionWorkflowStep[];
    error?: string;
  }> {
    const executedSteps: ActionWorkflowStep[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      step.status = 'executing';

      const result = await this.dispatchAction({
        type: step.action as ApplicationActionType,
        targetPage: step.targetTab,
        payload: step.parameters,
      });

      if (!result.success) {
        step.status = 'failed';
        step.result = result;
        executedSteps.push(step);
        return {
          completed: false,
          executedSteps,
          error: `Workflow failed at step ${i + 1} (${step.action}): ${result.error}`,
        };
      }

      step.status = 'completed';
      step.result = result.data;
      executedSteps.push(step);
    }

    return {
      completed: true,
      executedSteps,
    };
  }
}

export const pageActionDispatcher = new PageActionDispatcher();
