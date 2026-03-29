# Chatbot Testing Guide

Test suite for the DRB Chat Worker to verify the new system prompt with Exchange Listing Package information.

## Prerequisites

- Node.js installed (for automated test suite)
- `jq` installed (for manual bash queries)
- Deployed worker URL

## Running the Full Test Suite

The automated test suite runs comprehensive tests across all prompt categories:

```bash
cd workers
node test-chatbot.js <worker-url>
```

Example:
```bash
node test-chatbot.js https://drb-chat-worker.drbtaskforce.workers.dev
```

If no URL is provided, it defaults to `https://drb-chat-worker.drbtaskforce.workers.dev`.

### Test Categories

The suite tests:

1. **📋 General $DRB Questions** - Basic token info, buying, pricing
2. **📦 Exchange Listing Package** - Package requests, proof requests
3. **💻 Code Proofs** - Solidity snippets, mint function, taxes
4. **🔒 Liquidity Security** - LP lock, NFT details, anti-rug
5. **🏗️ Contract Security** - Mint check, admin control, upgradeability
6. **🎯 Key Addresses** - Contract, Grok wallet, deployment TX

### Output

The test suite provides:
- Color-coded pass/fail/partial results
- Full question and abbreviated answer for each test
- Missing keywords for partial passes
- Summary with success rate
- Exit code 0 (success) or 1 (failure)

### Rate Limiting

The worker has a 10 requests/minute rate limit. The test suite automatically waits 6 seconds between requests to stay within limits.

## Quick Manual Testing

For quick one-off queries:

```bash
./test-query.sh "Your question here"
```

Examples:
```bash
./test-query.sh "What is DRB?"
./test-query.sh "Show me the listing package"
./test-query.sh "Prove there are no hidden taxes"
./test-query.sh "What is Grok's wallet address?"
```

With custom worker URL:
```bash
./test-query.sh "What is DRB?" https://drb-chat-worker.custom.workers.dev
```

## Testing Specific Features

### Exchange Listing Package

Test that the bot provides the correct PDF link:

```bash
./test-query.sh "I need the listing package"
./test-query.sh "Show me proof of liquidity"
./test-query.sh "Where can I find listing docs?"
```

Expected: Response includes `DRB_Listing_Packet_v1.1.pdf` link

### Code Proofs

Test that the bot shows Solidity snippets:

```bash
./test-query.sh "Show me the code for mint function"
./test-query.sh "Prove no hidden taxes"
./test-query.sh "Show me the LP lock code"
```

Expected: Response includes code blocks with Solidity

### Full Source Code Requests

Test that bot directs to complete source:

```bash
./test-query.sh "Where is the full contract source code?"
./test-query.sh "I want to see all the code"
```

Expected: Response includes:
- `DRB_ClankerToken_Full_Source_Code.pdf`
- `DRB_Clanker_LP_Locker_Full_Source_Code.pdf`
- Basescan verification links

### Security Questions

Test security-related queries:

```bash
./test-query.sh "Is the liquidity locked?"
./test-query.sh "Can someone mint more tokens?"
./test-query.sh "Is the contract upgradeable?"
./test-query.sh "Does anyone have admin control?"
```

Expected: Clear security explanations with technical details

## Local Development Testing

To test against a local worker:

1. Start local worker:
```bash
wrangler dev
```

2. Run tests against localhost:
```bash
node test-chatbot.js http://localhost:8787
./test-query.sh "What is DRB?" http://localhost:8787
```

## Troubleshooting

### Rate Limit Errors

If you hit rate limits:
- Wait 60 seconds before retrying
- Use the automated test suite (handles rate limiting)
- Avoid running multiple test instances concurrently

### Worker Not Found

If you get 404 errors:
- Verify the worker URL (check `wrangler deploy` output)
- Check CORS configuration in worker
- Verify the worker is deployed (run `wrangler deployments list`)

### API Key Issues

If you get authentication errors:
- Verify XAI_API_KEY is set: `wrangler secret list`
- Check xAI console for API key status
- Verify spending limits haven't been hit

## CI/CD Integration

To integrate tests into CI/CD:

```yaml
# Example GitHub Actions workflow
- name: Test chatbot
  run: |
    cd workers
    node test-chatbot.js ${{ secrets.WORKER_URL }}
```

The test script exits with code 1 if any tests fail, making it suitable for CI/CD pipelines.

## Expected Success Rate

With the updated system prompt (v1.1 with Exchange Listing Package):
- **Target:** 100% pass rate
- **Acceptable:** 90%+ pass rate (some keyword variations may cause partial passes)
- **Action Required:** <80% pass rate indicates prompt issues

## Updating Tests

When updating the system prompt, also update test cases in `test-chatbot.js`:

1. Add new test cases for new features
2. Update `expectedKeywords` arrays for changed responses
3. Run full test suite to verify
4. Document any breaking changes

## Manual Verification Checklist

After deployment, manually verify:

- [ ] Bot responds to general $DRB questions
- [ ] Bot provides `DRB_Listing_Packet_v1.1.pdf` link when asked for package
- [ ] Bot shows Solidity code snippets for code requests
- [ ] Bot provides full source code PDF links for detailed requests
- [ ] Bot includes correct contract addresses (0x3ec2...)
- [ ] Bot doesn't provide price predictions
- [ ] Bot reminds users about meme token risk
- [ ] Bot handles non-DRB questions gracefully
