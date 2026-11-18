import { PrismaClient, AgeGroup } from './generated/prisma-client/index.js';

export const prisma = new PrismaClient();

/**
 * Calculates developmental age group tier from birth date.
 * JUNIOR: 6-8 years
 * EXPLORER: 9-12 years
 * TEEN: 13-17 years
 */
export function calculateAgeGroup(birthDate: Date): AgeGroup {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  if (age < 6) {
    throw new Error('Children under 6 years of age cannot register.');
  } else if (age <= 8) {
    return AgeGroup.JUNIOR;
  } else if (age <= 12) {
    return AgeGroup.EXPLORER;
  } else if (age <= 17) {
    return AgeGroup.TEEN;
  } else {
    throw new Error('Child accounts are only for users aged 6 to 17.');
  }
}
