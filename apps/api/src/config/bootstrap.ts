import { prisma } from '../prisma.js';
import { config } from '../config/index.js';
import { SessionService } from '../modules/auth/session.service.js';
import { UserRole } from '../generated/prisma-client/index.js';

export async function bootstrapAdmin(): Promise<void> {
  const { username, email, password, displayName } = config.adminBootstrap;

  const existingAdmin = await prisma.user.findFirst({
    where: {
      OR: [{ username }, { email }, { role: UserRole.ADMIN }],
    },
  });

  if (!existingAdmin) {
    const passwordHash = await SessionService.hashPassword(password);
    await prisma.user.create({
      data: {
        username,
        email,
        displayName,
        passwordHash,
        role: UserRole.ADMIN,
        isVerified: true,
        bio: 'Fizzy Safety Team Administrator & Chief Guardian',
      },
    });
    console.log(`[Bootstrap] Created initial platform administrator: ${username} (${email})`);
  }
}
