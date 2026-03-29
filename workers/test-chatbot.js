/**
 * DRB Chatbot Test Suite
 * 
 * Tests the deployed chat worker responses for the new system prompt
 * with Exchange Listing Package information.
 * 
 * Usage:
 *   node test-chatbot.js <worker-url>
 *   node test-chatbot.js https://drb-chat-worker.your-subdomain.workers.dev
 */

const WORKER_URL = process.argv[2] || 'https://drb-chat-worker.remibyte.workers.dev';

// Test cases organized by category
const TEST_CASES = [
  {
    category: '📋 General $DRB Questions',
    tests: [
      {
        name: 'Basic token info',
        message: 'What is $DRB?',
        expectedKeywords: ['DebtReliefBot', 'Grok', 'Base', '100B']
      },
      {
        name: 'How to buy',
        message: 'How can I buy $DRB?',
        expectedKeywords: ['Uniswap', 'Aerodrome', 'Base', 'ETH']
      },
      {
        name: 'Current price query',
        message: 'What is the current price of $DRB?',
        expectedKeywords: ['DexScreener', 'GeckoTerminal', 'live data']
      }
    ]
  },
  {
    category: '📦 Exchange Listing Package',
    tests: [
      {
        name: 'Request listing package',
        message: 'Can you show me the listing package?',
        expectedKeywords: ['DRB_Listing_Packet_v1.1.pdf', 'drbtaskforce.com/assets/pdfs']
      },
      {
        name: 'Request proof',
        message: 'I need proof of liquidity lock',
        expectedKeywords: ['DRB_Listing_Packet_v1.1.pdf', 'permanently locked', 'LP Locker']
      },
      {
        name: 'Ask about the package',
        message: 'Do you have listing docs?',
        expectedKeywords: ['DRB_Listing_Packet_v1.1.pdf', 'official', 'package']
      }
    ]
  },
  {
    category: '💻 Code Proofs',
    tests: [
      {
        name: 'Request to see code',
        message: 'Show me the code that proves no mint function',
        expectedKeywords: ['solidity', 'mint(msg.sender, maxSupply)', 'constructor']
      },
      {
        name: 'Request no-tax proof',
        message: 'Prove there are no hidden taxes',
        expectedKeywords: ['solidity', '_update', 'super._update', 'Clean transfer']
      },
      {
        name: 'Request full source code',
        message: 'Where can I see the complete contract source code?',
        expectedKeywords: ['DRB_ClankerToken_Full_Source_Code.pdf', 'Basescan', '0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2#code']
      }
    ]
  },
  {
    category: '🔒 Liquidity Security',
    tests: [
      {
        name: 'Liquidity lock verification',
        message: 'How do I know the liquidity is locked?',
        expectedKeywords: ['permanently locked', 'LP Locker', '0x5ec4f99f342038c67a312a166ff56e6d70383d86', 'no decreaseLiquidity']
      },
      {
        name: 'LP NFT details',
        message: 'Tell me about the LP NFT',
        expectedKeywords: ['Token ID 2246136', 'Uniswap V3', 'Position Manager']
      },
      {
        name: 'Can liquidity be removed?',
        message: 'Can someone remove the liquidity?',
        expectedKeywords: ['no', 'permanently', 'locked', 'cannot']
      }
    ]
  },
  {
    category: '🏗️ Contract Security',
    tests: [
      {
        name: 'Mint function check',
        message: 'Does the contract have a mint function?',
        expectedKeywords: ['No', 'one-time', 'constructor', 'fixed supply']
      },
      {
        name: 'Admin privileges',
        message: 'Does anyone have admin control?',
        expectedKeywords: ['no', 'immutable', 'renounced', 'metadata only']
      },
      {
        name: 'Upgradeability check',
        message: 'Is the contract upgradeable?',
        expectedKeywords: ['no', 'immutable', 'no proxy', 'no upgrade']
      }
    ]
  },
  {
    category: '🎯 Key Addresses',
    tests: [
      {
        name: 'Token contract address',
        message: 'What is the $DRB token contract address?',
        expectedKeywords: ['0x3ec2156d4c0a9cbdab4a016633b7bcf6a8d68ea2']
      },
      {
        name: 'Grok wallet address',
        message: 'What is Grok\'s wallet address?',
        expectedKeywords: ['0xb1058c959987e3513600eb5b4fd82aeee2a0e4f9', 'deployer']
      },
      {
        name: 'Deployment transaction',
        message: 'What is the deployment transaction hash?',
        expectedKeywords: ['0x2cf2f8330f8e1b72c5efdc1db80790e6f47ff0c3af6a33cec31186f2c7df795e']
      }
    ]
  }
];

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

