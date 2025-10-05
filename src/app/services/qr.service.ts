import { Injectable } from '@angular/core';

interface ScanResult {
  text: string;
}

@Injectable({
  providedIn: 'root'
})
export class QrService {
  constructor() { }

  /** Try scanning using available runtime plugins; fallback to prompt paste */
  async scan(): Promise<ScanResult> {
    const anyWin: any = window as any;
    const plugin = anyWin?.Capacitor?.Plugins?.BarcodeScanner || anyWin?.BarcodeScanner;
    if (plugin && typeof plugin.scan === 'function') {
      try {
        const res = await plugin.scan();
        const text: string = (res?.barcodes?.[0]?.rawValue) || res?.content || res?.text || '';
        return { text: text || '' };
      } catch {
        // continue to fallback
      }
    }
    const pasted = prompt('Scanner unavailable. Paste QR text or security code:') || '';
    return { text: pasted };
  }
}
