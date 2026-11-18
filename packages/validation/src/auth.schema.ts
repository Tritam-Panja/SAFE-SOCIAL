import { z } from 'zod';
import { AgeGroup, UserRole } from '@fizzy/shared-types';

export const registerChildSchema = z.object({
  role: z.literal(UserRole.CHILD),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters').max(30),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  birthDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Valid birthDate (YYYY-MM-DD) required' }),
  parentEmail: z.string().email('Valid parent email is required').optional(),
});

export const registerParentSchema = z.object({
  role: z.literal(UserRole.PARENT),
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters').max(30),
  email: z.string().email('Valid email is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  phoneNumber: z.string().optional(),
});

export const registerSchema = z.discriminatedUnion('role', [
  registerChildSchema,
  registerParentSchema,
]);

export const loginSchema = z.object({
  usernameOrEmail: z.string().min(3, 'Username or email is required'),
  password: z.string().min(1, 'Password is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
