// Simple harness to test extractAction() on sample content.
// Usage:
//   node server/ai/test-extract.js path/to/sample.txt "sourceType description"
//
// Example:
//   node server/ai/test-extract.js samples/email-plus-page.txt "activist email with scraped page"

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { extractAction } = require('./ai-service');

async function main() {
  const [,, samplePathArg, sourceTypeArg] = process.argv;
  if (!samplePathArg) {
    console.error('Usage: node server/ai/test-extract.js path/to/sample.txt "sourceType"');
    process.exit(1);
  }

  const samplePath = path.resolve(process.cwd(), samplePathArg);
  if (!fs.existsSync(samplePath)) {
    console.error(`Sample file not found: ${samplePath}`);
    process.exit(1);
  }

  const sourceType = sourceTypeArg || 'sample content';
  const content = fs.readFileSync(samplePath, 'utf8');

  console.log('------------------------------------------------------------');
  console.log(`Source type: ${sourceType}`);
  console.log(`Sample file: ${samplePath}`);
  console.log('------------------------------------------------------------');

  const result = await extractAction(content, sourceType);

  console.log('\nParsed action JSON:\n');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(err => {
  console.error('Test harness error:', err);
  process.exit(1);
});

