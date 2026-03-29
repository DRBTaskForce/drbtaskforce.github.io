# Example Test Output

## Successful Test Run

```
╔════════════════════════════════════════════════════╗
║     DRB Chatbot Test Suite                        ║
╚════════════════════════════════════════════════════╝

Testing worker: https://drb-chat-worker.drbtaskforce.workers.dev


═══ 📋 General $DRB Questions ═══

[1/18] Basic token info
Q: What is $DRB?
A: $DRB (DebtReliefBot) is the first token named by Grok AI. On March 7, 2025, Grok suggested "DebtReliefBot" as the name and "DRB" as the ticker when asked by a user on X. The token was deployed on Base by BankrBot...
✓ PASS - All keywords found

[2/18] How to buy
Q: How can I buy $DRB?
A: You can buy $DRB on Uniswap V3 (Base) at https://app.uniswap.org/explore/tokens/base/0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2 or on Aerodrome at https://aerodrome.finance/swap?from=eth&to=0x3ec2156d4c0a9cbd...
✓ PASS - All keywords found

[3/18] Current price query
Q: What is the current price of $DRB?
A: I don't know the current price or market cap. For live data, check DexScreener at https://dexscreener.com/base/0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2 or GeckoTerminal. Remember that $DRB is a meme token...
✓ PASS - All keywords found


═══ 📦 Exchange Listing Package ═══

[4/18] Request listing package
Q: Can you show me the listing package?
A: The official Exchange Listing Package is available at https://drbtaskforce.com/assets/pdfs/DRB_Listing_Packet_v1.1.pdf. This comprehensive package includes verified contract details, liquidity security proofs...
✓ PASS - All keywords found

[5/18] Request proof
Q: I need proof of liquidity lock
A: The liquidity is permanently locked in the Clanker LP Locker contract at 0x5ec4f99f342038c67a312a166ff56e6d70383d86. The LP NFT is locked with NO decreaseLiquidity, NO burn, and NO transferFrom functions. You can find...
✓ PASS - All keywords found

[6/18] Ask about the package
Q: Do you have listing docs?
A: Yes! The official DRB Exchange Listing Package is available at https://drbtaskforce.com/assets/pdfs/DRB_Listing_Packet_v1.1.pdf. This package contains all verified contract details, security proofs, liquidity lock...
✓ PASS - All keywords found


═══ 💻 Code Proofs ═══

[7/18] Request to see code
Q: Show me the code that proves no mint function
A: Here's the code showing the one-time mint in the constructor:

```solidity
// One-time mint in constructor
mint(msg.sender, maxSupply);