async function queryWorker(message) {
  const response = await fetch(WORKER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://drbtaskforce.github.io'
    },
    body: JSON.stringify({ message })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  return data.reply;
}

function checkKeywords(text, keywords) {
  const lowerText = text.toLowerCase();
  const found = keywords.filter(k => lowerText.includes(k.toLowerCase()));
  const missing = keywords.filter(k => !lowerText.includes(k.toLowerCase()));
  return { found, missing };
}

async function runTest(test, testNum, totalTests) {
  console.log(`\n${colors.cyan}[${testNum}/${totalTests}]${colors.reset} ${test.name}`);
  console.log(`${colors.blue}Q:${colors.reset} ${test.message}`);

  try {
    const reply = await queryWorker(test.message);
    console.log(`${colors.blue}A:${colors.reset} ${reply.substring(0, 200)}${reply.length > 200 ? '...' : ''}`);

    const { found, missing } = checkKeywords(reply, test.expectedKeywords);

    if (missing.length === 0) {
      console.log(`${colors.green}✓ PASS${colors.reset} - All keywords found`);
      return { status: 'pass', test: test.name };
    } else {
      console.log(`${colors.yellow}⚠ PARTIAL${colors.reset} - Missing: ${missing.join(', ')}`);
      console.log(`  Found: ${found.join(', ')}`);
      return { status: 'partial', test: test.name, missing };
    }
  } catch (error) {
    console.log(`${colors.red}✗ FAIL${colors.reset} - ${error.message}`);
    return { status: 'fail', test: test.name, error: error.message };
  }
}

async function runAllTests() {
  console.log(`${colors.bright}╔════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}║     DRB Chatbot Test Suite                        ║${colors.reset}`);
  console.log(`${colors.bright}╚════════════════════════════════════════════════════╝${colors.reset}`);
  console.log(`\n${colors.cyan}Testing worker:${colors.reset} ${WORKER_URL}\n`);

  const results = [];
  let testNum = 0;
  const totalTests = TEST_CASES.reduce((sum, cat) => sum + cat.tests.length, 0);

  for (const category of TEST_CASES) {
    console.log(`\n${colors.bright}═══ ${category.category} ═══${colors.reset}`);

    for (const test of category.tests) {
      testNum++;
      const result = await runTest(test, testNum, totalTests);
      results.push(result);
      
      // Rate limiting: wait 6s between requests (10 per minute limit)
      if (testNum < totalTests) {
        await new Promise(resolve => setTimeout(resolve, 6000));
      }
    }
  }

  // Summary
  console.log(`\n\n${colors.bright}═══ Test Summary ═══${colors.reset}`);
  const passed = results.filter(r => r.status === 'pass').length;
  const partial = results.filter(r => r.status === 'partial').length;
  const failed = results.filter(r => r.status === 'fail').length;

  console.log(`${colors.green}✓ Passed:${colors.reset}  ${passed}/${totalTests}`);
  console.log(`${colors.yellow}⚠ Partial:${colors.reset} ${partial}/${totalTests}`);
  console.log(`${colors.red}✗ Failed:${colors.reset}  ${failed}/${totalTests}`);

  if (partial > 0) {
    console.log(`\n${colors.yellow}Partial results (missing keywords):${colors.reset}`);
    results
      .filter(r => r.status === 'partial')
      .forEach(r => console.log(`  - ${r.test}: ${r.missing.join(', ')}`));
  }

  if (failed > 0) {
    console.log(`\n${colors.red}Failed tests:${colors.reset}`);
    results
      .filter(r => r.status === 'fail')
      .forEach(r => console.log(`  - ${r.test}: ${r.error}`));
  }

  const successRate = ((passed / totalTests) * 100).toFixed(1);
  console.log(`\n${colors.bright}Success Rate: ${successRate}%${colors.reset}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
