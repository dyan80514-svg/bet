import { useTonConnectUI, useTonAddress, useTonWallet } from '@tonconnect/ui-react';

export { useTonConnectUI, useTonAddress, useTonWallet };

export function useTonConnect() {
  const connectedAddress = useTonAddress();
  const wallet = useTonWallet();
  return { connectedAddress, wallet };
}
