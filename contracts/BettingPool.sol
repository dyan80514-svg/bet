// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal native-token, noncustodial wager escrow. Deploy only after
/// independent audit and jurisdiction review. Resolver publishes event outcomes;
/// winners can claim without relying on an operator payout transaction.
contract BettingPool {
    address public immutable admin;
    address public immutable resolver;
    uint256 public constant FEE_BPS = 0;

    struct Market { uint8 outcomeCount; uint8 result; bool resolved; }
    struct Bet { address bettor; uint8 selection; uint128 amount; bool claimed; }
    mapping(bytes32 => Market) public markets;
    mapping(bytes32 => Bet[]) private marketBets;
    mapping(address => uint256) public credits;
    uint256 public treasury;

    event MarketCreated(bytes32 indexed marketId, uint8 outcomeCount);
    event BetPlaced(bytes32 indexed marketId, uint256 indexed betId, address indexed bettor, uint8 selection, uint256 amount);
    event MarketResolved(bytes32 indexed marketId, uint8 result, uint256 treasuryCredit);
    event Claimed(address indexed bettor, uint256 amount);
    event TreasuryWithdrawn(address indexed admin, uint256 amount);

    error Unauthorized(); error InvalidMarket(); error InvalidBet(); error AlreadyResolved(); error TransferFailed();
    constructor(address resolverAddress) { require(resolverAddress != address(0)); admin = msg.sender; resolver = resolverAddress; }
    function createMarket(bytes32 marketId, uint8 outcomeCount) external {
        if (msg.sender != resolver) revert Unauthorized();
        if (outcomeCount < 2 || outcomeCount > 8 || markets[marketId].outcomeCount != 0) revert InvalidMarket();
        markets[marketId] = Market(outcomeCount, 0, false); emit MarketCreated(marketId, outcomeCount);
    }
    function placeBet(bytes32 marketId, uint8 selection) external payable returns (uint256 betId) {
        Market storage m = markets[marketId];
        if (m.outcomeCount == 0 || selection >= m.outcomeCount || msg.value == 0) revert InvalidBet();
        if (m.resolved) revert AlreadyResolved();
        betId = marketBets[marketId].length;
        marketBets[marketId].push(Bet(msg.sender, selection, uint128(msg.value), false));
        emit BetPlaced(marketId, betId, msg.sender, selection, msg.value);
    }
    /// @dev Resolve to a real outcome index. No contest/dispute timeout is included;
    /// do not deploy with real funds until a robust oracle/dispute process is added.
    function resolve(bytes32 marketId, uint8 result) external {
        if (msg.sender != resolver) revert Unauthorized();
        Market storage m = markets[marketId];
        if (m.outcomeCount == 0 || result >= m.outcomeCount) revert InvalidMarket();
        if (m.resolved) revert AlreadyResolved();
        m.resolved = true; m.result = result;
        Bet[] storage bets = marketBets[marketId]; uint256 winning; uint256 pool;
        for (uint256 i; i < bets.length; ++i) { pool += bets[i].amount; if (bets[i].selection == result) winning += bets[i].amount; }
        // Pro-rata winning pool payout: winners recover stake plus losers' stakes.
        // If no one selected the outcome, return all stakes to their owners.
        if (winning == 0) {
            for (uint256 i; i < bets.length; ++i) credits[bets[i].bettor] += bets[i].amount;
            emit MarketResolved(marketId, result, 0);
        } else {
            uint256 paid;
            for (uint256 i; i < bets.length; ++i) if (bets[i].selection == result) {
                uint256 share = (bets[i].amount * pool) / winning; credits[bets[i].bettor] += share; paid += share;
            }
            uint256 remainder = pool - paid; treasury += remainder;
            emit MarketResolved(marketId, result, remainder);
        }
    }
    function claim() external {
        uint256 amount = credits[msg.sender]; if (amount == 0) revert InvalidBet();
        credits[msg.sender] = 0; (bool ok,) = msg.sender.call{value:amount}(""); if (!ok) revert TransferFailed(); emit Claimed(msg.sender, amount);
    }
    function withdrawTreasury() external {
        if (msg.sender != admin) revert Unauthorized(); uint256 amount = treasury; treasury = 0;
        (bool ok,) = admin.call{value:amount}(""); if (!ok) revert TransferFailed(); emit TreasuryWithdrawn(admin, amount);
    }
    function bets(bytes32 marketId) external view returns (Bet[] memory) { return marketBets[marketId]; }
    receive() external payable { revert InvalidBet(); }
}
