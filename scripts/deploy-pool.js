import solc from 'solc';
import { readFile } from 'node:fs/promises';
import { ContractFactory, JsonRpcProvider, Wallet, getAddress } from 'ethers';

const rpc=process.env.RPC_URL, key=process.env.DEPLOYER_PRIVATE_KEY, resolver=process.env.RESOLVER_ADDRESS;
const firstToken=(process.env.BETTING_TOKENS||'').split(',')[0]?.split(':')[1]||process.env.TOKEN_ADDRESS;
if(!rpc||!key||!resolver||!firstToken)throw Error('Set RPC_URL, DEPLOYER_PRIVATE_KEY, RESOLVER_ADDRESS, and BETTING_TOKENS in .env.');
const provider=new JsonRpcProvider(rpc);const wallet=new Wallet(key,provider);
const expected=Number(process.env.CHAIN_ID||8453), network=await provider.getNetwork();if(Number(network.chainId)!==expected)throw Error(`RPC chain mismatch. Expected ${expected}; got ${network.chainId}.`);
const source=await readFile(new URL('../contracts/BettingPool.sol',import.meta.url),'utf8');
const input={language:'Solidity',sources:{'BettingPool.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}};
const output=JSON.parse(solc.compile(JSON.stringify(input)));const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw Error(errors.map(e=>e.formattedMessage).join('\n'));
const artifact=output.contracts['BettingPool.sol'].BettingPool;
const factory=new ContractFactory(artifact.abi,artifact.evm.bytecode.object,wallet);
const contract=await factory.deploy(getAddress(firstToken),getAddress(resolver));const receipt=await contract.deploymentTransaction().wait(2);
console.log(JSON.stringify({address:await contract.getAddress(),admin:wallet.address,resolver:getAddress(resolver),token:getAddress(firstToken),chainId:expected,deployTx:receipt.hash},null,2));
