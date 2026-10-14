const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createClientLoader } = require('./helpers/client-loader.cjs');

const users = {
  customer: { id: 'customer-user', fullName: 'Customer', role: 'USER', profileCompletedAt: '2026-10-07', locale: 'en' },
  management: { id: 'management-user', fullName: 'Administrator', role: 'ADMIN', profileCompletedAt: '2026-10-07', locale: 'en' },
};
const sessions = Object.fromEntries(Object.entries(users).map(([application, user]) => [application, {
  userId: user.id,
  accessToken: `test-access-${application}`,
  refreshToken: `test-refresh-${application}`,
  expiresAt: '2099-01-01T00:00:00Z',
}]));

function sharedBrowserStorage() {
  const values = new Map();
  return {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
}

function applicationStore(application, browserStorage) {
  const load = createClientLoader({ application, stubs: {
    'react-native': { Platform: { OS: 'web' } },
    '@react-native-async-storage/async-storage': browserStorage,
    'expo-secure-store': {
      getItemAsync() { throw new Error('Web sessions must use browser storage'); },
      setItemAsync() { throw new Error('Web sessions must use browser storage'); },
      deleteItemAsync() { throw new Error('Web sessions must use browser storage'); },
    },
  } });
  return load('@parkflow/client/store/authStore').useAuthStore;
}

async function withAuthServer(run) {
  const previousFetch = global.fetch;
  const previousBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  process.env.EXPO_PUBLIC_API_BASE_URL = 'https://parkflow-test.invalid/api/v1';
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://parkflow-test.invalid/api/v1/auth/me');
    const application = Object.keys(sessions).find(name => options.headers.Authorization === `Bearer ${sessions[name].accessToken}`);
    assert.ok(application, 'Hydration must authenticate with a persisted frontend session');
    return { ok: true, status: 200, json: async () => users[application] };
  };
  try { await run(); }
  finally {
    global.fetch = previousFetch;
    if (previousBaseUrl === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
    else process.env.EXPO_PUBLIC_API_BASE_URL = previousBaseUrl;
  }
}

test('customer and management logins rehydrate their own sessions on the same browser origin', async () => {
  await withAuthServer(async () => {
    const storage = sharedBrowserStorage();
    const customer = applicationStore('customer', storage);
    const management = applicationStore('management', storage);
    await customer.getState().signIn(sessions.customer, users.customer);
    await management.getState().signIn(sessions.management, users.management);
    assert.equal(customer.getState().user.id, 'customer-user');
    assert.equal(management.getState().user.id, 'management-user');

    const reloadedCustomer = applicationStore('customer', storage);
    const reloadedManagement = applicationStore('management', storage);
    await reloadedCustomer.getState().hydrate();
    await reloadedManagement.getState().hydrate();
    assert.equal(reloadedCustomer.getState().hydrated, true);
    assert.equal(reloadedCustomer.getState().user?.id, 'customer-user');
    assert.equal(reloadedCustomer.getState().session?.userId, 'customer-user');
    assert.equal(reloadedManagement.getState().hydrated, true);
    assert.equal(reloadedManagement.getState().user?.id, 'management-user');
    assert.equal(reloadedManagement.getState().session?.userId, 'management-user');
  });
});

test('management logout preserves the persisted customer login', async () => {
  await withAuthServer(async () => {
    const storage = sharedBrowserStorage();
    const customer = applicationStore('customer', storage);
    const management = applicationStore('management', storage);
    await customer.getState().signIn(sessions.customer, users.customer);
    await management.getState().signIn(sessions.management, users.management);
    await management.getState().signOut();
    assert.equal(management.getState().session, undefined);
    assert.equal(customer.getState().user?.id, 'customer-user');

    const reloadedCustomer = applicationStore('customer', storage);
    const reloadedManagement = applicationStore('management', storage);
    await reloadedCustomer.getState().hydrate();
    await reloadedManagement.getState().hydrate();
    assert.equal(reloadedCustomer.getState().session?.userId, 'customer-user');
    assert.equal(reloadedCustomer.getState().user?.id, 'customer-user');
    assert.equal(reloadedManagement.getState().session, undefined);
    assert.equal(reloadedManagement.getState().user, undefined);
  });
});

test('a customer frontend does not hydrate a management-only login', async () => {
  await withAuthServer(async () => {
    const storage = sharedBrowserStorage();
    await applicationStore('management', storage).getState().signIn(sessions.management, users.management);
    const customer = applicationStore('customer', storage);
    await customer.getState().hydrate();
    assert.equal(customer.getState().hydrated, true);
    assert.equal(customer.getState().session?.userId, undefined);
    assert.equal(customer.getState().user, undefined);
  });
});
