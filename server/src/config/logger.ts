import pino from 'pino';
export const logRedaction = {paths:['req.headers.authorization','req.headers.cookie','req.headers["x-parkflow-csrf"]','req.body','res.headers["set-cookie"]','token','refreshToken','csrfToken','session.csrfToken','code','password'],censor:'[REDACTED]'};
export const logger = pino({redact:logRedaction});
