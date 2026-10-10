import bcrypt from 'bcrypt';
import crypto from 'node:crypto';
import { AppError, assertFound } from '../../shared/errors.js';
import { config } from '../../config/index.js';
import { withTransaction } from '../../db/transaction.js';
import { now } from '../../shared/clock.js';
import { createAuditService } from '../../shared/audit.js';

const BCRYPT_COST = 12;

function hashStudentIdentifier(studentIdentifier) {
  return crypto.createHmac('sha256', config.VERIFICATION_HASH_KEY).update(studentIdentifier).digest('hex');
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phoneE164: user.phoneE164 ?? null,
    isActive: user.isActive,
  };
}

export function createAuthService({ authRepository, verificationAdapter, clubsModule, auditRepository }) {
  const audit = createAuditService(auditRepository);

  function validatePassword(email, password) {
    if (!password || password.length < 8) {
      throw new AppError('WEAK_PASSWORD', 400, 'Password must be at least 8 characters');
    }
    if (password.toLowerCase() === email.toLowerCase()) {
      throw new AppError('WEAK_PASSWORD', 400, 'Password must not equal email');
    }
  }

  return {
    async register(dto) {
      validatePassword(dto.email, dto.password);
      const existing = await authRepository.findUserByEmail(dto.email);
      if (existing) {
        throw new AppError('EMAIL_TAKEN', 409, 'Email already registered');
      }
      const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);
      const user = await authRepository.insertUser(
        {
          email: dto.email,
          full_name: dto.fullName,
          phone_e164: dto.phoneE164 ?? null,
          password_hash: passwordHash,
          is_active: true,
        },
        authRepository.db,
      );
      return publicUser(user);
    },

    async login(email, password) {
      const user = await authRepository.findUserWithPasswordByEmail(email);
      if (!user) {
        throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
      }
      if (!user.isActive) {
        throw new AppError('ACCOUNT_INACTIVE', 403, 'Account inactive');
      }
      return publicUser(user);
    },

    async getMe(userId) {
      const user = await authRepository.findUserById(userId);
      assertFound(user, 'User not found');
      const capabilities = await clubsModule.getCapabilities(userId);
      const verification = await authRepository.getCurrentVerification(userId);
      const verifiedStudent = verification?.outcome === 'VERIFIED';
      return {
        user: publicUser(user),
        capabilities: { ...capabilities, verifiedStudent },
      };
    },

    async updateProfile(userId, patch) {
      const updated = await authRepository.updateUser(userId, patch);
      return publicUser(updated);
    },

    async submitCollegeVerification(userId, dto, requestId) {
      const since = new Date(now().getTime() - 60 * 60 * 1000);
      const count = await authRepository.countVerificationsSince(userId, since);
      if (count >= 5) {
        throw new AppError('VERIFICATION_RATE_LIMITED', 429, 'Too many verification attempts');
      }

      const adapterResult = await Promise.race([
        verificationAdapter.verify({
          studentIdentifier: dto.studentIdentifier,
          fullName: dto.fullName,
        }),
        new Promise((resolve) => setTimeout(() => resolve({ outcome: 'UNAVAILABLE' }), 5000)),
      ]);

      if (adapterResult.outcome === 'UNAVAILABLE') {
        await withTransaction(async (trx) => {
          await authRepository.insertVerification(
            {
              user_id: userId,
              outcome: 'UNAVAILABLE',
              student_identifier_hash: hashStudentIdentifier(dto.studentIdentifier),
              adapter: config.COLLEGE_VERIFICATION_MODE,
              checked_at: now(),
            },
            trx,
          );
        });
        throw new AppError('VERIFICATION_UNAVAILABLE', 503, 'Verification service unavailable');
      }

      try {
        return await withTransaction(async (trx) => {
          await authRepository.supersedeCurrentVerification(userId, trx);
          const row = await authRepository.insertVerification(
            {
              user_id: userId,
              outcome: adapterResult.outcome,
              student_identifier_hash: hashStudentIdentifier(dto.studentIdentifier),
              adapter: config.COLLEGE_VERIFICATION_MODE,
              external_reference: adapterResult.externalReference ?? null,
              checked_at: now(),
            },
            trx,
          );
          await audit.record(trx, {
            actorUserId: userId,
            action: 'COLLEGE_VERIFICATION',
            entityType: 'college_verification',
            entityId: row.id,
            requestId,
          });
          return { outcome: row.outcome, checkedAt: row.checkedAt };
        });
      } catch (err) {
        if (err.code === '23505') {
          throw new AppError('STUDENT_ID_ALREADY_LINKED', 409, 'Student ID already linked to another account');
        }
        throw err;
      }
    },

    async getCollegeVerificationStatus(userId) {
      const current = await authRepository.getCurrentVerification(userId);
      if (!current) return { status: 'NONE', checkedAt: null };
      if (current.outcome === 'VERIFIED') return { status: 'VERIFIED', checkedAt: current.checkedAt };
      if (current.outcome === 'NOT_VERIFIED') return { status: 'NOT_VERIFIED', checkedAt: current.checkedAt };
      return { status: 'NONE', checkedAt: null };
    },

    async isVerifiedStudent(userId) {
      const current = await authRepository.getCurrentVerification(userId);
      return current?.outcome === 'VERIFIED';
    },

    async getUserPublic(userId) {
      const user = await authRepository.findUserById(userId);
      return user ? publicUser(user) : null;
    },
  };
}
