// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20BetToken {
    function transfer(address to,uint256 amount) external returns(bool);
    function transferFrom(address from,address to,uint256 amount) external returns(bool);
    function balanceOf(address account) external view returns(uint256);
}

/// @notice Multi-token fixed-odds pool. Users sign wallet-funded wagers and
/// withdrawals. Winners are credited to withdrawable site balance at settlement.
/// Outcomes are finalized by the resolver. Promotional credits are noncashable.
contract BettingPool {
    address public immutable admin;
    address public immutable resolver;
    uint32 public constant MIN_ODDS_BPS=10_000;
    uint32 public constant MAX_ODDS_BPS=1_000_000;
    uint16 public constant DEPOSIT_BONUS_BPS=40_000;
    mapping(address=>bool) public supportedToken;
    mapping(address=>mapping(address=>uint256)) public cashBalance;
    mapping(address=>mapping(address=>uint256)) public bonusBalance;
    mapping(address=>uint256) public totalCashBalances;
    mapping(address=>uint256) public reservedPayouts;
    mapping(address=>uint256) public bonusBudget;
    mapping(address=>uint256) public treasury;
    uint256 private entered=1;

    struct Market{uint8 outcomeCount;uint8 result;bool resolved;uint64 closesAt;}
    struct Bet{address bettor;address token;uint8 selection;uint32 oddsBps;uint128 stake;uint128 walletStake;uint128 accountStake;uint128 bonusStake;bool settled;}
    struct BetRef{bytes32 marketId;uint256 betId;}
    mapping(bytes32=>Market) public markets;
    mapping(bytes32=>mapping(uint8=>uint32)) public marketOddsBps;
    mapping(bytes32=>Bet[]) private marketBets;
    mapping(address=>BetRef[]) private userBetRefs;

    event TokenSupportChanged(address indexed token,bool supported);
    event BonusPoolFunded(address indexed token,address indexed funder,uint256 amount);
    event Deposited(address indexed token,address indexed user,uint256 amount,uint256 bonus);
    event Withdrawn(address indexed token,address indexed user,uint256 amount);
    event MarketOpened(bytes32 indexed marketId,uint8 outcomeCount);
    event MarketOddsSet(bytes32 indexed marketId,uint8 outcomeIndex,uint32 oddsBps);
    event BetPlaced(bytes32 indexed marketId,uint256 indexed betId,address indexed bettor,address token,uint8 selection,uint256 stake,uint32 oddsBps,uint256 walletStake,uint256 accountStake,uint256 bonusStake);
    event MarketResolved(bytes32 indexed marketId,uint8 result);
    event BetSettled(bytes32 indexed marketId,uint256 indexed betId,address indexed bettor,bool won,uint256 payout);
    event TreasuryWithdrawn(address indexed token,address indexed admin,uint256 amount);

    error Unauthorized();error InvalidMarket();error InvalidBet();error AlreadyResolved();error InsufficientBalance();error InsufficientBankroll();error TransferFailed();error Insolvent();
    constructor(address firstToken,address resolverAddress){require(firstToken!=address(0)&&resolverAddress!=address(0),"zero address");admin=msg.sender;resolver=resolverAddress;supportedToken[firstToken]=true;emit TokenSupportChanged(firstToken,true);}
    modifier onlyAdmin(){if(msg.sender!=admin)revert Unauthorized();_;}
    modifier nonReentrant(){require(entered==1,"reentrant call");entered=2;_;entered=1;}

    function setToken(address token,bool supported) external onlyAdmin{if(token==address(0))revert InvalidBet();supportedToken[token]=supported;emit TokenSupportChanged(token,supported);}
    function fundBonusPool(address token,uint256 amount) external nonReentrant{if(!supportedToken[token]||amount==0||!IERC20BetToken(token).transferFrom(msg.sender,address(this),amount))revert TransferFailed();bonusBudget[token]+=amount;emit BonusPoolFunded(token,msg.sender,amount);}
    function deposit(address token,uint128 amount) external nonReentrant{if(!supportedToken[token]||amount==0||!IERC20BetToken(token).transferFrom(msg.sender,address(this),amount))revert TransferFailed();uint256 bonus=uint256(amount)*DEPOSIT_BONUS_BPS/10_000;if(bonus>bonusBudget[token])revert InsufficientBankroll();bonusBudget[token]-=bonus;cashBalance[token][msg.sender]+=amount;bonusBalance[token][msg.sender]+=bonus;totalCashBalances[token]+=amount;emit Deposited(token,msg.sender,amount,bonus);}
    function withdraw(address token,uint128 amount) external nonReentrant{if(!supportedToken[token]||amount==0||amount>cashBalance[token][msg.sender])revert InsufficientBalance();cashBalance[token][msg.sender]-=amount;totalCashBalances[token]-=amount;if(IERC20BetToken(token).balanceOf(address(this))<totalCashBalances[token]+reservedPayouts[token])revert Insolvent();if(!IERC20BetToken(token).transfer(msg.sender,amount))revert TransferFailed();emit Withdrawn(token,msg.sender,amount);}

    /// walletStake is pulled from the connected wallet after its approval;
    /// accountStake is debited from cashBalance; bonusStake consumes promo credit.
    function setMarketOdds(bytes32 marketId,uint8 outcomeCount,uint32[] calldata odds,uint64 closesAt) external{if(msg.sender!=resolver)revert Unauthorized();if(outcomeCount<2||outcomeCount>8||odds.length!=outcomeCount)revert InvalidMarket();Market storage m=markets[marketId];if(m.resolved)revert AlreadyResolved();if(m.outcomeCount==0){if(closesAt<=block.timestamp)revert InvalidMarket();m.outcomeCount=outcomeCount;m.closesAt=closesAt;emit MarketOpened(marketId,outcomeCount);}else if(m.outcomeCount!=outcomeCount||m.closesAt!=closesAt)revert InvalidMarket();for(uint8 i;i<outcomeCount;i++){if(odds[i]<MIN_ODDS_BPS||odds[i]>MAX_ODDS_BPS)revert InvalidBet();marketOddsBps[marketId][i]=odds[i];emit MarketOddsSet(marketId,i,odds[i]);}}
    function placeBet(address token,bytes32 marketId,uint8 outcomeCount,uint8 selection,uint32 oddsBps,uint128 walletStake,uint128 accountStake,uint128 bonusStake) external nonReentrant returns(uint256 betId){
        Market storage m=markets[marketId];if(!supportedToken[token]||m.outcomeCount==0||outcomeCount!=m.outcomeCount||selection>=outcomeCount||oddsBps!=marketOddsBps[marketId][selection])revert InvalidBet();if(m.resolved)revert AlreadyResolved();if(block.timestamp>=m.closesAt)revert InvalidMarket();
        uint256 totalStake=uint256(walletStake)+accountStake+bonusStake;if(totalStake==0||totalStake>type(uint128).max)revert InvalidBet();if(accountStake>cashBalance[token][msg.sender]||bonusStake>bonusBalance[token][msg.sender])revert InsufficientBalance();uint256 payout=totalStake*oddsBps/10_000;
        if(walletStake>0&&!IERC20BetToken(token).transferFrom(msg.sender,address(this),walletStake))revert TransferFailed();if(accountStake>0){cashBalance[token][msg.sender]-=accountStake;totalCashBalances[token]-=accountStake;}if(bonusStake>0)bonusBalance[token][msg.sender]-=bonusStake;
        if(IERC20BetToken(token).balanceOf(address(this))<totalCashBalances[token]+reservedPayouts[token]+payout)revert InsufficientBankroll();reservedPayouts[token]+=payout;betId=marketBets[marketId].length;marketBets[marketId].push(Bet(msg.sender,token,selection,oddsBps,uint128(totalStake),walletStake,accountStake,bonusStake,false));userBetRefs[msg.sender].push(BetRef(marketId,betId));emit BetPlaced(marketId,betId,msg.sender,token,selection,totalStake,oddsBps,walletStake,accountStake,bonusStake);
    }
    function resolve(bytes32 marketId,uint8 result) external{if(msg.sender!=resolver)revert Unauthorized();Market storage m=markets[marketId];if(m.outcomeCount==0||result>=m.outcomeCount)revert InvalidMarket();if(m.resolved)revert AlreadyResolved();m.resolved=true;m.result=result;emit MarketResolved(marketId,result);}
    function settleBet(bytes32 marketId,uint256 betId) external nonReentrant{Market storage m=markets[marketId];Bet[] storage bs=marketBets[marketId];if(!m.resolved||betId>=bs.length)revert InvalidMarket();Bet storage b=bs[betId];if(b.settled)revert AlreadyResolved();b.settled=true;uint256 payout=uint256(b.stake)*b.oddsBps/10_000;reservedPayouts[b.token]-=payout;bool won=b.selection==m.result;if(won){cashBalance[b.token][b.bettor]+=payout;totalCashBalances[b.token]+=payout;if(IERC20BetToken(b.token).balanceOf(address(this))<totalCashBalances[b.token]+reservedPayouts[b.token])revert Insolvent();}else{treasury[b.token]+=uint256(b.walletStake)+b.accountStake+b.bonusStake;}emit BetSettled(marketId,betId,b.bettor,won,won?payout:0);}
    function withdrawTreasury(address token,uint256 amount) external onlyAdmin nonReentrant{if(!supportedToken[token]||amount==0||amount>treasury[token]||IERC20BetToken(token).balanceOf(address(this))<totalCashBalances[token]+reservedPayouts[token]+amount)revert Insolvent();treasury[token]-=amount;if(!IERC20BetToken(token).transfer(admin,amount))revert TransferFailed();emit TreasuryWithdrawn(token,admin,amount);}
    function bets(bytes32 marketId) external view returns(Bet[] memory){return marketBets[marketId];}
    function getBet(bytes32 marketId,uint256 betId) external view returns(Bet memory){if(betId>=marketBets[marketId].length)revert InvalidBet();return marketBets[marketId][betId];}
    function userBetCount(address user) external view returns(uint256){return userBetRefs[user].length;}
    function userBetRefsPage(address user,uint256 offset,uint256 limit) external view returns(BetRef[] memory page){if(limit>50)revert InvalidBet();uint256 count=userBetRefs[user].length;if(offset>=count)return new BetRef[](0);uint256 end=offset+limit;if(end>count)end=count;page=new BetRef[](end-offset);for(uint256 i=offset;i<end;i++)page[i-offset]=userBetRefs[user][i];}
}
