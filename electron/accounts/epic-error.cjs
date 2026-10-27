class EpicError extends Error {
  constructor(status, code = '') {
    super(
      status === 401
        ? 'Epic session expired. Sign in again.'
        : status === 403
          ? 'Epic denied homebase access for this session.'
          : status === 429
            ? 'Epic is rate limiting requests. Try again shortly.'
            : `Epic request failed (HTTP ${status}).`,
    );
    this.status = status;
    this.code = /^[a-zA-Z0-9_.-]{1,160}$/.test(code) ? code : '';
  }
}
module.exports = { EpicError };
