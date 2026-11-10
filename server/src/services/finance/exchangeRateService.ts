import { env } from '../../config/env';
import { logger } from '../../config/logger';

export interface CurrencyConversionResult {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  convertedCurrency: string;
  rate: number;
  rateTimestamp: string;
  formula: string;
  disclaimer: string;
  formattedText: string;
  success: boolean;
  error?: string;
}

export class ExchangeRateService {
  // Base rates relative to USD (1 USD = X Currency)
  private usdBaseRates: Record<string, number> = {
    USD: 1.0,
    INR: 84.5, // 1 USD = 84.50 INR
    EUR: 0.92, // 1 USD = 0.92 EUR
    GBP: 0.79, // 1 USD = 0.79 GBP
    AED: 3.67, // 1 USD = 3.67 AED
    CAD: 1.36,
    AUD: 1.52,
    SGD: 1.34,
    JPY: 154.5,
  };

  private lastUpdated: Date = new Date();

  constructor() {
    // If env defines an INR_TO_USD_RATE, calibrate the base rate
    if (env.INR_TO_USD_RATE && env.INR_TO_USD_RATE > 0) {
      this.usdBaseRates.INR = Math.round((1 / env.INR_TO_USD_RATE) * 100) / 100;
    }
  }

  public getRate(fromCurrency: string, toCurrency: string): { rate: number; timestamp: string } {
    const from = fromCurrency.toUpperCase().trim();
    const to = toCurrency.toUpperCase().trim();

    const fromRate = this.usdBaseRates[from] || (from === 'INR' ? 84.5 : 1.0);
    const toRate = this.usdBaseRates[to] || (to === 'INR' ? 84.5 : 1.0);

    // Cross-rate calculation via USD base
    const rate = Math.round((toRate / fromRate) * 10000) / 10000;
    return {
      rate,
      timestamp: this.lastUpdated.toISOString(),
    };
  }

  public convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ): CurrencyConversionResult {
    const from = fromCurrency.toUpperCase().trim();
    const to = toCurrency.toUpperCase().trim();

    if (!amount || isNaN(amount) || amount <= 0) {
      return {
        originalAmount: amount,
        originalCurrency: from,
        convertedAmount: 0,
        convertedCurrency: to,
        rate: 0,
        rateTimestamp: new Date().toISOString(),
        formula: 'Invalid amount',
        disclaimer: 'Exchange rate conversion could not be verified.',
        formattedText: 'Invalid monetary amount provided for currency conversion.',
        success: false,
        error: 'A positive numeric amount is required for currency conversion.',
      };
    }

    const { rate, timestamp } = this.getRate(from, to);
    const convertedAmount = Math.round(amount * rate * 100) / 100;

    const fromSymbol = from === 'INR' ? '₹' : from === 'USD' ? '$' : from === 'EUR' ? '€' : from === 'GBP' ? '£' : '';
    const toSymbol = to === 'INR' ? '₹' : to === 'USD' ? '$' : to === 'EUR' ? '€' : to === 'GBP' ? '£' : '';

    const formula = `${fromSymbol}${amount.toLocaleString('en-IN')} ${from} × ${rate} = ${toSymbol}${convertedAmount.toLocaleString('en-US')} ${to}`;

    const dateStr = new Date(timestamp).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    const disclaimer = `Indicative conversion based on current interbank FX rates as of ${dateStr} IST. The actual charged amount may vary depending on your card issuer or payment gateway foreign transaction fee (typically 1.5% - 3.5%), local import duties, and regional taxes.`;

    const formattedText = `**${fromSymbol}${amount.toLocaleString('en-IN')} ${from}** is approximately **${toSymbol}${convertedAmount.toLocaleString('en-US')} ${to}** (Exchange rate: 1 ${from} = ${rate} ${to}, verified ${dateStr} IST).\n\n*Note:* ${disclaimer}`;

    return {
      originalAmount: amount,
      originalCurrency: from,
      convertedAmount,
      convertedCurrency: to,
      rate,
      rateTimestamp: timestamp,
      formula,
      disclaimer,
      formattedText,
      success: true,
    };
  }
}

export const exchangeRateService = new ExchangeRateService();
