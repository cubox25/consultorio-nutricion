const STATES = Object.freeze({
  CONNECTING: "CONNECTING",
  QR_REQUIRED: "QR_REQUIRED",
  READY: "READY",
  DISCONNECTED: "DISCONNECTED",
  ERROR: "ERROR",
});

const status = {
  state: STATES.DISCONNECTED,
  qrRequired: false,
  lastConnectedAt: null,
  lastMessageAt: null,
  lastError: null,
  messagesSentCount: 0,
  qrDataUrl: null,
  details: {},
};

function getStatus() {
  return { ...status, details: { ...status.details } };
}

function setState(state, extra = {}) {
  if (state) {
    status.state = state;
    status.qrRequired = state === STATES.QR_REQUIRED;
  }
  if (extra.lastError !== undefined) status.lastError = extra.lastError;
  if (extra.lastConnectedAt) status.lastConnectedAt = extra.lastConnectedAt;
  if (extra.lastMessageAt) status.lastMessageAt = extra.lastMessageAt;
  if (extra.messagesSentCount != null) {
    status.messagesSentCount = extra.messagesSentCount;
  }
  if (extra.qrDataUrl !== undefined) status.qrDataUrl = extra.qrDataUrl;
  if (extra.details) status.details = { ...status.details, ...extra.details };
  return getStatus();
}

function patchStatus(extra = {}) {
  return setState(null, extra);
}

module.exports = { STATES, getStatus, setState, patchStatus };
