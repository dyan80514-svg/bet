import "@stdlib/tvm-dicts"

const MIN_STAKE: coins = 100000000; // 0.1 TON (100M nanotons)
const MAX_STAKE: coins = 100000000000; // 100 TON (100B nanotons)
const MINIMUM_RESERVE: coins = 50000000000; // 50 TON mandatory reserve

struct Market {
    outcomeCount: uint8
    closesAt: uint64
    oddsHash: uint256
    homeOdds: uint32
    drawOdds: uint32
    awayOdds: uint32
    result: uint8
    resolved: bool
}

struct Bet {
    walletAddress: address
    marketId: uint256
    selection: uint8
    oddsBps: uint32
    stake: coins
    liability: coins
    settlement: uint8 // 0=pending, 1=won, 2=lost, 3=void, 4=claimed
}

struct Storage {
    ownerAddress: address
    adminWallet: address
    paused: bool
    reserved: coins
    markets: dict
    bets: dict
}

fun Storage.load() {
    return Storage.fromCell(contract.getData())
}

fun Storage.save(self) {
    contract.setData(self.toCell())
}

// Opcode 0x43524d4b: create_market(marketId, expiry, oddsHash)
struct (0x43524d4b) CreateMarket {
    queryId: uint64
    marketId: uint256
    expiry: uint64
    oddsHash: uint256
    outcomeCount: uint8
    homeOdds: uint32
    drawOdds: uint32
    awayOdds: uint32
}

// Backward-compatible Opcode 0x4d4b544f: OpenMarket
struct (0x4d4b544f) OpenMarket {
    marketId: uint256
    outcomeCount: uint8
    closesAt: uint64
    homeOdds: uint32
    drawOdds: uint32
    awayOdds: uint32
}

// Opcode 0x52534c54: settle_market(marketId, winningSelection)
struct (0x52534c54) SettleMarket {
    queryId: uint64
    marketId: uint256
    winningSelection: uint8
}

// Opcode 0x504c4143: place_bet(marketId, selection, queryId)
struct (0x504c4143) PlaceBet {
    queryId: uint64
    marketId: uint256
    selection: uint8
    oddsBps: uint32
    walletAddress: address
    stake: coins
}

// Opcode 0x434c414d: claim_winnings(queryId)
struct (0x434c414d) ClaimWinnings {
    queryId: uint64
}

// Opcode 0x57444c53: withdraw_losses(amount) to ADMIN_MAINNET_WALLET
struct (0x57444c53) WithdrawLosses {
    queryId: uint64
    amount: coins
}

// Opcode 0x50415553: set_paused(paused)
struct (0x50415553) SetPaused {
    queryId: uint64
    paused: bool
}

type AllowedMessage = CreateMarket | OpenMarket | SettleMarket | PlaceBet | ClaimWinnings | WithdrawLosses | SetPaused

