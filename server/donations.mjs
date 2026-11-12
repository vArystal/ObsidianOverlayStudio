export class DonationProviderAdapter {
  id = 'unconfigured'
  async status() { return { state: 'SETUP_REQUIRED', provider: null, message: 'Choose and authorize the donation provider you actually use.' } }
  async verifyWebhook() { throw new Error('Donation provider is not configured') }
  async currentGoal() { return null }
}

export function createDonationRegistry() {
  const adapters = new Map()
  return {
    register(adapter) { adapters.set(adapter.id, adapter) },
    get(id) { return adapters.get(id) },
    async status() { return { state: 'SETUP_REQUIRED', provider: null, message: 'No donation provider selected. Manual amounts are not verified payments.' } },
  }
}
