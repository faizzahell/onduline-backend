import { Inject, Injectable } from '@nestjs/common';

import {
  BUSINESS_CENTRAL_CLIENT,
  type BusinessCentralClient,
  type OpenPurchaseOrder,
  type SubmitPurchaseInvoicePayload,
  type SubmitPurchaseInvoiceResult,
} from './business-central.types';

@Injectable()
export class BusinessCentralService {
  constructor(
    @Inject(BUSINESS_CENTRAL_CLIENT)
    private readonly client: BusinessCentralClient,
  ) {}

  /** `true` when the returned data comes from the mock client. */
  get isMocked(): boolean {
    return this.client.name === 'mock';
  }

  async findOpenPurchaseOrders(
    vendorName: string | null,
  ): Promise<OpenPurchaseOrder[]> {
    return this.client.findOpenPurchaseOrders(vendorName ?? '');
  }

  async submitPurchaseInvoice(
    payload: SubmitPurchaseInvoicePayload,
  ): Promise<SubmitPurchaseInvoiceResult> {
    return this.client.submitPurchaseInvoice(payload);
  }
}
