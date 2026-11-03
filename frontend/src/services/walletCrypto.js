import { mnemonicNew, mnemonicValidate, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';

const STORAGE_KEY = 'fairplay_ton_inbuilt_wallet_v1';

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export async function encryptMnemonic(words, password) {
  const mnemonicStr = words.join(' ');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(mnemonicStr)
  );

  return {
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    cipher: bytesToHex(new Uint8Array(encrypted)),
  };
}

export async function decryptMnemonic(payload, password) {
  try {
    const salt = hexToBytes(payload.salt);
    const iv = hexToBytes(payload.iv);
    const cipher = hexToBytes(payload.cipher);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );

    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      cipher
    );

    const mnemonicStr = new TextDecoder().decode(decrypted);
    return mnemonicStr.trim().split(/\s+/);
  } catch (err) {
    throw new Error('INCORRECT_PASSWORD_OR_CORRUPTED_KEY');
  }
}

export async function generateNewWallet() {
  const words = await mnemonicNew(24);
  const keyPair = await mnemonicToPrivateKey(words);
  const contract = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const address = contract.address.toString({ bounceable: false, urlSafe: true });
  return { words, keyPair, contract, address };
}

export async function importWalletFromWords(words) {
  const valid = await mnemonicValidate(words);
  if (!valid) throw new Error('INVALID_MNEMONIC_PHRASE');
  const keyPair = await mnemonicToPrivateKey(words);
  const contract = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const address = contract.address.toString({ bounceable: false, urlSafe: true });
  return { words, keyPair, contract, address };
}

export function saveWalletToStorage(address, encryptedPayload) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ address, payload: encryptedPayload }));
}

export function loadWalletFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearWalletFromStorage() {
  localStorage.removeItem(STORAGE_KEY);
}
