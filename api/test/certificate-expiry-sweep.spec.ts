import { CertificateLifecycleService } from '../src/certificate/certificate-lifecycle.service';

const DAY = 86_400_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);

type Warned = { event: string; entityId: string | null; detail: Record<string, unknown> };

/**
 * The sweep must warn about a certificate once per window, not once per restart
 * — otherwise a service that restarts often floods the audit log and operators
 * stop reading it.
 */
function stubPrisma(opts: {
  expiring: Array<{ serial: string; validTo: Date; entityId?: string | null }>;
  alreadyWarned?: string[];
}) {
  const created: Warned[] = [];
  return {
    created,
    prisma: {
      certificate: {
        findMany: jest.fn().mockResolvedValue(
          opts.expiring.map((c) => ({
            serial: c.serial,
            subject: `CN=${c.serial}`,
            validTo: c.validTo,
            request: { entityId: c.entityId ?? null },
          })),
        ),
      },
      auditLog: {
        findMany: jest
          .fn()
          .mockResolvedValue((opts.alreadyWarned ?? []).map((serial) => ({ detail: { serial } }))),
        create: jest.fn().mockImplementation(async ({ data }: { data: Warned }) => {
          created.push(data);
          return data;
        }),
      },
    } as any,
  };
}

describe('CertificateLifecycleService.sweep', () => {
  const original = process.env.CERT_EXPIRY_WARNING_DAYS;

  beforeEach(() => {
    process.env.CERT_EXPIRY_WARNING_DAYS = '30';
  });

  afterAll(() => {
    if (original === undefined) delete process.env.CERT_EXPIRY_WARNING_DAYS;
    else process.env.CERT_EXPIRY_WARNING_DAYS = original;
  });

  it('warns once for each certificate entering the window', async () => {
    const { prisma, created } = stubPrisma({
      expiring: [
        { serial: '1001', validTo: inDays(10), entityId: 'entity-a' },
        { serial: '1002', validTo: inDays(25), entityId: 'entity-b' },
      ],
    });

    const warned = await new CertificateLifecycleService(prisma).sweep();

    expect(warned).toEqual(['1001', '1002']);
    expect(created).toHaveLength(2);
    expect(created[0].event).toBe('CERTIFICATE_EXPIRING');
    expect(created[0].entityId).toBe('entity-a');
    expect(created[0].detail).toMatchObject({ serial: '1001', warningWindowDays: 30 });
  });

  it('does not warn twice about the same certificate in one window', async () => {
    const { prisma, created } = stubPrisma({
      expiring: [
        { serial: '1001', validTo: inDays(10) },
        { serial: '1002', validTo: inDays(12) },
      ],
      alreadyWarned: ['1001'],
    });

    const warned = await new CertificateLifecycleService(prisma).sweep();

    expect(warned).toEqual(['1002']);
    expect(created).toHaveLength(1);
  });

  it('writes nothing when no certificate is in the window', async () => {
    const { prisma, created } = stubPrisma({ expiring: [] });

    expect(await new CertificateLifecycleService(prisma).sweep()).toEqual([]);
    expect(created).toHaveLength(0);
    // A quiet sweep must not even look for prior warnings.
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('reports days remaining, rounded up', async () => {
    const { prisma, created } = stubPrisma({
      expiring: [{ serial: '1003', validTo: new Date(Date.now() + 5 * DAY + 3600_000) }],
    });

    await new CertificateLifecycleService(prisma).sweep();

    expect(created[0].detail.daysRemaining).toBe(6);
  });

  it('honours a widened warning window', async () => {
    process.env.CERT_EXPIRY_WARNING_DAYS = '400';
    const { prisma, created } = stubPrisma({
      expiring: [{ serial: '1004', validTo: inDays(398) }],
    });

    await new CertificateLifecycleService(prisma).sweep();

    expect(created[0].detail).toMatchObject({ warningWindowDays: 400, daysRemaining: 398 });
  });
});
