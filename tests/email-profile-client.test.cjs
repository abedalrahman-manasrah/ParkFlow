const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { create, act } = require('react-test-renderer');
const { QueryClient, QueryClientProvider } = require('@tanstack/react-query');
const { createClientLoader } = require('./helpers/client-loader.cjs');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const calls = [], routes = [], persisted = new Map(), services = {};
const native = name => props => React.createElement(name, props, props.children);
const storage = {
  getItem: async key => persisted.get(key) ?? null,
  setItem: async (key, value) => { persisted.set(key, value); },
  removeItem: async key => { persisted.delete(key); },
};
const ui = Object.fromEntries(['AppButton', 'AppHeader', 'AppText', 'Avatar', 'Card', 'DetailRow', 'Divider', 'InlineNotice', 'Screen', 'TextField'].map(name => [name, native(name)]));
// Exercise the real profile screen, session hook, HTTP service, locale and auth
// store. Native rendering/navigation and device/network I/O remain external.
const load = createClientLoader({ stubs: {
  'react-native': { View: native('View'), Platform: { OS: 'web' }, I18nManager: { allowRTL() {} } },
  'expo-haptics': {},
  'expo-router': { useRouter: () => ({ back: () => routes.push('back') }) },
  '@parkflow/client/components/ui': ui,
  '@parkflow/client/services': { services },
  '@parkflow/client/services/storage': { appStorage: storage, secureStorage: storage, STORAGE_KEYS: { authSession: 'auth', preferences: 'preferences' } },
  '@parkflow/client/services/http/apiClient': { api: (url, options) => new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })) },
} });
services.profile = load('@parkflow/client/services/http/profileService').httpProfileService;
const PersonalInfoScreen = load('apps/customer/app/profile/personal.tsx').default;
const { useAuthStore } = load('@parkflow/client/store/authStore');
let renderer, client;
const user = overrides => ({
  id: 'email-user', fullName: 'Email Customer', email: 'customer@example.com', phone: null,
  emailVerifiedAt: '2026-10-14T12:00:00Z', phoneVerifiedAt: null, role: 'USER',
  profileCompletedAt: '2026-10-14T12:00:00Z', createdAt: '2026-10-14T12:00:00Z', nationalIdMasked: null,
  ...overrides,
});
beforeEach(() => {
  calls.length = 0; routes.length = 0; persisted.clear();
  useAuthStore.setState({ user: undefined, session: undefined, hydrated: true });
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });
});
afterEach(async () => { await act(async () => renderer?.unmount()); client.clear(); renderer = undefined; });
const field = label => renderer.root.findAllByType('TextField').find(node => node.props.label === label);
async function settle(index, result) {
  assert.ok(calls[index], `Expected profile request ${index}`);
  await act(async () => { calls[index].resolve(result); await new Promise(resolve => setTimeout(resolve, 10)); });
}
async function mount(current) {
  useAuthStore.setState({ user: current });
  await act(async () => { renderer = create(React.createElement(QueryClientProvider, { client }, React.createElement(PersonalInfoScreen))); });
  assert.equal(calls[0].url, '/users/me');
  await settle(0, current);
}
async function enter(label, value) {
  const input = field(label);
  assert.ok(input, `Expected field ${label}`);
  await act(async () => input.props.onChangeText(value));
}
async function save() { await act(async () => renderer.root.findByType('AppButton').props.onPress()); }

test('verified email customers can update their name and national ID without a phone', async () => {
  const current = user();
  await mount(current);
  const nationalId = field('New national ID (optional)');
  assert.ok(nationalId, 'Verified email should enable national ID replacement');
  const email = field('Email');
  assert.ok(email, 'The sign-in email remains visible');
  assert.equal(email.props.editable, false);
  await enter('Full name', '  Updated Customer  ');
  await enter('New national ID (optional)', '١٢٣٤٥٦٧٨٩');
  await save();
  assert.equal(calls[1].url, '/users/me');
  assert.deepEqual(calls[1].options, { method: 'PATCH', body: { fullName: 'Updated Customer', nationalId: '123456789' } });
  await settle(1, user({ fullName: 'Updated Customer', nationalIdMasked: '*****6789' }));
  assert.equal(useAuthStore.getState().user.fullName, 'Updated Customer');
  assert.equal(useAuthStore.getState().user.email, 'customer@example.com');
  assert.deepEqual(routes, ['back']);
});

test('a verified primary email stays read-only when the customer also has a verified phone', async () => {
  await mount(user({ phone: '+970599123456', phoneVerifiedAt: '2026-10-14T12:00:00Z' }));
  const email = field('Email');
  assert.ok(email);
  assert.equal(email.props.editable, false);
  await enter('Full name', 'Updated Customer');
  if (email.props.onChangeText) await act(async () => email.props.onChangeText('replacement@example.com'));
  await save();
  assert.deepEqual(calls[1].options.body, { fullName: 'Updated Customer' });
});

test('phone customers retain editable unverified contact email', async () => {
  await mount(user({ emailVerifiedAt: null, phone: '+970599123456', phoneVerifiedAt: '2026-10-14T12:00:00Z' }));
  await enter('Email', '  Contact@Example.com  ');
  await save();
  assert.deepEqual(calls[1].options.body, { fullName: 'Email Customer', email: 'contact@example.com' });
});