contract BettingPool {
    storage: Storage
    incomingMessages: AllowedMessage
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);
    var st = Storage.load();

    match (msg) {
        SetPaused => {
            assert (in.senderAddress == st.ownerAddress || in.senderAddress == st.adminWallet) throw 401;
            st.paused = msg.paused;
            st.save();
        }
        CreateMarket => {
            assert (in.senderAddress == st.ownerAddress || in.senderAddress == st.adminWallet) throw 401;
            assert (msg.outcomeCount == 2 || msg.outcomeCount == 3) throw 400;
            assert (msg.expiry > blockchain.now()) throw 400;
            assert (msg.homeOdds > 10000 && msg.awayOdds > 10000) throw 400;
            assert (msg.outcomeCount == 2 || msg.drawOdds > 10000) throw 400;
            val (oldMarketCell, exists) = st.markets.uDictGetRef(256, msg.marketId);
            assert (!exists) throw 409;
            val market = Market {
                outcomeCount: msg.outcomeCount,
                closesAt: msg.expiry,
                oddsHash: msg.oddsHash,
                homeOdds: msg.homeOdds,
                drawOdds: msg.drawOdds,
                awayOdds: msg.awayOdds,
                result: 0,
                resolved: false,
            };
            st.markets.uDictSetRef(256, msg.marketId, market.toCell());
            st.save();
        }
        OpenMarket => {
            assert (in.senderAddress == st.ownerAddress || in.senderAddress == st.adminWallet) throw 401;
            assert (msg.outcomeCount == 2 || msg.outcomeCount == 3) throw 400;
            assert (msg.closesAt > blockchain.now()) throw 400;
            assert (msg.homeOdds > 10000 && msg.awayOdds > 10000) throw 400;
            assert (msg.outcomeCount == 2 || msg.drawOdds > 10000) throw 400;
            val (oldMarketCell, exists) = st.markets.uDictGetRef(256, msg.marketId);
            assert (!exists) throw 409;
            val market = Market {
                outcomeCount: msg.outcomeCount,
                closesAt: msg.closesAt,
                oddsHash: 0,
                homeOdds: msg.homeOdds,
                drawOdds: msg.drawOdds,
                awayOdds: msg.awayOdds,
                result: 0,
                resolved: false,
            };
            st.markets.uDictSetRef(256, msg.marketId, market.toCell());
            st.save();
        }
        SettleMarket => {
            assert (in.senderAddress == st.ownerAddress || in.senderAddress == st.adminWallet) throw 401;
            val (marketCell, exists) = st.markets.uDictGetRef(256, msg.marketId);
            assert (exists) throw 404;
            var market = Market.fromCell(marketCell!!);
            assert (!market.resolved) throw 409;
            assert (msg.winningSelection == 255 || msg.winningSelection < market.outcomeCount) throw 400;
            market.result = msg.winningSelection;
            market.resolved = true;
            st.markets.uDictSetRef(256, msg.marketId, market.toCell());
            st.save();
        }
        PlaceBet => {
            assert (!st.paused) throw 403;
            assert (msg.queryId != 0) throw 400;
            assert (msg.walletAddress == in.senderAddress) throw 401;
            assert (msg.stake >= MIN_STAKE && msg.stake <= MAX_STAKE) throw 400;
            assert (in.valueCoins >= msg.stake + 100000000) throw 400; // Attached value must cover stake + gas
            val (priorBet, alreadyUsed) = st.bets.uDictGetRef(64, msg.queryId);
            assert (!alreadyUsed) throw 409; // QueryId uniqueness
            val (marketCell, marketExists) = st.markets.uDictGetRef(256, msg.marketId);
            assert (marketExists) throw 404;
            val market = Market.fromCell(marketCell!!);
            assert (!market.resolved && blockchain.now() < market.closesAt) throw 409;
            assert (msg.selection < market.outcomeCount) throw 400;
            val expectedOdds = msg.selection == 0 ? market.homeOdds : msg.selection == 1 && market.outcomeCount == 3 ? market.drawOdds : market.awayOdds;
            assert (msg.oddsBps == expectedOdds) throw 409;
            val liability = msg.stake * msg.oddsBps / 10000;
            assert (contract.getOriginalBalance() >= st.reserved + liability + MINIMUM_RESERVE) throw 402;
            val bet = Bet {
                walletAddress: msg.walletAddress,
                marketId: msg.marketId,
                selection: msg.selection,
                oddsBps: msg.oddsBps,
                stake: msg.stake,
                liability: liability,
                settlement: 0,
            };
            st.bets.uDictSetRef(64, msg.queryId, bet.toCell());
            st.reserved += liability;
            st.save();
        }
        ClaimWinnings => {
            val (betCell, exists) = st.bets.uDictGetRef(64, msg.queryId);
            assert (exists) throw 404;
            var bet = Bet.fromCell(betCell!!);
            // Non-custodial: user, contract owner, or admin relayer can trigger claim to winner
            assert (in.senderAddress == bet.walletAddress || in.senderAddress == st.ownerAddress || in.senderAddress == st.adminWallet) throw 401;
            assert (bet.settlement == 0) throw 409;
            val (marketCell, marketExists) = st.markets.uDictGetRef(256, bet.marketId);
            assert (marketExists) throw 404;
            val market = Market.fromCell(marketCell!!);
            assert (market.resolved) throw 409;
            st.reserved -= bet.liability;
            var payout: coins = 0;
            if (market.result == 255) {
                payout = bet.stake;
                bet.settlement = 3; // Voided
            } else if (market.result == bet.selection) {
                payout = bet.liability;
                bet.settlement = 1; // Won
            } else {
                bet.settlement = 2; // Lost
            }
            st.bets.uDictSetRef(64, msg.queryId, bet.toCell());
            st.save();
            if (payout > 0) {
                val transfer = createMessage({
                    bounce: BounceMode.NoBounce,
                    value: payout,
                    dest: bet.walletAddress,
                });
                transfer.send(SEND_MODE_REGULAR);
            }
        }
        WithdrawLosses => {
            assert (in.senderAddress == st.ownerAddress || in.senderAddress == st.adminWallet) throw 401;
            assert (msg.amount > 0) throw 400;
            val freeBalance = contract.getOriginalBalance() - st.reserved;
            assert (freeBalance >= msg.amount + MINIMUM_RESERVE) throw 402;
            val transfer = createMessage({
                bounce: BounceMode.NoBounce,
                value: msg.amount,
                dest: st.adminWallet,
            });
            transfer.send(SEND_MODE_REGULAR);
        }
        else => {
            assert (in.body.isEmpty()) throw 65535;
        }
    }
}

get fun reserved(): coins {
    val st = lazy Storage.load();
    return st.reserved;
}

get fun isPaused(): bool {
    val st = lazy Storage.load();
    return st.paused;
}

get fun adminWallet(): address {
    val st = lazy Storage.load();
    return st.adminWallet;
}

// 0=pending, 1=won/unclaimed, 2=lost/unclaimed, 3=void/unclaimed, 4=claimed.
get fun settlementResult(queryId: uint64): int {
    val st = lazy Storage.load();
    val (betCell, exists) = st.bets.uDictGetRef(64, queryId);
    if (!exists) {
        return 0;
    }
    val bet = Bet.fromCell(betCell!!);
    if (bet.settlement != 0) {
        return 4;
    }
    val (marketCell, marketExists) = st.markets.uDictGetRef(256, bet.marketId);
    if (!marketExists) {
        return 0;
    }
    val market = Market.fromCell(marketCell!!);
    if (!market.resolved) {
        return 0;
    }
    if (market.result == 255) {
        return 3;
    }
    return market.result == bet.selection ? 1 : 2;
}
