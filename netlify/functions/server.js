const serverless = require('serverless-http');
const app = require('../../server');
exports.handler = serverless(app, { binary: ['image/*', 'application/pdf'] });
