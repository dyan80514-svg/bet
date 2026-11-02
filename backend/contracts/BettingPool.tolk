// Escrow prototype. Do not deploy or accept real wagers until this contract
// has an Acton test suite, independent audit, deployment review, and a verified
// generated wrapper. User keys never leave TON Connect.
import "@stdlib/tvm-dicts"

const MINIMUM_RESERVE = 10000000000;
struct Market {
    outcomeCount: uint8
    closesAt: uint64
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
    settlement: uint8
}

struct Storage {
    ownerAddress: address
    markets: dict
    bets: dict
    reserved: coins
}

fun Storage.load() {
    return Storage.fromCell(contract.getData())
}

fun Storage.save(self) {
    contract.setData(self.toCell())
}

struct (0x4d4b544f) OpenMarket {
    marketId: uint256
    outcomeCount: uint8
    closesAt: uint64
    homeOdds: uint32
    drawOdds: uint32
    awayOdds: uint32
}

struct (0x52534c54) ResolveMarket {
    marketId: uint256
    result: uint8
}

struct (0x504c4143) PlaceBet {
    queryId: uint64
    marketId: uint256
    selection: uint8
    oddsBps: uint32
    walletAddress: address
    stake: coins
}

struct (0x434c414d) ClaimBet {
    queryId: uint64
}

type AllowedMessage = OpenMarket | ResolveMarket | PlaceBet | ClaimBet

contract BettingPool {
    storage: Storage
    incomingMessages: AllowedMessage
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessage.fromSlice(in.body);
    var st = Storage.load();
    match (msg) {
        OpenMarket => {
            assert (in.senderAddress == st.ownerAddress) throw 401;
            assert (msg.outcomeCount == 2 || msg.outcomeCount == 3) throw 400;
            assert (msg.closesAt > blockchain.now()) throw 400;
            assert (msg.homeOdds > 10000 && msg.awayOdds > 10000) throw 400;
            assert (msg.outcomeCount == 2 || msg.drawOdds > 10000) throw 400;
            val (oldMarketCell, exists) = st.markets.uDictGetRef(256, msg.marketId);
            assert (!exists) throw 409;
            val market = Market {
                outcomeCount: msg.outcomeCount,
                closesAt: msg.closesAt,
                homeOdds: msg.homeOdds,
                drawOdds: msg.drawOdds,
                awayOdds: msg.awayOdds,
                result: 0,
                resolved: false,
            };
            st.markets.uDictSetRef(256, msg.marketId, market.toCell());
            st.save();
        }
        ResolveMarket => {
            assert (in.senderAddress == st.ownerAddress) throw 401;
            val (marketCell, exists) = st.markets.uDictGetRef(256, msg.marketId);
            assert (exists) throw 404;
            var market = Market.fromCell(marketCell!!);
            assert (!market.resolved) throw 409;
            assert (msg.result == 255 || msg.result < market.outcomeCount) throw 400;
            market.result = msg.result;
            market.resolved = true;
            st.markets.uDictSetRef(256, msg.marketId, market.toCell());
            st.save();
        }
        PlaceBet => {
            assert (msg.queryId != 0) throw 400;
            assert (msg.walletAddress == in.senderAddress) throw 401;
            assert (msg.stake > 0) throw 400;
            assert (in.valueCoins >= msg.stake + 100000000) throw 400;
            val (priorBet, alreadyUsed) = st.bets.uDictGetRef(64, msg.queryId);
            assert (!alreadyUsed) throw 409;
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
        ClaimBet => {
            val (betCell, exists) = st.bets.uDictGetRef(64, msg.queryId);
            assert (exists) throw 404;
            var bet = Bet.fromCell(betCell!!);
            assert (in.senderAddress == bet.walletAddress) throw 401;
            assert (bet.settlement == 0) throw 409;
            val (marketCell, marketExists) = st.markets.uDictGetRef(256, bet.marketId);
            assert (marketExists) throw 404;
            val market = Market.fromCell(marketCell!!);
            assert (market.resolved) throw 409;
            st.reserved -= bet.liability;
            var payout: coins = 0;
            if (market.result == 255) {
                payout = bet.stake;
                bet.settlement = 3;
            } else if (market.result == bet.selection) {
                payout = bet.liability;
                bet.settlement = 1;
            } else {
                bet.settlement = 2;
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
        else => {
            assert (in.body.isEmpty()) throw 65535;
        }
    }
}

get fun reserved() {
    val st = lazy Storage.load();
    return st.reserved;
}

// 0=pending, 1=won/unclaimed, 2=lost/unclaimed, 3=void/unclaimed, 4=claimed.
get fun settlementResult(queryId: uint64) {
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
