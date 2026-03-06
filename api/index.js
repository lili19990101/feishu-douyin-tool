const handler = require('../backend/serverless');

module.exports = (req, res) => {
  if (req.url && req.url.startsWith('/api')) {
    req.url = req.url.slice(4) || '/';
  }
  return handler(req, res);
};
