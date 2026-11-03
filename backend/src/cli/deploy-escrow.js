import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Address, beginCell, Cell, toNano } from '@ton/core';
import { TonClient, WalletContractV4, internal } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import dotenv from 'dotenv';

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) });

async function main() {
  console.log('=== TON MAINNET ESCROW CONTRACT DEPLOYMENT ===');
  const artifactPath = fileURLToPath(new URL('../../contracts/BettingPool.json', import.meta.url));
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8'));

  const adminWallet = process.env.ADMIN_MAINNET_WALLET;
  if (!adminWallet) {
    console.error('ERROR: ADMIN_MAINNET_WALLET must be set in .env');
    process.exit(1);
  }

  const adminAddr = Address.parse(adminWallet);
  const codeCell = Cell.fromBase64(artifact.codeBoc64);

  // Storage: ownerAddress, adminWallet, paused (bool), reserved (coins), markets (dict), bets (dict)
  const dataCell = beginCell()
    .storeAddress(adminAddr)
    .storeAddress(adminAddr)
    .storeBit(0) // paused = false
    .storeCoins(0) // reserved = 0
    .storeMaybeRef(null) // markets dict
    .storeMaybeRef(null) // bets dict
    .endCell();

  const stateInit = { code: codeCell, data: dataCell };
  const stateInitCell = beginCell()
    .storeBit(0) // split_depth
    .storeBit(0) // special
    .storeBit(1) // code present
    .storeRef(codeCell)
    .storeBit(1) // data present
    .storeRef(dataCell)
    .storeBit(0) // library
    .endCell();

  const contractAddress = new Address(0, stateInitCell.hash());
  console.log('\nContract StateInit Calculated:');
  console.log('Mainnet Address (Non-bounceable):', contractAddress.toString({ bounceable: false, urlSafe: true }));
  console.log('Mainnet Address (Bounceable):', contractAddress.toString({ bounceable: true, urlSafe: true }));
  console.log('Admin Wallet:', adminAddr.toString({ bounceable: false, urlSafe: true }));
  console.log('\nTo deploy manually: Send at least 50.5 TON to this address with the above StateInit.');
  console.log('Set in your .env:');
  console.log(`ESCROW_CONTRACT_ADDRESS=${contractAddress.toString({ bounceable: false, urlSafe: true })}`);
  console.log('MIN_RESERVE_TON=50');
}

main().catch(err => {
  console.error('Deployment script failed:', err);
  process.exit(1);
});
