// =====================================================================
// API client for the admin PC console
// =====================================================================
const API = (function() {
  const BASE = '/api';

  function getToken() {
    try { return localStorage.getItem('xzd_admin_token') || ''; } catch (e) { return ''; }
  }
  function setToken(t) {
    try { localStorage.setItem('xzd_admin_token', t); } catch (e) {}
  }
  function clearToken() {
    try { localStorage.removeItem('xzd_admin_token'); } catch (e) {}
  }

  async function request(path, options = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.body ? {} : {},
      options.headers || {}
    );
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(BASE + path, Object.assign({ headers }, options));
    if (res.status === 401) {
      clearToken();
      throw new Error('登录已过期');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || '请求失败');
    return data;
  }

  return {
    getToken, setToken, clearToken,
    // Auth
    login: (phone, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
    me: () => request('/auth/me'),
    // Products
    listProducts: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/products' + (q ? '?' + q : ''));
    },
    toggleProduct: (id) => request(`/products/${id}/toggle-active`, { method: 'POST' }),
    adjustStock: (id, delta) => request(`/products/${id}/stock`, { method: 'POST', body: JSON.stringify({ delta }) }),
    createProduct: (data) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct: (id, data) => request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    // Orders
    listOrders: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/orders' + (q ? '?' + q : ''));
    },
    shipOrder: (id) => request(`/orders/${id}/ship`, { method: 'POST' }),
    confirmOrder: (id) => request(`/orders/${id}/confirm`, { method: 'POST' }),
    cancelOrder: (id) => request(`/orders/${id}/cancel`, { method: 'POST' }),
    // Admin
    listUsers: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/users' + (q ? '?' + q : ''));
    },
    listPartners: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/partners' + (q ? '?' + q : ''));
    },
    togglePartner: (id) => request(`/users/${id}/toggle-partner`, { method: 'POST' }),
    createUser: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id, data) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    listCommissions: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/commissions' + (q ? '?' + q : ''));
    },
    settleCommission: (id) => request(`/commissions/${id}/settle`, { method: 'POST' }),
    dashboard: () => request('/stats/dashboard'),
  };
})();
