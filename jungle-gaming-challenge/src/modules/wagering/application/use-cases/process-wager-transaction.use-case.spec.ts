import { Money } from '../../../../shared/domain/value-objects/money.vo.js';
import { Wallet } from '../../../../shared/domain/entities/wallet.entity.js';
import { WalletId } from '../../../../shared/domain/value-objects/wallet-id.vo.js';

import { WagerTransactionKind } from '../../domain/enums/wager-transaction-kind.enum.js';
import { WagerTransactionStatus } from '../../domain/enums/wager-transaction-status.enum.js';

import { ProcessWagerTransactionUseCase } from './process-wager-transaction.use-case.js';

import { WagerFailureCode } from '../../domain/enums/wager-failure-code.enum.js';
import { WagerTransaction } from '../../domain/entities/wager-transaction.js';
import { IdempotencyConflictError } from '../errors/idempotency-conflict.error.js';

describe('ProcessWagerTransactionUseCase', () => {
    it('should process a BET successfully', async () => {
        const wallet = Wallet.rehydrate({
            id: WalletId.from('wallet-123'),
            playerId: 'player-123',
            currency: 'BRL',
            balance: Money.from({
                amount: '100.00',
                currency: 'BRL',
            }),
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const walletRepository = {
            findById: vi.fn().mockResolvedValue(wallet),
            add: vi.fn(),
            update: vi.fn().mockResolvedValue(true),
        };

        const walletLedgerRepository = {
            add: vi.fn(),
        };

        const wagerTransactionRepository = {
            findById: vi.fn(),
            findByIdempotencyKey: vi.fn().mockResolvedValue(null),
            findByProviderAndExternalTransactionId: vi.fn(),
            save: vi.fn(),
        };

        const unitOfWork = {
            execute: vi.fn(async (work) => work()),
        };

        const useCase = new ProcessWagerTransactionUseCase(
            walletRepository,
            walletLedgerRepository,
            wagerTransactionRepository,
            unitOfWork,
        );

        const result = await useCase.execute({
            providerId: 'provider-a',
            externalTransactionId: 'transaction-123',
            idempotencyKey: 'provider-a:transaction-123',
            payloadHash: 'hash-123',

            walletId: 'wallet-123',
            playerId: 'player-123',
            roundId: 'round-123',
            gameId: 'game-123',

            kind: WagerTransactionKind.Bet,

            amount: '25.00',
            currency: 'BRL',
        });

        expect(result.status).toBe(
            WagerTransactionStatus.Processed,
        );

        expect(result.balance).toBe('75.00');

        expect(result.currency).toBe('BRL');

        expect(result.idempotentReplay).toBe(false);

        expect(walletRepository.update)
            .toHaveBeenCalledOnce();

        expect(walletLedgerRepository.add)
            .toHaveBeenCalledOnce();

        expect(wagerTransactionRepository.save)
            .toHaveBeenCalledOnce();

        expect(unitOfWork.execute)
            .toHaveBeenCalledOnce();
    });

    it('should mark a transaction as processed', () => {
        const transaction = WagerTransaction.create({
            providerId: 'provider-a',
            externalTransactionId: 'transaction-123',
            idempotencyKey: 'provider-a:transaction-123',
            payloadHash: 'hash-123',
            walletId: WalletId.from('wallet-123'),
            playerId: 'player-123',
            roundId: 'round-123',
            gameId: 'game-123',
            kind: WagerTransactionKind.Bet,
            money: Money.from({
                amount: '25.00',
                currency: 'BRL',
            }),
        });

        const processedAt = new Date('2026-09-01T13:00:00.000Z');

        const resultingBalance = Money.from({
            amount: '75.00',
            currency: 'BRL',
        });

        transaction.markProcessed(
            undefined,
            Money.from({
                amount: '75.00',
                currency: 'BRL',
            }),
            processedAt,
        );

        expect(transaction.status).toBe(
            WagerTransactionStatus.Processed,
        );

        expect(transaction.processedAt).toEqual(processedAt);

        expect(transaction.resultingBalance?.toString())
            .toBe('75.00');
    });


    it('should reject the same idempotency key with a different payload', async () => {
        const existingTransaction = WagerTransaction.create({
            providerId: 'provider-a',
            externalTransactionId: 'transaction-123',
            idempotencyKey: 'provider-a:transaction-123',
            payloadHash: 'hash-original',
            walletId: WalletId.from('wallet-123'),
            playerId: 'player-123',
            roundId: 'round-123',
            gameId: 'game-123',
            kind: WagerTransactionKind.Bet,
            money: Money.from({
                amount: '25.00',
                currency: 'BRL',
            }),
        });

        const walletRepository = {
            findById: vi.fn(),
            add: vi.fn(),
            update: vi.fn(),
        };

        const walletLedgerRepository = {
            add: vi.fn(),
        };

        const wagerTransactionRepository = {
            findById: vi.fn(),

            findByIdempotencyKey: vi
                .fn()
                .mockResolvedValue(existingTransaction),

            findByProviderAndExternalTransactionId: vi.fn(),
            save: vi.fn(),
        };

        const unitOfWork = {
            execute: vi.fn(async (work) => work()),
        };

        const useCase = new ProcessWagerTransactionUseCase(
            walletRepository,
            walletLedgerRepository,
            wagerTransactionRepository,
            unitOfWork,
        );

        await expect(
            useCase.execute({
                providerId: 'provider-a',
                externalTransactionId: 'transaction-123',
                idempotencyKey: 'provider-a:transaction-123',

                payloadHash: 'hash-different',

                walletId: 'wallet-123',
                playerId: 'player-123',
                roundId: 'round-123',
                gameId: 'game-123',

                kind: WagerTransactionKind.Bet,

                amount: '25.00',
                currency: 'BRL',
            }),
        ).rejects.toBeInstanceOf(IdempotencyConflictError);

        expect(walletRepository.findById)
            .not.toHaveBeenCalled();

        expect(walletRepository.update)
            .not.toHaveBeenCalled();

        expect(walletLedgerRepository.add)
            .not.toHaveBeenCalled();

        expect(wagerTransactionRepository.save)
            .not.toHaveBeenCalled();
    });

    it('should retry after a wallet concurrency conflict', async () => {
        const firstWallet = Wallet.rehydrate({
            id: WalletId.from('wallet-123'),
            playerId: 'player-123',
            currency: 'BRL',
            balance: Money.from({
                amount: '100.00',
                currency: 'BRL',
            }),
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const secondWallet = Wallet.rehydrate({
            id: WalletId.from('wallet-123'),
            playerId: 'player-123',
            currency: 'BRL',
            balance: Money.from({
                amount: '20.00',
                currency: 'BRL',
            }),
            version: 2,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const walletRepository = {
            findById: vi
                .fn()
                .mockResolvedValueOnce(firstWallet)
                .mockResolvedValueOnce(secondWallet),

            add: vi.fn(),

            update: vi
                .fn()
                .mockResolvedValueOnce(false),
        };

        const walletLedgerRepository = {
            add: vi.fn(),
        };

        const wagerTransactionRepository = {
            findById: vi.fn(),

            findByIdempotencyKey: vi
                .fn()
                .mockResolvedValue(null),

            findByProviderAndExternalTransactionId: vi.fn(),

            save: vi.fn(),
        };

        const unitOfWork = {
            execute: vi.fn(async (work) => work()),
        };

        const useCase = new ProcessWagerTransactionUseCase(
            walletRepository,
            walletLedgerRepository,
            wagerTransactionRepository,
            unitOfWork,
        );

        const result = await useCase.execute({
            providerId: 'provider-a',
            externalTransactionId: 'transaction-123',
            idempotencyKey: 'provider-a:transaction-123',
            payloadHash: 'hash-123',

            walletId: 'wallet-123',
            playerId: 'player-123',
            roundId: 'round-123',
            gameId: 'game-123',

            kind: WagerTransactionKind.Bet,

            amount: '80.00',
            currency: 'BRL',
        });

        expect(result.status).toBe(
            WagerTransactionStatus.Rejected,
        );

        expect(result.balance).toBe('20.00');

        expect(walletRepository.findById)
            .toHaveBeenCalledTimes(2);

        expect(walletRepository.update)
            .toHaveBeenCalledOnce();

        expect(walletLedgerRepository.add)
            .not.toHaveBeenCalled();

        expect(wagerTransactionRepository.save)
            .toHaveBeenCalledOnce();

        expect(unitOfWork.execute)
            .toHaveBeenCalledTimes(2);
    });

    it('should reject a BET when wallet has insufficient funds', async () => {
        const wallet = Wallet.rehydrate({
            id: WalletId.from('wallet-123'),
            playerId: 'player-123',
            currency: 'BRL',
            balance: Money.from({
                amount: '20.00',
                currency: 'BRL',
            }),
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const walletRepository = {
            findById: vi.fn().mockResolvedValue(wallet),
            add: vi.fn(),
            update: vi.fn(),
        };

        const walletLedgerRepository = {
            add: vi.fn(),
        };

        const wagerTransactionRepository = {
            findById: vi.fn(),
            findByIdempotencyKey: vi.fn().mockResolvedValue(null),
            findByProviderAndExternalTransactionId: vi.fn(),
            save: vi.fn(),
        };

        const unitOfWork = {
            execute: vi.fn(async (work) => work()),
        };

        const useCase = new ProcessWagerTransactionUseCase(
            walletRepository,
            walletLedgerRepository,
            wagerTransactionRepository,
            unitOfWork,
        );

        const result = await useCase.execute({
            providerId: 'provider-a',
            externalTransactionId: 'transaction-123',
            idempotencyKey: 'provider-a:transaction-123',
            payloadHash: 'hash-123',
            walletId: 'wallet-123',
            playerId: 'player-123',
            roundId: 'round-123',
            gameId: 'game-123',
            kind: WagerTransactionKind.Bet,
            amount: '80.00',
            currency: 'BRL',
        });

        expect(result.status).toBe(
            WagerTransactionStatus.Rejected,
        );

        expect(result.balance).toBe('20.00');

        expect(walletRepository.update)
            .not.toHaveBeenCalled();

        expect(walletLedgerRepository.add)
            .not.toHaveBeenCalled();

        expect(wagerTransactionRepository.save)
            .toHaveBeenCalledOnce();

        const savedTransaction =
            wagerTransactionRepository.save.mock.calls[0][0];

        expect(savedTransaction.status).toBe(
            WagerTransactionStatus.Rejected,
        );

        expect(savedTransaction.failureCode).toBe(
            WagerFailureCode.InsufficientFunds,
        );
    });

;
    
});