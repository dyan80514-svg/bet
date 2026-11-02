import { Contract, JsonRpcProvider, Wallet, parseUnits, getAddress, keccak256, toUtf8Bytes } from 'ethers';

const [command,...args]=process.argv.slice(2);const provider=new JsonRpcProvider(process.env.RPC_URL);
const address=process.env.BETTING_CONTRACT_ADDRESS;if(!address)throw Error('Set BETTING_CONTRACT_ADDRESS in .env.');
const abi=['function resolver() view returns(address)','function admin() view returns(address)','function setMarketOdds(bytes32,uint8,uint32[],uint64)','function resolve(bytes32,uint8)','function settleBet(bytes32,uint256)','function setToken(address,bool)','function fundBonusPool(address,uint256)','function withdrawTreasury(address,uint256)','event BetSettled(bytes32 indexed marketId,uint256 indexed betId,address indexed bettor,bool won,uint256 payout)'];
const contract=new Contract(address,abi,provider);const marketId=id=>keccak256(toUtf8Bytes(id));
function signerFor(role){const key=role==='admin'?process.env.ADMIN_PRIVATE_KEY:process.env.RESOLVER_PRIVATE_KEY;if(!key)throw Error(`Set ${role==='admin'?'ADMIN':'RESOLVER'}_PRIVATE_KEY in the secure operator environment.`);return new Wallet(key,provider)}
async function main(){
 if(command==='set-odds'){
  const [eventId,raw,rawClose]=args;if(!eventId||!raw||!rawClose)throw Error('Usage: npm run operator -- set-odds "ODDS_API_EVENT_ID" 2.10,3.30 UNIX_CLOSE_TIME');const values=raw.split(',').map(Number),closesAt=BigInt(rawClose);if(values.length<2||values.length>8||values.some(v=>!Number.isFinite(v)||v<1||v>100)||closesAt<=BigInt(Math.floor(Date.now()/1000)))throw Error('Provide 2–8 decimal odds from 1.00 to 100.00 and a future Unix close time.');const odds=values.map(v=>Math.round(v*10000));const wallet=signerFor('resolver');if((await contract.resolver()).toLowerCase()!==wallet.address.toLowerCase())throw Error('Resolver key does not match deployed resolver.');const tx=await contract.connect(wallet).setMarketOdds(marketId(eventId),odds.length,odds,closesAt);console.log(`Odds update sent: ${tx.hash}`);await tx.wait();return;
 }
 if(command==='resolve'){
  const [eventId,result]=args;if(!eventId||result===undefined)throw Error('Usage: npm run operator -- resolve "ODDS_API_EVENT_ID" OUTCOME_INDEX');const wallet=signerFor('resolver');if((await contract.resolver()).toLowerCase()!==wallet.address.toLowerCase())throw Error('Resolver key does not match deployed resolver.');const tx=await contract.connect(wallet).resolve(marketId(eventId),Number(result));console.log(`Result sent: ${tx.hash}`);await tx.wait();return;
 }
 if(command==='settle'){
  const [eventId,betId]=args;if(!eventId||betId===undefined)throw Error('Usage: npm run operator -- settle "ODDS_API_EVENT_ID" BET_ID');const wallet=signerFor('resolver');const tx=await contract.connect(wallet).settleBet(marketId(eventId),BigInt(betId));console.log(`Bet settlement sent: ${tx.hash}`);await tx.wait();return;
 }
 if(command==='enable-token'){
  const [token,enabled]=args;if(!token||!['true','false'].includes(enabled))throw Error('Usage: npm run operator -- enable-token TOKEN_ADDRESS true|false');const wallet=signerFor('admin');if((await contract.admin()).toLowerCase()!==wallet.address.toLowerCase())throw Error('Admin key does not match deployed admin.');const tx=await contract.connect(wallet).setToken(getAddress(token),enabled==='true');console.log(`Token update sent: ${tx.hash}`);await tx.wait();return;
 }
 if(command==='fund-bonus'){
  const [token,amount]=args;if(!token||!amount)throw Error('Usage: npm run operator -- fund-bonus TOKEN_ADDRESS AMOUNT');const wallet=signerFor('admin');if((await contract.admin()).toLowerCase()!==wallet.address.toLowerCase())throw Error('Admin key does not match deployed admin.');const erc20=new Contract(token,['function decimals() view returns(uint8)','function approve(address,uint256) returns(bool)'],wallet);const units=parseUnits(amount,await erc20.decimals());const approval=await erc20.approve(address,units);await approval.wait();const tx=await contract.connect(wallet).fundBonusPool(token,units);console.log(`Bonus funding sent: ${tx.hash}`);await tx.wait();return;
 }
 if(command==='withdraw-treasury'){
  const [token,amount]=args;if(!token||!amount)throw Error('Usage: npm run operator -- withdraw-treasury TOKEN_ADDRESS AMOUNT');const wallet=signerFor('admin');if((await contract.admin()).toLowerCase()!==wallet.address.toLowerCase())throw Error('Admin key does not match deployed admin.');const erc20=new Contract(token,['function decimals() view returns(uint8)'],provider);const units=parseUnits(amount,await erc20.decimals());const tx=await contract.connect(wallet).withdrawTreasury(token,units);console.log(`Treasury withdrawal sent: ${tx.hash}`);await tx.wait();return;
 }
 throw Error('Commands: set-odds, resolve, settle, enable-token, fund-bonus, withdraw-treasury');
}
await main();
