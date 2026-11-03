import { Address } from '@ton/core';
import { prisma } from '../db.js';
import { tonClient, parseTonAddress } from './tonWalletService.js';
import { config } from '../config.js';

let cachedNgnPerTon = 1590;
let lastNgnRateFetch = 0;

export async function getNgnPerTon() {
  if (Date.now() - lastNgnRateFetch < 60_000) return cachedNgnPerTon;
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=ngn,usd', {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      const rate = data?.['the-open-network']?.ngn;
      if (typeof rate === 'number' && rate > 0) {
        cachedNgnPerTon = rate;
        lastNgnRateFetch = Date.now();
      }
    }
  } catch (err) {
    // Fall back to cached rate
  }
  return cachedNgnPerTon;
}

export async function calculateVoucherNano() {
  const ngnPerTon = await getNgnPerTon();
  // Voucher is 400% of 1000 Naira = 4000 Naira
  const tonAmount = 4000 / ngnPerTon;
  const nano = BigInt(Math.floor(tonAmount * 1e9));
  return nano.toString();
}

export async function getOrCreateUserWithVoucher(walletAddress) {
  const normalized = parseTonAddress(walletAddress);
  let user = await prisma.user.findUnique({ where: { walletAddress: normalized } });

  if (!user) {
    const initialVoucherNano = await calculateVoucherNano();
    user = await prisma.user.create({
      data: {
        walletAddress: normalized,
        voucherBalanceNano: initialVoucherNano,
        bonusBalanceNano: '0',
        temporaryBalanceNano: '0',
        kycStatus: 'verified',
        ageVerified: true,
        termsAccepted: true,
      },
    });

    await prisma.transaction.create({
      data: {
        walletAddress: normalized,
        txHash: `voucher_signup_${normalized.slice(0, 8)}_${Date.now()}`,
        kind: 'voucher',
        amountNano: initialVoucherNano,
        status: 'confirmed',
      },
    });
  }

  return user;
}

export async function checkAndCreditDeposits(walletAddress) {
  const normalized = parseTonAddress(walletAddress);
  const user = await prisma.user.findUnique({ where: { walletAddress: normalized } });
  if (!user) return;

  try {
    const txs = await tonClient.getTransactions(Address.parse(normalized), { limit: 20 });
    const voucherRecreditNano = await calculateVoucherNano();

    for (const tx of txs) {
      const inMsg = tx.inMessage;
      if (!inMsg || inMsg.info.type !== 'internal') continue;
      const txHash = tx.hash().toString('hex');

      // Check if already processed
      const existing = await prisma.transaction.findUnique({ where: { txHash } });
      if (existing) continue;

      const coins = inMsg.info.value.coins;
      if (coins <= 0n) continue;

      // Ignore incoming refunds from escrow contract
      const srcAddr = inMsg.info.src.toString({ urlSafe: true, bounceable: false });
      if (config.escrowContractAddress && srcAddr === parseTonAddress(config.escrowContractAddress)) {
        continue;
      }

      // Valid deposit! Credit 100% deposit bonus + 400% voucher logic
      const depositNano = coins.toString();
      const currentBonus = BigInt(user.bonusBalanceNano || '0');
      const currentVoucher = BigInt(user.voucherBalanceNano || '0');

      const newBonus = (currentBonus + coins).toString();
      const newVoucher = (currentVoucher + BigInt(voucherRecreditNano)).toString();

      await prisma.$transaction([
        prisma.user.update({
          where: { walletAddress: normalized },
          data: {
            bonusBalanceNano: newBonus,
            voucherBalanceNano: newVoucher,
            lastDepositTxHash: txHash,
            lastDepositCheckedAt: new Date(),
          },
        }),
        prisma.transaction.create({
          data: {
            walletAddress: normalized,
            txHash,
            kind: 'deposit',
            amountNano: depositNano,
            status: 'confirmed',
          },
        }),
        prisma.transaction.create({
          data: {
            walletAddress: normalized,
            txHash: `bonus_${txHash}`,
            kind: 'bonus',
            amountNano: depositNano,
            status: 'confirmed',
          },
        }),
      ]);
    }
  } catch (err) {
    console.warn(`Deposit check failed for ${normalized}:`, err.message);
  }
}
