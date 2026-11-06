/**
 * AURA Application Feature Flags & Frontend Visibility Settings
 *
 * Use this configuration to easily toggle modular sections in the dashboard.
 */
export const FEATURE_FLAGS = {
  /**
   * Toggles the "PayPal Sandbox Business Account" / Merchant Reporting section.
   * - Set to false: Keeps dashboard focused purely on the user's personal Connected PayPal Account.
   * - Set to true: Displays merchant settlement reports, transaction fee breakdowns, and store analytics.
   *
   * Can also be overridden at runtime via VITE_ENABLE_MERCHANT_REPORTING="true" in .env
   */
  ENABLE_MERCHANT_REPORTING_SECTION:
    import.meta.env.VITE_ENABLE_MERCHANT_REPORTING === 'true' || false,
};
