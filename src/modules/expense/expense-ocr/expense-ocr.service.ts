import { InjectQueue } from '@nestjs/bullmq';
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Queue } from 'bullmq';

import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  EXPENSE_OCR_JOB,
  EXPENSE_OCR_QUEUE,
  type ExpenseOcrJobPayload,
} from '../../../common/queue/queue.constants';
import { StorageService } from '../../../common/storage/storage.service';
import type { CompanyContext } from '../../../common/types/company-context';

const JOB_OPTIONS = {
  attempts: 2,
  backoff: { type: 'exponential' as const, delay: 3_000 },
  removeOnComplete: 200,
  removeOnFail: 200,
};

const jobInclude = {
  suggestedCategory: {
    select: { id: true, code: true, name: true },
  },
} as const;

@Injectable()
export class ExpenseOcrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(EXPENSE_OCR_QUEUE)
    private readonly queue: Queue<ExpenseOcrJobPayload>,
  ) {}

  /**
   * Uploads one or more receipts and queues extraction, one job per file.
   *
   * Only available when a super administrator has enabled expense OCR for the
   * company. Manual entry always stays available regardless of this setting.
   */
  async createMany(
    company: CompanyContext,
    userId: string,
    files: Express.Multer.File[],
  ) {
    if (!company.ocrExpenseEnabled) {
      throw new ForbiddenException(
        `OCR is not enabled for company ${company.code}. Ask a super administrator to enable it, or record the expense manually.`,
      );
    }

    const jobs = [];

    for (const file of files) {
      jobs.push(await this.createOne(company.id, userId, file));
    }

    return jobs;
  }

  private async createOne(
    companyId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    const stored = await this.storage.saveFile(
      `expense-receipts/${userId}`,
      file,
    );

    try {
      const job = await this.prisma.expenseOcrJob.create({
        data: {
          companyId,
          uploadedByUserId: userId,
          originalName: file.originalname,
          storageKey: stored.storageKey,
          mimeType: file.mimetype,
          size: file.size,
        },
        include: jobInclude,
      });

      await this.queue.add(
        EXPENSE_OCR_JOB,
        { expenseOcrJobId: job.id },
        JOB_OPTIONS,
      );

      return job;
    } catch (error) {
      await this.storage.deleteFile(stored.storageKey);
      throw error;
    }
  }

  /** Polled by the entry form while extraction is running. */
  async findOne(companyId: string, userId: string, id: string) {
    const job = await this.prisma.expenseOcrJob.findFirst({
      where: { id, companyId, uploadedByUserId: userId },
      include: jobInclude,
    });

    if (!job) {
      throw new NotFoundException('Extraction job not found');
    }

    return job;
  }

  /** The user's jobs that have not been turned into an entry yet. */
  async listPending(companyId: string, userId: string) {
    return this.prisma.expenseOcrJob.findMany({
      where: { companyId, uploadedByUserId: userId, expenseEntryId: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: jobInclude,
    });
  }

  async remove(companyId: string, userId: string, id: string) {
    const job = await this.findOne(companyId, userId, id);

    if (job.expenseEntryId) {
      throw new ForbiddenException(
        'This extraction is already linked to an expense entry and cannot be deleted',
      );
    }

    await this.prisma.expenseOcrJob.delete({ where: { id } });
    await this.storage.deleteFile(job.storageKey);

    return { message: 'Extraction job deleted' };
  }

  /** Receipt file, streamed through a guarded endpoint. */
  async getFileForDownload(companyId: string, userId: string, id: string) {
    const job = await this.findOne(companyId, userId, id);

    if (!(await this.storage.exists(job.storageKey))) {
      throw new NotFoundException('The receipt file is no longer available');
    }

    return {
      job,
      stream: this.storage.createReadStream(job.storageKey),
    };
  }
}
