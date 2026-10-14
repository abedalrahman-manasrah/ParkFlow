const base = require('./app.json').expo;
module.exports = () => ({
  ...base,
  extra: { ...base.extra, apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL },
});
