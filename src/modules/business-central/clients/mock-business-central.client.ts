import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import type {
  BusinessCentralClient,
  OpenPurchaseOrder,
  SubmitPurchaseInvoicePayload,
  SubmitPurchaseInvoiceResult,
} from '../business-central.types';

/**
 * Mock Business Central implementation for development and demos.
 *
 * The data is static and deliberately so: this is **not** a real integration.
 * The mock PO data used to be embedded straight into the frontend pages, which
 * made the UI look functional even though the backend had no endpoint for it.
 * Keeping it here draws a clear line between real and mock data, and gives a
 * single place to swap out once BC is ready.
 */
@Injectable()
export class MockBusinessCentralClient
  implements BusinessCentralClient, OnModuleInit
{
  readonly name = 'mock';

  private readonly logger = new Logger(MockBusinessCentralClient.name);

  private readonly purchaseOrders: OpenPurchaseOrder[] = [
    {
      poNumber: 'PO-10495',
      vendorNo: 'V-00123',
      vendorName: 'PT Sinar Baja Logam',
      orderDate: '2026-09-28',
      purchaserName: 'Budi Santoso',
      currency: 'IDR',
      totalAmount: 185_400_000,
      status: 'Released',
      grnStatus: 'FULLY_RECEIVED',
      linesCount: 2,
      lines: [
        {
          lineNumber: 1,
          itemNo: 'ITM-7781',
          description: 'Coil Baja Galvanis 0.35mm',
          quantity: 120,
          unit: 'ROLL',
          unitPrice: 1_250_000,
          lineTotal: 150_000_000,
          receivedQuantity: 120,
        },
        {
          lineNumber: 2,
          itemNo: 'ITM-7782',
          description: 'Jasa Potong & Handling',
          quantity: 1,
          unit: 'LOT',
          unitPrice: 35_400_000,
          lineTotal: 35_400_000,
          receivedQuantity: 1,
        },
      ],
    },
    {
      poNumber: 'PO-10512',
      vendorNo: 'V-00123',
      vendorName: 'PT Sinar Baja Logam',
      orderDate: '2026-10-05',
      purchaserName: 'Budi Santoso',
      currency: 'IDR',
      totalAmount: 92_750_000,
      status: 'Released',
      grnStatus: 'PARTIALLY_RECEIVED',
      linesCount: 1,
      lines: [
        {
          lineNumber: 1,
          itemNo: 'ITM-7790',
          description: 'Coil Baja Galvanis 0.40mm',
          quantity: 55,
          unit: 'ROLL',
          unitPrice: 1_686_364,
          lineTotal: 92_750_000,
          receivedQuantity: 30,
        },
      ],
    },
    {
      poNumber: 'PO-10533',
      vendorNo: 'V-00341',
      vendorName: 'CV Mitra Kimia Nusantara',
      orderDate: '2026-10-11',
      purchaserName: 'Siti Rahayu',
      currency: 'IDR',
      totalAmount: 48_300_000,
      status: 'Released',
      grnStatus: 'NOT_RECEIVED',
      linesCount: 1,
      lines: [
        {
          lineNumber: 1,
          itemNo: 'ITM-5520',
          description: 'Resin Bitumen Grade A',
          quantity: 210,
          unit: 'DRUM',
          unitPrice: 230_000,
          lineTotal: 48_300_000,
          receivedQuantity: 0,
        },
      ],
    },
  ];

  onModuleInit(): void {
    this.logger.warn(
      'Business Central is running with the mock client. Purchase order data and submit results are not real.',
    );
  }

  async findOpenPurchaseOrders(
    vendorName: string,
  ): Promise<OpenPurchaseOrder[]> {
    const query = vendorName.trim().toLowerCase();

    if (query.length === 0) {
      return this.purchaseOrders;
    }

    const matches = this.purchaseOrders.filter(
      (purchaseOrder) =>
        purchaseOrder.vendorName.toLowerCase().includes(query) ||
        purchaseOrder.vendorNo.toLowerCase() === query,
    );

    // Without a fallback, the PO resolution UI would look empty just because
    // the OCR'd vendor name does not match master data exactly.
    return matches.length > 0 ? matches : this.purchaseOrders;
  }

  async submitPurchaseInvoice(
    payload: SubmitPurchaseInvoicePayload,
  ): Promise<SubmitPurchaseInvoiceResult> {
    this.logger.warn(
      `Mock submit for invoice ${payload.invoiceId}, no data was sent to Business Central.`,
    );

    return {
      bcInvoiceNo: `MOCK-${payload.invoiceId.slice(0, 8).toUpperCase()}`,
    };
  }
}
