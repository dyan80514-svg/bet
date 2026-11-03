import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { TonClient, WalletContractV4, internal, toNano } from '@ton/ton';
import { Address } from '@ton/core';
import {
  generateNewWallet,
  importWalletFromWords,
  encryptMnemonic,
  decryptMnemonic,
  saveWalletToStorage,
  loadWalletFromStorage,
  clearWalletFromStorage,
} from '../services/walletCrypto.js';
import { api, json } from '../api.js';

const InBuiltWalletContext = createContext(null);

const TON_ENDPOINT = 'https://toncenter.com/api/v2/jsonRPC';

export function InBuiltWalletProvider({ children }) {
  const [stored, setStored] = useState(() => loadWalletFromStorage());
  const [address, setAddress] = useState(() => stored?.address || '');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const keyPairRef = useRef(null);
  const contractRef = useRef(null);

  const tonClient = useRef(new TonClient({ endpoint: TON_ENDPOINT }));

  const refreshSummary = useCallback(async (targetAddr) => {
    const addr = targetAddr || address;
    if (!addr) return;
    try {
      const data = await api(`/wallet/summary/${encodeURIComponent(addr)}`);
      setSummary(data);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [address]);

  useEffect(() => {
    if (address) {
      refreshSummary(address);
      const timer = setInterval(() => refreshSummary(address), 15000);
      return () => clearInterval(timer);
    }
  }, [address, refreshSummary]);

  const createWallet = async (password) => {
    setLoading(true);
    setError('');
    try {
      const { words, keyPair, contract, address: newAddr } = await generateNewWallet();
      const encrypted = await encryptMnemonic(words, password);
      saveWalletToStorage(newAddr, encrypted);
      setStored({ address: newAddr, payload: encrypted });
      setAddress(newAddr);

      keyPairRef.current = keyPair;
      contractRef.current = contract;
      setIsUnlocked(true);

      await refreshSummary(newAddr);
      return { words, address: newAddr };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const importWallet = async (words, password) => {
    setLoading(true);
    setError('');
    try {
      const { keyPair, contract, address: newAddr } = await importWalletFromWords(words);
      const encrypted = await encryptMnemonic(words, password);
      saveWalletToStorage(newAddr, encrypted);
      setStored({ address: newAddr, payload: encrypted });
      setAddress(newAddr);

      keyPairRef.current = keyPair;
      contractRef.current = contract;
      setIsUnlocked(true);

      await refreshSummary(newAddr);
      return { address: newAddr };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const unlock = async (password) => {
    if (!stored?.payload) throw new Error('NO_STORED_WALLET');
    setLoading(true);
    setError('');
    try {
      const words = await decryptMnemonic(stored.payload, password);
      const { keyPair, contract } = await importWalletFromWords(words);
      keyPairRef.current = keyPair;
      contractRef.current = contract;
      setIsUnlocked(true);
      return true;
    } catch (err) {
      setError('Incorrect password');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const lock = () => {
    keyPairRef.current = null;
    contractRef.current = null;
    setIsUnlocked(false);
  };

  const logout = () => {
    lock();
    clearWalletFromStorage();
    setStored(null);
    setAddress('');
    setSummary(null);
  };

  const sendTon = async ({ to, amountTon, payload = null }) => {
    if (!isUnlocked || !keyPairRef.current) {
      throw new Error('WALLET_LOCKED_PLEASE_UNLOCK');
    }
    const client = tonClient.current;
    const contract = contractRef.current;
    const openedContract = client.open(contract);

    let seqno = 0;
    try {
      seqno = await openedContract.getSeqno();
    } catch {
      seqno = 0;
    }

    const transfer = contract.createTransfer({
      seqno,
      secretKey: keyPairRef.current.secretKey,
      sendMode: 3,
      messages: [
        internal({
          to: Address.parse(to),
          value: toNano(amountTon),
          bounce: false,
          body: payload || undefined,
        }),
      ],
    });

    await client.sendExternalMessage(contract, transfer);
    return transfer.hash().toString('hex');
  };

  return (
    <InBuiltWalletContext.Provider
      value={{
        isCreated: Boolean(stored?.address),
        address,
        isUnlocked,
        keyPair: keyPairRef.current,
        contract: contractRef.current,
        summary,
        loading,
        error,
        createWallet,
        importWallet,
        unlock,
        lock,
        logout,
        refreshSummary,
        sendTon,
      }}
    >
      {children}
    </InBuiltWalletContext.Provider>
  );
}

export function useInBuiltWallet() {
  const ctx = useContext(InBuiltWalletContext);
  if (!ctx) throw new Error('useInBuiltWallet must be used within InBuiltWalletProvider');
  return ctx;
}
