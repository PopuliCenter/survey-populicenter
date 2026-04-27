const fs = require('fs');
const content = 'test';
fs.writeFileSync('backend/tests/integration/e2e.test.js', content);
