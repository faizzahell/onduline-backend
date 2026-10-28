import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { OCR_QUEUE } from '../../common/queue/queue.constants';
import { BusinessCentralModule } from '../business-central/business-central.module';
import { OcrInvoiceController } from './ocr-invoice.controller';
import { OcrInvoiceService } from './ocr-invoice.service';
import { OcrProcessor } from './processors/ocr.processor';
import { GeminiExtractionProvider } from './providers/gemini-extraction.provider';
import { INVOICE_EXTRACTION_PROVIDER } from './providers/invoice-extraction.provider';

@Module({
  imports: [
    BullModule.registerQueue({ name: OCR_QUEUE }),
    BusinessCentralModule,
  ],
  controllers: [OcrInvoiceController],
  providers: [
    OcrInvoiceService,
    OcrProcessor,
    GeminiExtractionProvider,
    {
      // The single place that decides which extraction vendor is used.
      provide: INVOICE_EXTRACTION_PROVIDER,
      useExisting: GeminiExtractionProvider,
    },
  ],
})
export class OcrInvoiceModule {}