// Only official Base bridge can ever mint (cross-chain)
if (msg.sender != Predeploys.SUPERCHAIN_TOKEN_BRIDGE) revert Unauthorized();
```

The entire supply is minted once...
✓ PASS - All keywords found

[8/18] Request no-tax proof
Q: Prove there are no hidden taxes
A: Here's the code showing clean 1:1 transfers with no fees:

```solidity
function _update(address from, address to, uint256 value) internal override {
super._update(from, to, value); // Clean transfer - zero fees
}
```

This is a standard ERC20 transfer...
✓ PASS - All keywords found

[9/18] Request full source code
Q: Where can I see the complete contract source code?
A: For the complete verified source code of the $DRB token contract, view it here:
https://drbtaskforce.com/assets/pdfs/DRB_ClankerToken_Full_Source_Code.pdf

For the complete verified source code of the LP Locker contract:
https://drbtaskforce.com/assets/pdfs/DRB_Clanker_LP_Locker_Full_Source_Code.pdf

You can also view verified source directly on Basescan:
• $DRB Token: https://basescan.org/address/0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2#code
• LP Locker: https://basescan.org/address/0x5ec4f99f342038c67a312a166ff56e6d70383d86#code
✓ PASS - All keywords found


═══ 🔒 Liquidity Security ═══

[10/18] Liquidity lock verification
Q: How do I know the liquidity is locked?
A: The liquidity is permanently locked in the LP Locker contract at 0x5ec4f99f342038c67a312a166ff56e6d70383d86. The contract has NO decreaseLiquidity, NO burn, NO transferFrom functions that could remove the principal...
✓ PASS - All keywords found

[11/18] LP NFT details
Q: Tell me about the LP NFT
A: The LP NFT is Uniswap V3 Nonfungible Position Manager token (0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1) with Token ID 2246136. This NFT represents the liquidity position and is permanently locked in the LP Locker...
✓ PASS - All keywords found

[12/18] Can liquidity be removed?
Q: Can someone remove the liquidity?
A: No, the liquidity cannot be removed. The LP NFT is permanently locked in the locker contract with no decreaseLiquidity, no burn, and no transferFrom functions. Only trading fees can be collected...
✓ PASS - All keywords found


═══ 🏗️ Contract Security ═══

[13/18] Mint function check
Q: Does the contract have a mint function?
A: No mint function exists for creating new tokens. The entire supply of 100B was minted once in the constructor, and that's it. The only mint-related code is for cross-chain bridging via the official Base Superchain bridge...
✓ PASS - All keywords found

[14/18] Admin privileges
Q: Does anyone have admin control?
A: No, there are no admin privileges after deployment. The contract is immutable with no upgradeability and no proxy pattern. The deployer can only update image metadata (non-critical). The contract uses Clanker's audited...
✓ PASS - All keywords found

[15/18] Upgradeability check
Q: Is the contract upgradeable?
A: No, the contract is not upgradeable. It's completely immutable with no proxy pattern and no upgrade mechanism. The code is fixed forever after deployment...
✓ PASS - All keywords found


═══ 🎯 Key Addresses ═══

[16/18] Token contract address
Q: What is the $DRB token contract address?
A: The $DRB token contract address is 0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2 on the Base blockchain. You can view it on Basescan at https://basescan.org/address/0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2
✓ PASS - All keywords found

[17/18] Grok wallet address
Q: What is Grok's wallet address?
A: Grok's wallet (deployer) address is 0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9. This wallet is recorded as the deployer in the TokenCreated event and receives the 0.4% trading fees automatically...
✓ PASS - All keywords found

[18/18] Deployment transaction
Q: What is the deployment transaction hash?
A: The deployment transaction hash is 0x2cf2f8330f8e1b72c5efdc1db80790e6f47ff0c3af6a33cec31186f2c7df795e. You can view the full deployment on Basescan at https://basescan.org/tx/0x2cf2f8330f8e1b72c5efdc1db80790e6f47ff0c3af6a33cec31186f2c7df795e
✓ PASS - All keywords found


═══ Test Summary ═══
✓ Passed:  18/18
⚠ Partial: 0/18
✗ Failed:  0/18

Success Rate: 100.0%
```

## Partial Pass Example

When some keywords are missing but the response is still relevant:

```
[4/18] Request listing package
Q: Can you show me the listing package?
A: You can find the official listing documentation at drbtaskforce.com. The package includes contract verification, liquidity proofs, and security details...
⚠ PARTIAL - Missing: DRB_Listing_Packet_v1.1.pdf
  Found: drbtaskforce.com/assets/pdfs, official, package
```

## Failed Test Example

When the request fails completely:

```
[7/18] Request to see code
Q: Show me the code that proves no mint function
A: [API timeout]
✗ FAIL - Request timeout after 30s
```

## Quick Query Example

Using the manual query script:

```bash
$ ./test-query.sh "What is the contract address?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 DRB Chatbot Query
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Worker: https://drb-chat-worker.drbtaskforce.workers.dev
Question: What is the contract address?

The $DRB token contract address is 0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2 on the Base blockchain. You can verify it on Basescan at https://basescan.org/address/0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2
```

## Rate Limit Example

When hitting rate limits:

```
[5/18] Request proof
✗ FAIL - HTTP 429: {"error":"Too many requests. Please wait a moment."}
```

The automated test suite handles this by waiting 6 seconds between requests.
