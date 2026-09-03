# Hydra Protocol v7.0 - B2B Trading Bot Referral Integration

Developers of Telegram / Discord trading bots can earn 30% of protocol fees (0.45% net ETH of swap value) instantly routed to their developer treasury on Base Mainnet (ChainID: 8453).

## 1. On-Chain Contracts
- **HydraToken**: `0x287092EB206cC3bFee7af1a184cf3619AF0E871f`
- **HydraBondingCurve**: `0x32c3d28eE73e693d4281Ad27015d7a5A8Aa103A2`

## 2. Integration Function
```solidity
function buy(uint256 minTokensOut, address referrer) external payable returns (uint256 tokensOut);

3. Execution Example (JavaScript / Ethers.js v6)
// Pass your bot's payout wallet address as the `referrer`
const referrerTreasury = "0xYOUR_BOT_PAYOUT_ADDRESS";

const tx = await curveContract.buy(minTokensExpected, referrerTreasury, {
    value: userEthAmount,
    gasLimit: 220000
});
await tx.wait(1);
// 0.45% net ETH instant referral commission is automatically deposited to `referrerTreasury`!
