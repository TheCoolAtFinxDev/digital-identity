import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { AuditEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY_MS = 86_400_000;

/**
 * F4 — expiry surveillance.
 *
 * Certificates are issued for 398 days and nothing else in the platform notices
 * when one is about to lapse. This sweep records a CERTIFICATE_EXPIRING audit
 * event for every active certificate entering the warning window, which gives
 * operators (and later the portal / any audit-log consumer) a single place to
 * see what needs renewing before signatures start failing.
 *
 * A certificate is warned about once per window: the sweep skips any serial that
 * already has a CERTIFICATE_EXPIRING event recorded since the window opened, so
 * restarting the API does not re-emit the whole backlog.
 */
@Injectable()
export class CertificateLifecycleService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CertificateLifecycleService.name);
  private timer?: NodeJS.Timeout;

  readonly warningDays = Number(process.env.CERT_EXPIRY_WARNING_DAYS ?? 30);
  readonly sweepIntervalHours = Number(process.env.CERT_EXPIRY_SWEEP_HOURS ?? 24);

  constructor(private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    if (this.sweepIntervalHours <= 0) {
      this.logger.log('Certificate expiry sweep disabled (CERT_EXPIRY_SWEEP_HOURS <= 0)');
      return;
    }

    void this.sweep().catch((err) =>
      this.logger.error(`Initial expiry sweep failed: ${(err as Error).message}`),
    );

    this.timer = setInterval(() => {
      void this.sweep().catch((err) =>
        this.logger.error(`Expiry sweep failed: ${(err as Error).message}`),
      );
    }, this.sweepIntervalHours * 3600_000);

    // Don't hold the event loop open on shutdown.
    this.timer.unref();
    this.logger.log(
      `Certificate expiry sweep every ${this.sweepIntervalHours}h, warning window ${this.warningDays}d`,
    );
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Emit CERTIFICATE_EXPIRING for newly-in-window certificates. Returns the serials warned. */
  async sweep(): Promise<string[]> {
    const now = new Date();
    const horizon = new Date(now.getTime() + this.warningDays * DAY_MS);

    const expiring = await this.prisma.certificate.findMany({
      where: { isRevoked: false, validTo: { gt: now, lte: horizon } },
      select: { serial: true, subject: true, validTo: true, request: { select: { entityId: true } } },
    });

    if (expiring.length === 0) return [];

    // One warning per certificate per window — look back over the window itself.
    const windowStart = new Date(now.getTime() - this.warningDays * DAY_MS);
    const alreadyWarned = await this.prisma.auditLog.findMany({
      where: { event: AuditEvent.CERTIFICATE_EXPIRING, createdAt: { gte: windowStart } },
      select: { detail: true },
    });
    const warnedSerials = new Set(
      alreadyWarned
        .map((a) => (a.detail as { serial?: string } | null)?.serial)
        .filter((s): s is string => Boolean(s)),
    );

    const warned: string[] = [];
    for (const cert of expiring) {
      if (warnedSerials.has(cert.serial)) continue;
      const daysRemaining = Math.ceil((cert.validTo.getTime() - now.getTime()) / DAY_MS);
      await this.prisma.auditLog.create({
        data: {
          event: AuditEvent.CERTIFICATE_EXPIRING,
          entityId: cert.request?.entityId ?? null,
          detail: {
            serial: cert.serial,
            subject: cert.subject,
            validTo: cert.validTo.toISOString(),
            daysRemaining,
            warningWindowDays: this.warningDays,
          },
        },
      });
      warned.push(cert.serial);
    }

    if (warned.length > 0) {
      this.logger.warn(
        `${warned.length} certificate(s) expiring within ${this.warningDays} days: ${warned.join(', ')}`,
      );
    }
    return warned;
  }
}
