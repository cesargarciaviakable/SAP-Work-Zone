const cds = require('@sap/cds');

/**
 * MockEngine — default implementation for local/dev.
 * All methods are no-ops; approval logic runs entirely in CAP handlers.
 */
class MockEngine {
  async submit(taskId, userId) {
    console.log(`[MockEngine] submit task ${taskId} by ${userId} — local mock, no-op`);
  }
  async onApproved(approvalRequest) {
    console.log(`[MockEngine] approved ${approvalRequest.ID} — local mock, no-op`);
  }
  async onRejected(approvalRequest, comment) {
    console.log(`[MockEngine] rejected ${approvalRequest.ID}: "${comment}" — local mock, no-op`);
  }
}

/**
 * BTPWorkflowEngine — stub for real SAP BTP Workflow integration.
 * Not implemented — reserved for production use.
 */
class BTPWorkflowEngine {
  constructor(credentials) {
    this.credentials = credentials;
  }
  async submit(taskId, userId) {
    throw new Error('BTPWorkflowEngine.submit is not yet implemented');
  }
  async onApproved(approvalRequest) {
    throw new Error('BTPWorkflowEngine.onApproved is not yet implemented');
  }
  async onRejected(approvalRequest, comment) {
    throw new Error('BTPWorkflowEngine.onRejected is not yet implemented');
  }
}

/**
 * Factory function that returns the appropriate engine based on
 * cds.env.requires.workflow.kind configuration.
 * Defaults to MockEngine if no config or kind !== 'btp'.
 */
function createWorkflowEngine() {
  const cfg = cds.env.requires && cds.env.requires.workflow;
  if (cfg && cfg.kind === 'btp') {
    return new BTPWorkflowEngine(cfg.credentials);
  }
  return new MockEngine();
}

module.exports = { createWorkflowEngine, MockEngine, BTPWorkflowEngine };